import { randomUUID } from "node:crypto";
import {
  canTransitionAppointment,
  canTransitionContract,
  canTransitionRentalRequest,
  appointmentOverlapsContract,
  canRequestContractRenewal,
  claimValues,
  contractEndTimestamp,
  contractRenewalDeadline,
  stableHash
} from "./domain.mjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const tableName = process.env.TABLE_NAME;
const storageBucketName = process.env.STORAGE_BUCKET_NAME;
const processedBucketName = process.env.PROCESSED_BUCKET_NAME;
const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  ...(dynamoEndpoint ? {
    endpoint: dynamoEndpoint,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local"
    }
  } : {})
}));
const s3 = new S3Client({});

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Max-Age": "300"
};

const officeStatuses = new Set(["AVAILABLE", "RESERVED", "LEASED", "INACTIVE"]);
const rentalRequestStatuses = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
const contractStatuses = new Set(["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "EXPIRED", "TERMINATED"]);
const blockingRentalRequestStatuses = new Set(["PENDING", "APPROVED"]);
const blockingContractStatuses = new Set(["DRAFT", "PENDING_SIGNATURE", "ACTIVE"]);
const protectedContractDeleteStatuses = new Set(["PENDING_SIGNATURE", "ACTIVE"]);
const appointmentStatuses = new Set(["REQUESTED", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED"]);
const activeAppointmentStatuses = new Set(["REQUESTED", "CONFIRMED"]);
const maxOfficeImageBytes = 10 * 1024 * 1024;
const maxAvatarBytes = 2 * 1024 * 1024;
const maxContractBytes = 15 * 1024 * 1024;

export async function handler(event) {
  try {
    const request = normalizeRequest(event);

    if (request.method === "OPTIONS") {
      return json(204, {});
    }

    const route = await dispatch(request);
    return route.raw
      ? rawResponse(route.statusCode, route.body, route.headers)
      : json(route.statusCode, route.body);
  } catch (error) {
    console.error(error);
    const statusCode = error.statusCode ?? 500;
    return json(statusCode, {
      message: statusCode >= 500
        ? "Hệ thống đang bận. Vui lòng thử lại sau."
        : error.message ?? "Không thể hoàn tất yêu cầu."
    });
  }
}

async function dispatch(request) {
  const { method, path } = request;

  if (method === "GET" && path === "/offices") return ok(await listOffices(request));
  if (method === "GET" && /^\/offices\/[^/]+$/.test(path)) return ok(await getOfficeById(pathParam(path, 1)));

  if (method === "POST" && path === "/offices") {
    requireAdmin(request);
    return created(await createOffice(request));
  }

  if (method === "PATCH" && /^\/offices\/[^/]+$/.test(path)) {
    requireAdmin(request);
    return ok(await updateOffice(request, pathParam(path, 1)));
  }

  if (method === "DELETE" && /^\/offices\/[^/]+$/.test(path)) {
    requireAdmin(request);
    return ok(await deleteOffice(request, pathParam(path, 1)));
  }

  if (method === "POST" && path === "/rental-requests") {
    requireAuthenticated(request);
    return created(await createRentalRequest(request));
  }

  if (method === "GET" && /^\/rental-requests\/[^/]+$/.test(path)) {
    requireAuthenticated(request);
    return ok(await getRentalRequestForCurrentUser(request, pathParam(path, 1)));
  }

  if (method === "POST" && /^\/contracts\/[^/]+\/upload-url$/.test(path)) {
    requireAuthenticated(request);
    return ok(await createContractUploadUrl(request, pathParam(path, 1)));
  }

  if (method === "POST" && /^\/contracts\/[^/]+\/file$/.test(path)) {
    requireAuthenticated(request);
    return ok(await confirmContractFile(request, pathParam(path, 1)));
  }

  if (method === "POST" && path === "/appointments") {
    requireAuthenticated(request);
    return created(await createAppointment(request));
  }

  if (method === "GET" && path === "/me/rental-requests") {
    requireAuthenticated(request);
    return ok(await listCurrentUserRentalRequests(request));
  }

  if (method === "GET" && path === "/me/contracts") {
    requireAuthenticated(request);
    return ok(await listCurrentUserContracts(request));
  }

  if (method === "POST" && /^\/me\/contracts\/[^/]+\/renewal-request$/.test(path)) {
    requireAuthenticated(request);
    return created(await createContractRenewalRequest(request, pathParam(path, 2)));
  }

  if (method === "GET" && path === "/me/appointments") {
    requireAuthenticated(request);
    return ok(await listCurrentUserAppointments(request));
  }

  if (method === "PATCH" && /^\/me\/appointments\/[^/]+$/.test(path)) {
    requireAuthenticated(request);
    return ok(await cancelCurrentUserAppointment(request, pathParam(path, 2)));
  }

  if (method === "GET" && path === "/me/profile") {
    requireAuthenticated(request);
    return ok(await getCurrentUserProfile(request));
  }

  if (method === "PATCH" && path === "/me/profile") {
    requireAuthenticated(request);
    return ok(await updateCurrentUserProfile(request));
  }

  if (method === "POST" && path === "/me/avatar-upload-url") {
    requireAuthenticated(request);
    return ok(await createAvatarUploadUrl(request));
  }

  if (method === "POST" && path === "/me/avatar") {
    requireAuthenticated(request);
    return ok(await confirmAvatarUpload(request));
  }

  if (path === "/admin" || path.startsWith("/admin/")) {
    requireAdmin(request);
    return await dispatchAdmin(request);
  }

  throw httpError(404, "Route không tồn tại.");
}

async function dispatchAdmin(request) {
  const { method, path } = request;

  if (method === "GET" && (path === "/admin" || path === "/admin/stats")) return ok(await getAdminStats());

  if (method === "GET" && path === "/admin/offices") return ok(await listOffices(request, { includeInactive: true }));
  if (method === "POST" && path === "/admin/offices") return created(await createOffice(request));
  if (method === "GET" && /^\/admin\/offices\/[^/]+$/.test(path)) {
    return ok(await getOfficeById(pathParam(path, 2), { includeInactive: true }));
  }
  if (method === "PATCH" && /^\/admin\/offices\/[^/]+$/.test(path)) return ok(await updateOffice(request, pathParam(path, 2)));
  if (method === "DELETE" && /^\/admin\/offices\/[^/]+$/.test(path)) return ok(await deleteOffice(request, pathParam(path, 2)));
  if (method === "POST" && /^\/admin\/offices\/[^/]+\/image-upload-url$/.test(path)) {
    return ok(await createOfficeImageUploadUrl(request, pathParam(path, 2)));
  }
  if (method === "POST" && /^\/admin\/offices\/[^/]+\/image$/.test(path)) {
    return ok(await confirmOfficeImageUpload(request, pathParam(path, 2)));
  }

  if (method === "GET" && path === "/admin/rental-requests") return ok(await listRentalRequests(request));
  if (method === "POST" && path === "/admin/rental-requests") return created(await createRentalRequest(request));
  if (method === "GET" && /^\/admin\/rental-requests\/[^/]+$/.test(path)) {
    return ok(await getRentalRequestById(pathParam(path, 2)));
  }
  if (method === "PATCH" && /^\/admin\/rental-requests\/[^/]+$/.test(path)) {
    return ok(await updateRentalRequestStatus(request, pathParam(path, 2)));
  }
  if (method === "DELETE" && /^\/admin\/rental-requests\/[^/]+$/.test(path)) {
    return ok(await deleteRentalRequest(request, pathParam(path, 2)));
  }

  if (method === "GET" && path === "/admin/contracts") return ok(await listContracts(request));
  if (method === "POST" && path === "/admin/contracts") return created(await createContract(request));
  if (method === "GET" && /^\/admin\/contracts\/[^/]+$/.test(path)) return ok(await getContractById(pathParam(path, 2)));
  if (method === "PATCH" && /^\/admin\/contracts\/[^/]+$/.test(path)) return ok(await updateContract(request, pathParam(path, 2)));
  if (method === "DELETE" && /^\/admin\/contracts\/[^/]+$/.test(path)) return ok(await deleteContract(request, pathParam(path, 2)));
  if (method === "POST" && /^\/admin\/contracts\/[^/]+\/upload-url$/.test(path)) {
    return ok(await createContractUploadUrl(request, pathParam(path, 2)));
  }
  if (method === "POST" && /^\/admin\/contracts\/[^/]+\/file$/.test(path)) {
    return ok(await confirmContractFile(request, pathParam(path, 2)));
  }

  if (method === "GET" && path === "/admin/appointments") return ok(await listAppointments(request));
  if (method === "POST" && path === "/admin/appointments") return created(await createAppointment(request));
  if (method === "GET" && /^\/admin\/appointments\/[^/]+$/.test(path)) {
    return ok(await getAppointmentById(pathParam(path, 2)));
  }
  if (method === "PATCH" && /^\/admin\/appointments\/[^/]+$/.test(path)) {
    return ok(await updateAppointmentStatus(request, pathParam(path, 2)));
  }
  if (method === "DELETE" && /^\/admin\/appointments\/[^/]+$/.test(path)) {
    return ok(await deleteAppointment(request, pathParam(path, 2)));
  }

  if (method === "GET" && /^\/admin\/reports\/(offices|customers|revenue)\.csv$/.test(path)) {
    return await exportAdminReport(pathParam(path, 2));
  }

  if (method === "GET" && path === "/admin/customers") return ok(await listCustomers(request));
  if (method === "POST" && path === "/admin/customers") return created(await createCustomer(request));
  if (method === "GET" && /^\/admin\/customers\/[^/]+\/overview$/.test(path)) {
    return ok(await getCustomerOverview(pathParam(path, 2)));
  }
  if (method === "GET" && /^\/admin\/customers\/[^/]+$/.test(path)) return ok(await getCustomerById(pathParam(path, 2)));
  if (method === "PATCH" && /^\/admin\/customers\/[^/]+$/.test(path)) return ok(await updateCustomer(request, pathParam(path, 2)));
  if (method === "DELETE" && /^\/admin\/customers\/[^/]+$/.test(path)) return ok(await deleteCustomer(request, pathParam(path, 2)));

  throw httpError(404, "Admin route không tồn tại.");
}

async function listOffices(request, options = {}) {
  const query = request.query.q?.toLowerCase();
  const status = request.query.status;
  const buildingId = request.query.buildingId?.toLowerCase();
  const floor = request.query.floor === undefined ? undefined : Number(request.query.floor);
  const result = await queryFilteredEntity(
    "OFFICE",
    readLimit(request.query.limit, 50),
    request.query.nextToken,
    (office) => (
      (options.includeInactive || office.status !== "INACTIVE") &&
      (!status || office.status === status) &&
      (!buildingId || office.buildingId?.toLowerCase() === buildingId) &&
      (floor === undefined || office.floor === floor) &&
      (!query || `${office.title} ${office.address} ${office.buildingName ?? ""} ${office.roomNumber ?? ""}`.toLowerCase().includes(query))
    )
  );
  const items = await hydrateOfficeImageUrls((result.Items ?? []).map(toOffice));

  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function getOfficeById(id, options = {}) {
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(id) }));
  if (!result.Item || (!options.includeInactive && result.Item.status === "INACTIVE")) {
    throw httpError(404, "Không tìm thấy văn phòng.");
  }
  return { item: await hydrateOfficeImageUrl(toOffice(result.Item)) };
}

async function createOffice(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = body.id ? normalizeId(body.id, "id") : randomUUID();
  const location = parseOfficeLocation(body);

  const item = {
    ...officeKey(id),
    GSI1PK: "ENTITY#OFFICE",
    GSI1SK: `OFFICE#${now}#${id}`,
    GSI2PK: `OFFICE#${id}`,
    GSI2SK: "METADATA",
    entityType: "OFFICE",
    id,
    title: requireString(body.title, "title"),
    address: requireString(body.address, "address"),
    areaSqm: requirePositiveNumber(body.areaSqm, "areaSqm"),
    monthlyPrice: requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
    status: requireEnum(body.status ?? "AVAILABLE", officeStatuses, "status"),
    description: optionalString(body.description),
    imageUrl: optionalString(body.imageUrl),
    amenities: body.amenities === undefined ? [] : requireStringArray(body.amenities, "amenities"),
    ...location,
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? "unknown",
    updatedBy: request.claims.sub ?? "unknown"
  };

  const locationKey = item.status === "INACTIVE" ? null : officeLocationKey(item);
  try {
    if (locationKey) {
      await dynamo.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: item,
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          },
          {
            Put: {
              TableName: tableName,
              Item: officeLocationLock(item, now),
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          }
        ]
      }));
    } else {
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      }));
    }
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Tòa nhà, tầng và số phòng này đã được sử dụng.");
    }
    throw error;
  }

  return { item: await hydrateOfficeImageUrl(toOffice(item)) };
}

async function updateOffice(request, id) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const current = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(id) }));
  if (!current.Item) throw httpError(404, "Không tìm thấy văn phòng.");
  if (body.status !== undefined) {
    const nextStatus = requireEnum(body.status, officeStatuses, "status");
    await assertOfficeStatusUpdateAllowed(current.Item, nextStatus);
  }
  const location = parseOfficeLocation(body, current.Item);
  const result = await updateOfficeWithLocationLock(
    current.Item,
    pickDefined({
      title: body.title === undefined ? undefined : requireString(body.title, "title"),
      address: body.address === undefined ? undefined : requireString(body.address, "address"),
      areaSqm: body.areaSqm === undefined ? undefined : requirePositiveNumber(body.areaSqm, "areaSqm"),
      monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
      status: body.status === undefined ? undefined : requireEnum(body.status, officeStatuses, "status"),
      description: body.description === undefined ? undefined : optionalString(body.description),
      imageUrl: body.imageUrl === undefined ? undefined : optionalString(body.imageUrl),
      amenities: body.amenities === undefined ? undefined : requireStringArray(body.amenities, "amenities"),
      ...location,
      updatedAt: now,
      updatedBy: request.claims.sub ?? "unknown"
    })
  );
  return { item: await hydrateOfficeImageUrl(toOffice(result.Attributes)) };
}

  async function deleteOffice(request, id) {
    const current = await assertOfficeCanBeDeleted(id);
    const now = new Date().toISOString();
    const result = await updateEntityWithOptionalLockDelete(
      current,
      { status: "INACTIVE", deletedAt: now, deletedBy: request.claims.sub ?? "unknown", updatedAt: now, updatedBy: request.claims.sub ?? "unknown" },
      officeLocationKey(current),
      "Văn phòng vừa thay đổi trạng thái. Vui lòng tải lại dữ liệu trước khi xóa."
    );
  return { item: await hydrateOfficeImageUrl(toOffice(result.Attributes)) };
}

async function createOfficeImageUploadUrl(request, officeId) {
  await getOfficeById(officeId, { includeInactive: true });

  const body = parseBody(request.event);
  const fileName = sanitizeFileName(body.fileName ?? "office.jpg");
  const contentType = requireImageContentType(body.contentType);
  requireFileSize(body.fileSize, maxOfficeImageBytes, "Ảnh văn phòng");
  const extension = extensionFromContentType(contentType);
  const objectKey = `images/offices/${officeId}/${randomUUID()}-${fileName.replace(/\.[^.]+$/, "")}.${extension}`;

  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: storageBucketName,
    Key: objectKey,
    ContentType: contentType
  }), { expiresIn: 900 });

  return {
    bucket: storageBucketName,
    key: objectKey,
    uploadUrl,
    expiresIn: 900
  };
}

async function confirmOfficeImageUpload(request, officeId) {
  const body = parseBody(request.event);
  const key = requireString(body.key, "key");
  const expectedPrefix = `images/offices/${officeId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw httpError(400, "Đường dẫn ảnh văn phòng không hợp lệ.");
  }

  await assertS3ImageObject(storageBucketName, key, maxOfficeImageBytes, "Ảnh văn phòng");
  const current = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(officeId) }));
  if (!current.Item) throw httpError(404, "Không tìm thấy văn phòng.");

  const processedImageKey = key.replace(/\.[^.]+$/, ".webp");
  let processedImageReady = false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: processedBucketName, Key: processedImageKey }));
    processedImageReady = true;
  } catch {
    // The S3 event processor may still be running. It will mark the item ready later.
  }

  const now = new Date().toISOString();
  const result = await updateItem({
    key: officeKey(officeId),
    updates: {
      imageUrl: "",
      imageKey: key,
      processedImageKey: processedImageReady ? processedImageKey : "",
      processedImageReady,
      updatedAt: now,
      updatedBy: request.claims.sub ?? "admin"
    },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });

  await deleteReplacedOfficeImages(current.Item, key, processedImageKey);
  return { item: await hydrateOfficeImageUrl(toOffice(result.Attributes)) };
}

async function deleteReplacedOfficeImages(previousOffice, currentImageKey, currentProcessedKey) {
  const deletes = [];
  if (previousOffice.imageKey && previousOffice.imageKey !== currentImageKey) {
    deletes.push(s3.send(new DeleteObjectCommand({ Bucket: storageBucketName, Key: previousOffice.imageKey })));
  }
  if (previousOffice.processedImageKey && previousOffice.processedImageKey !== currentProcessedKey) {
    deletes.push(s3.send(new DeleteObjectCommand({ Bucket: processedBucketName, Key: previousOffice.processedImageKey })));
  }
  await Promise.all(deletes.map((operation) => operation.catch(() => undefined)));
}

async function createRentalRequest(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = randomUUID();
  const officeId = requireString(body.officeId, "officeId");
  const email = resolveCustomerEmail(request, body.email);
  const customerName = requireString(body.customerName, "customerName");

  await assertOfficeAcceptsRequests(officeId);
  await assertNoRenewalPriorityWindow(officeId);
  await assertNoOpenRentalRequest(officeId, email);
  await upsertCustomerFromRequest({ request, email, customerName, phone: body.phone, now });

  const item = {
    PK: `OFFICE#${officeId}`,
    SK: `REQUEST#${id}`,
    GSI1PK: "ENTITY#RENTAL_REQUEST",
    GSI1SK: `REQUEST#${now}#${id}`,
    GSI2PK: `REQUEST#${id}`,
    GSI2SK: "METADATA",
    GSI3PK: `CUSTOMER#${email}`,
    GSI3SK: `REQUEST#${now}#${id}`,
    entityType: "RENTAL_REQUEST",
    id,
    officeId,
    customerName,
    email,
    phone: optionalString(body.phone),
    message: optionalString(body.message),
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? email,
    updatedBy: request.claims.sub ?? email
  };

  await createRentalRequestWithLock(item);
  return { item: toRentalRequest(item) };
}

async function createContractRenewalRequest(request, contractId) {
  const body = parseBody(request.event);
  const contract = await getRawByGsi2(`CONTRACT#${contractId}`, "Không tìm thấy hợp đồng cần gia hạn.");
  const customer = await assertCustomerExists(contract.customerId);
  if (!entityBelongsToCurrentUser({ ...contract, email: customer.email }, request)) {
    throw httpError(403, "Bạn không có quyền gửi yêu cầu gia hạn hợp đồng này.");
  }
  const renewalDeadline = resolveContractRenewalDeadline(contract);
  const renewableContract = { ...contract, renewalDeadline };
  if (!canRequestContractRenewal(renewableContract)) {
    throw httpError(409, "Hợp đồng chưa đến thời gian gia hạn hoặc thời hạn ưu tiên gia hạn đã kết thúc.");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const email = requireEmail(request.claims.email ?? contract.customerId, "email");
  await assertNoOpenRentalRequest(contract.officeId, email);
  await assertNoOtherActiveContract(contract.officeId, contract.id);

  const item = {
    PK: `OFFICE#${contract.officeId}`,
    SK: `REQUEST#${id}`,
    GSI1PK: "ENTITY#RENTAL_REQUEST",
    GSI1SK: `REQUEST#${now}#${id}`,
    GSI2PK: `REQUEST#${id}`,
    GSI2SK: "METADATA",
    GSI3PK: `CUSTOMER#${email}`,
    GSI3SK: `REQUEST#${now}#${id}`,
    entityType: "RENTAL_REQUEST",
    requestType: "RENEWAL",
    renewalContractId: contract.id,
    id,
    officeId: contract.officeId,
    customerName: customer.name ?? request.claims.name ?? email,
    email,
    phone: customer.phone,
    message: optionalString(body.message) || "Yêu cầu gia hạn hợp đồng thuê văn phòng.",
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? email,
    updatedBy: request.claims.sub ?? email
  };

  await createRentalRequestWithLock(item);
  return { item: toRentalRequest(item) };
}

async function getRentalRequestForCurrentUser(request, id) {
  const response = await getRentalRequestById(id);
  const item = response.item;
  if (!isAdmin(request) && item.createdBy !== request.claims.sub && item.email !== request.claims.email) {
    throw httpError(403, "Bạn không có quyền xem yêu cầu thuê này.");
  }
  return response;
}

async function getRentalRequestById(id) {
  const item = await getRawByGsi2(`REQUEST#${id}`, "Không tìm thấy yêu cầu thuê.");
  return { item: toRentalRequest(item) };
}

async function listRentalRequests(request) {
  const query = request.query.q?.toLowerCase();
  const result = await queryFilteredEntity(
    "RENTAL_REQUEST",
    readLimit(request.query.limit, 100),
    request.query.nextToken,
    (item) => !item.deletedAt &&
      (!request.query.status || item.status === request.query.status) &&
      (!request.query.officeId || item.officeId === request.query.officeId) &&
      (!query || `${item.customerName} ${item.email} ${item.phone ?? ""} ${item.officeId}`.toLowerCase().includes(query))
  );
  const items = (result.Items ?? []).map(toRentalRequest);
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function listCurrentUserRentalRequests(request) {
  const items = (await queryCustomerEntities(request, "REQUEST")).filter((item) => !item.deletedAt);
  return { items: items.map(toRentalRequest), count: items.length };
}

async function updateRentalRequestStatus(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`REQUEST#${id}`, "Không tìm thấy yêu cầu thuê.");
  const nextStatus = requireEnum(body.status, rentalRequestStatuses, "status");
  assertRentalRequestTransition(current.status, nextStatus);
  if (current.convertedAt && nextStatus !== current.status) {
    throw httpError(409, "Yêu cầu thuê đã được chuyển thành hợp đồng. Vui lòng xử lý hợp đồng liên quan thay vì đổi trạng thái yêu cầu.");
  }
  const result = await updateRentalRequestWithLock(current, {
    status: nextStatus,
    decisionNote: body.decisionNote === undefined ? undefined : optionalString(body.decisionNote),
    updatedAt: new Date().toISOString(),
    updatedBy: request.claims.sub ?? "admin"
  });
  return { item: toRentalRequest(result.Attributes) };
}

async function deleteRentalRequest(request, id) {
  const current = await getRawByGsi2(`REQUEST#${id}`, "Không tìm thấy yêu cầu thuê.");
  await assertRentalRequestCanBeDeleted(current);
  const now = new Date().toISOString();
  const result = await updateRentalRequestWithLock(current, {
    deletedAt: now,
    deletedBy: request.claims.sub ?? "admin",
    updatedAt: now,
    updatedBy: request.claims.sub ?? "admin"
  });
  return { item: toRentalRequest(result.Attributes), deleted: true };
}

async function createAppointment(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = randomUUID();
  const officeId = requireString(body.officeId, "officeId");
  const email = resolveCustomerEmail(request, body.email);
  const customerName = requireString(body.customerName, "customerName");
  const scheduledAt = requireFutureDateTime(body.scheduledAt, "scheduledAt");
  await assertOfficeAcceptsAppointments(officeId);
  await assertNoDuplicateAppointment(officeId, scheduledAt);
  await assertAppointmentOutsideContractPeriods(officeId, scheduledAt);
  await upsertCustomerFromRequest({ request, email, customerName, phone: body.phone, now });

  const item = {
    PK: `OFFICE#${officeId}`,
    SK: `APPOINTMENT#${id}`,
    GSI1PK: "ENTITY#APPOINTMENT",
    GSI1SK: `APPOINTMENT#${scheduledAt}#${id}`,
    GSI2PK: `APPOINTMENT#${id}`,
    GSI2SK: "METADATA",
    GSI3PK: `CUSTOMER#${email}`,
    GSI3SK: `APPOINTMENT#${scheduledAt}#${id}`,
    entityType: "APPOINTMENT",
    id,
    officeId,
    customerName,
    email,
    phone: optionalString(body.phone),
    scheduledAt,
    note: optionalString(body.note),
    status: "REQUESTED",
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? email,
    updatedBy: request.claims.sub ?? email
  };
  await createAppointmentWithLock(item);
  return { item: toAppointment(item) };
}

async function listAppointments(request) {
  const query = request.query.q?.toLowerCase();
  const dateFrom = request.query.dateFrom ? Date.parse(request.query.dateFrom) : undefined;
  const dateTo = request.query.dateTo ? Date.parse(request.query.dateTo) : undefined;
  const result = await queryFilteredEntity(
    "APPOINTMENT",
    readLimit(request.query.limit, 100),
    request.query.nextToken,
    (item) => !item.deletedAt &&
      (!request.query.status || item.status === request.query.status) &&
      (!request.query.officeId || item.officeId === request.query.officeId) &&
      (dateFrom === undefined || Date.parse(item.scheduledAt) >= dateFrom) &&
      (dateTo === undefined || Date.parse(item.scheduledAt) <= dateTo) &&
      (!query || `${item.customerName} ${item.email} ${item.phone ?? ""} ${item.officeId}`.toLowerCase().includes(query))
  );
  const items = (result.Items ?? []).map(toAppointment);
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function listCurrentUserAppointments(request) {
  const items = (await queryCustomerEntities(request, "APPOINTMENT")).filter((item) => !item.deletedAt);
  return { items: items.map(toAppointment), count: items.length };
}

async function getAppointmentById(id) {
  const item = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  return { item: toAppointment(item) };
}

async function updateAppointmentStatus(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  const status = body.status === undefined
    ? current.status
    : requireEnum(body.status, appointmentStatuses, "status");
  const scheduledAt = body.scheduledAt === undefined
    ? current.scheduledAt
    : requireFutureDateTime(body.scheduledAt, "scheduledAt");
  const isRescheduled = scheduledAt !== current.scheduledAt;
  if (isRescheduled && ["COMPLETED", "REJECTED", "CANCELLED"].includes(current.status)) {
    throw httpError(409, "Không thể đổi thời gian của lịch hẹn đã kết thúc.");
  }
  if (activeAppointmentStatuses.has(status) && Date.parse(scheduledAt) <= Date.now()) {
    throw httpError(400, "Lịch hẹn đang hoạt động phải có thời gian trong tương lai.");
  }
  assertAppointmentTransition(current.status, status, true);
  if (activeAppointmentStatuses.has(status)) {
    await assertAppointmentOutsideContractPeriods(current.officeId, scheduledAt);
  }
  const result = await updateAppointmentWithLock(current, {
    status,
    scheduledAt: isRescheduled ? scheduledAt : undefined,
    GSI1SK: isRescheduled ? `APPOINTMENT#${scheduledAt}#${current.id}` : undefined,
    adminNote: body.adminNote === undefined ? current.adminNote : optionalString(body.adminNote),
    updatedAt: new Date().toISOString(),
    updatedBy: request.claims.sub
  });
  return { item: toAppointment(result.Attributes) };
}

async function cancelCurrentUserAppointment(request, id) {
  const current = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  if (!entityBelongsToCurrentUser(current, request)) throw httpError(403, "Bạn không có quyền hủy lịch hẹn này.");
  assertAppointmentTransition(current.status, "CANCELLED", false);
  const result = await updateAppointmentWithLock(current, {
    status: "CANCELLED",
    updatedAt: new Date().toISOString(),
    updatedBy: request.claims.sub
  });
  return { item: toAppointment(result.Attributes) };
}

async function deleteAppointment(request, id) {
  const current = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  if (!["REJECTED", "CANCELLED"].includes(current.status)) {
    throw httpError(409, "Chỉ có thể xóa lịch hẹn đã hủy hoặc bị từ chối.");
  }
  if (Date.parse(current.scheduledAt) > Date.now()) {
    throw httpError(409, "Chưa thể xóa lịch hẹn trước thời gian đã đặt. Lịch sẽ được giữ để khách hàng theo dõi.");
  }
  const now = new Date().toISOString();
  const result = await updateAppointmentWithLock(current, {
    deletedAt: now,
    deletedBy: request.claims.sub ?? "admin",
    updatedAt: now,
    updatedBy: request.claims.sub ?? "admin"
  });
  return { item: toAppointment(result.Attributes), deleted: true };
}

async function createContract(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = body.id ? normalizeId(body.id, "id") : randomUUID();
  const officeId = requireString(body.officeId, "officeId");
  const customerId = requireString(body.customerId ?? body.customerEmail, "customerId").toLowerCase();
  const rentalRequestId = optionalString(body.rentalRequestId);
  const status = requireEnum(body.status ?? "DRAFT", contractStatuses, "status");
  const startDate = optionalContractDateTime(body.startDate, "startDate");
  const endDate = optionalContractDateTime(body.endDate, "endDate");

  const office = await assertOfficeExists(officeId);
  const customer = await assertCustomerExists(customerId);
  validateContractDates(startDate, endDate, status);
  const rentalRequest = rentalRequestId
    ? await assertRentalRequestMatchesContract(rentalRequestId, officeId, customerId)
    : null;
  if (rentalRequest?.requestType === "RENEWAL") {
    throw httpError(409, "Yêu cầu gia hạn phải được xử lý trên hợp đồng hiện tại, không tạo hợp đồng mới.");
  }
  if (["PENDING_SIGNATURE", "ACTIVE"].includes(status)) {
    await assertNoContractPeriodConflict(officeId, startDate, endDate);
    await assertNoAppointmentConflict(officeId, startDate, endDate);
  }

  const item = {
    PK: `OFFICE#${officeId}`,
    SK: `CONTRACT#${id}`,
    GSI1PK: "ENTITY#CONTRACT",
    GSI1SK: `CONTRACT#${now}#${id}`,
    GSI2PK: `CONTRACT#${id}`,
    GSI2SK: "METADATA",
    GSI3PK: `CUSTOMER#${customerId}`,
    GSI3SK: `CONTRACT#${now}#${id}`,
    entityType: "CONTRACT",
    id,
    officeId,
    customerId,
    rentalRequestId,
    title: optionalString(body.title) || `Hợp đồng thuê ${office.title ?? customer.name ?? "văn phòng"}`,
    status,
    startDate,
    endDate,
    monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
    fileKey: optionalString(body.fileKey),
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? "admin",
    updatedBy: request.claims.sub ?? "admin"
  };

  if (status === "ACTIVE") {
    await assertNoActiveContract(officeId);
    await activateNewContract(item, rentalRequest);
  } else {
    await dynamo.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    }));
  }
  return { item: toContract(item) };
}

async function listContracts(request) {
  const query = request.query.q?.toLowerCase();
  const endBefore = request.query.endBefore ? Date.parse(request.query.endBefore) : undefined;
  const result = await queryFilteredEntity(
    "CONTRACT",
    readLimit(request.query.limit, 100),
    request.query.nextToken,
    (item) => !item.deletedAt &&
      (!request.query.status || item.status === request.query.status) &&
      (!request.query.officeId || item.officeId === request.query.officeId) &&
      (!request.query.customerId || item.customerId === request.query.customerId) &&
      (endBefore === undefined || (item.endDate && Date.parse(item.endDate) <= endBefore)) &&
      (!query || `${item.id} ${item.title ?? ""} ${item.officeId} ${item.customerId}`.toLowerCase().includes(query))
  );
  const items = (result.Items ?? []).map(toContract);
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function listCurrentUserContracts(request) {
  const items = await queryCustomerEntities(request, "CONTRACT");
  return { items: items.map(toContract), count: items.length };
}

async function getCurrentUserProfile(request) {
  const key = userProfileKey(request.claims.sub);
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: key }));
  if (result.Item) return { item: await hydrateUserProfileAvatar(toUserProfile(result.Item, request.claims)) };
  return { item: defaultUserProfile(request.claims) };
}

async function updateCurrentUserProfile(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const key = userProfileKey(request.claims.sub);
  const existing = await dynamo.send(new GetCommand({ TableName: tableName, Key: key }));
  const createdAt = existing.Item?.createdAt ?? now;
  const result = await updateItem({
    key,
    updates: {
      GSI1PK: "ENTITY#USER_PROFILE",
      GSI1SK: `USER_PROFILE#${createdAt}#${request.claims.sub}`,
      GSI2PK: `USER_PROFILE#${request.claims.sub}`,
      GSI2SK: "METADATA",
      entityType: "USER_PROFILE",
      id: request.claims.sub,
      sub: request.claims.sub,
      email: request.claims.email ?? existing.Item?.email ?? "",
      displayName: body.displayName === undefined ? existing.Item?.displayName ?? request.claims.name ?? "" : optionalString(body.displayName),
      phone: body.phone === undefined ? existing.Item?.phone ?? "" : optionalString(body.phone),
      createdAt,
      updatedAt: now,
      updatedBy: request.claims.sub
    }
  });
  return { item: await hydrateUserProfileAvatar(toUserProfile(result.Attributes, request.claims)) };
}

async function createAvatarUploadUrl(request) {
  const body = parseBody(request.event);
  const contentType = requireImageContentType(body.contentType);
  requireFileSize(body.fileSize, maxAvatarBytes, "Ảnh đại diện");
  const extension = extensionFromContentType(contentType);
  const objectKey = `avatars/${request.claims.sub}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: storageBucketName,
    Key: objectKey,
    ContentType: contentType
  }), { expiresIn: 900 });
  return { bucket: storageBucketName, key: objectKey, uploadUrl, expiresIn: 900 };
}

async function confirmAvatarUpload(request) {
  const body = parseBody(request.event);
  const key = requireString(body.key, "key");
  if (!key.startsWith(`avatars/${request.claims.sub}/`)) {
    throw httpError(400, "Đường dẫn ảnh đại diện không hợp lệ.");
  }
  await assertS3ImageObject(storageBucketName, key, maxAvatarBytes, "Ảnh đại diện");

  const profileKey = userProfileKey(request.claims.sub);
  const existing = await dynamo.send(new GetCommand({ TableName: tableName, Key: profileKey }));
  const now = new Date().toISOString();
  let item;
  if (existing.Item) {
    const updated = await updateItem({
      key: profileKey,
      updates: { avatarKey: key, avatarDataUrl: "", updatedAt: now, updatedBy: request.claims.sub },
      condition: "attribute_exists(PK) AND attribute_exists(SK)"
    });
    item = updated.Attributes;
  } else {
    const initial = { ...defaultUserProfileItem(request.claims, now), avatarKey: key };
    try {
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: initial,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      }));
      item = initial;
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
      const updated = await updateItem({
        key: profileKey,
        updates: { avatarKey: key, avatarDataUrl: "", updatedAt: now, updatedBy: request.claims.sub },
        condition: "attribute_exists(PK) AND attribute_exists(SK)"
      });
      item = updated.Attributes;
    }
  }

  const previousKey = existing.Item?.avatarKey;
  if (previousKey && previousKey !== key && previousKey.startsWith(`avatars/${request.claims.sub}/`)) {
    await s3.send(new DeleteObjectCommand({ Bucket: storageBucketName, Key: previousKey })).catch(() => undefined);
  }
  return { item: await hydrateUserProfileAvatar(toUserProfile(item, request.claims)) };
}

async function getContractById(id) {
  const item = await getRawByGsi2(`CONTRACT#${id}`, "Không tìm thấy hợp đồng.");
  return { item: toContract(item) };
}

async function updateContract(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`CONTRACT#${id}`, "Không tìm thấy hợp đồng.");
  const now = new Date().toISOString();
  const nextStatus = body.status === undefined ? current.status : requireEnum(body.status, contractStatuses, "status");
  assertContractTransition(current.status, nextStatus);
  if (current.deletedAt && nextStatus !== current.status) {
    throw httpError(409, "Hợp đồng đã được xóa nên không thể mở lại. Vui lòng tạo hợp đồng mới.");
  }
  const nextStartDate = body.startDate === undefined ? current.startDate : optionalContractDateTime(body.startDate, "startDate");
  const nextEndDate = body.endDate === undefined ? current.endDate : optionalContractDateTime(body.endDate, "endDate");
  validateContractDates(nextStartDate, nextEndDate, nextStatus);

  const isRenewal = ["EXPIRED", "TERMINATED"].includes(current.status) && nextStatus === "ACTIVE";
  if (isRenewal) {
    assertContractCanBeRenewed(current);
    if (body.startDate === undefined || body.endDate === undefined) {
      throw httpError(400, "Vui lòng chọn lại thời gian bắt đầu và kết thúc khi gia hạn hợp đồng.");
    }
  }

  let renewalRequest = null;
  if (isRenewal) {
    const renewalRequestId = requireString(body.rentalRequestId, "rentalRequestId");
    renewalRequest = await assertRentalRequestMatchesContract(renewalRequestId, current.officeId, current.customerId);
    if (renewalRequest.requestType !== "RENEWAL" || renewalRequest.renewalContractId !== current.id) {
      throw httpError(409, "Yêu cầu được chọn không phải yêu cầu gia hạn của hợp đồng này.");
    }
    if (renewalRequest.status !== "APPROVED") {
      throw httpError(409, "Yêu cầu gia hạn phải được duyệt trước khi kích hoạt lại hợp đồng.");
    }
  }

  if (["PENDING_SIGNATURE", "ACTIVE"].includes(nextStatus)) {
    await assertNoContractPeriodConflict(current.officeId, nextStartDate, nextEndDate, current.id);
    await assertNoAppointmentConflict(current.officeId, nextStartDate, nextEndDate);
  }

  const isEnding = current.status === "ACTIVE" && ["EXPIRED", "TERMINATED"].includes(nextStatus);
  const lifecycleUpdates = isEnding
    ? { endedAt: now, renewalDeadline: contractRenewalDeadline(now), rentalRequestId: "" }
    : isRenewal
      ? { renewedAt: now }
      : {};

  const updates = pickDefined({
    title: body.title === undefined ? undefined : optionalString(body.title),
    status: body.status === undefined ? undefined : nextStatus,
    startDate: body.startDate === undefined ? undefined : nextStartDate,
    endDate: body.endDate === undefined ? undefined : nextEndDate,
    monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
    fileKey: body.fileKey === undefined ? undefined : optionalString(body.fileKey),
    rentalRequestId: isRenewal ? renewalRequest.id : undefined,
    ...lifecycleUpdates,
    updatedAt: now,
    updatedBy: request.claims.sub ?? "admin"
  });

  if (current.status !== "ACTIVE" && nextStatus === "ACTIVE") {
    await assertNoActiveContract(current.officeId, current.id);
    const rentalRequest = isRenewal
      ? renewalRequest
      : current.rentalRequestId
      ? await assertRentalRequestMatchesContract(current.rentalRequestId, current.officeId, current.customerId)
      : null;
    await activateExistingContract(current, updates, rentalRequest);
    return await getContractById(id);
  }

  if (current.status === "ACTIVE" && nextStatus !== "ACTIVE") {
    await deactivateContract(current, updates);
    return await getContractById(id);
  }

    const result = await updateEntityWithOptionalLockDelete(
      current,
      updates,
      null,
      "Hợp đồng vừa được cập nhật bởi một thao tác khác. Vui lòng tải lại dữ liệu."
    );
  return { item: toContract(result.Attributes) };
}

async function deleteContract(request, id) {
  const current = await getRawByGsi2(`CONTRACT#${id}`, "Không tìm thấy hợp đồng.");
  assertContractCanBeDeleted(current);
  const now = new Date().toISOString();
    const result = await updateEntityWithOptionalLockDelete(
      current,
      { deletedAt: now, deletedBy: request.claims.sub ?? "admin", updatedAt: now, updatedBy: request.claims.sub ?? "admin" },
      null,
      "Hợp đồng vừa thay đổi trạng thái. Vui lòng tải lại dữ liệu trước khi xóa."
    );
  return { item: toContract(result.Attributes) };
}

async function createContractUploadUrl(request, contractId) {
  const body = parseBody(request.event);
  const contract = await getRawByGsi2(`CONTRACT#${contractId}`, "Không tìm thấy hợp đồng.");
  if (!isAdmin(request) && !contractBelongsToCurrentUser(contract, request)) {
    throw httpError(403, "Bạn không có quyền upload file cho hợp đồng này.");
  }

  const fileName = sanitizeFileName(body.fileName ?? "contract.pdf");
  const contentType = requirePdfContentType(body.contentType);
  requireFileSize(body.fileSize, maxContractBytes, "Tệp hợp đồng");
  const objectKey = `uploads/contracts/${contractId}/${randomUUID()}-${fileName.replace(/\.pdf$/i, "")}.pdf`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: storageBucketName,
    Key: objectKey,
    ContentType: contentType
  }), { expiresIn: 900 });

  return { bucket: storageBucketName, key: objectKey, uploadUrl, expiresIn: 900 };
}

async function confirmContractFile(request, contractId) {
  const body = parseBody(request.event);
  const contract = await getRawByGsi2(`CONTRACT#${contractId}`, "Không tìm thấy hợp đồng.");
  if (!isAdmin(request) && !contractBelongsToCurrentUser(contract, request)) {
    throw httpError(403, "Bạn không có quyền cập nhật file cho hợp đồng này.");
  }

  const uploadKey = requireString(body.key, "key");
  const expectedPrefix = `uploads/contracts/${contractId}/`;
  if (!uploadKey.startsWith(expectedPrefix)) throw httpError(400, "Đường dẫn upload hợp đồng không hợp lệ.");

  await assertS3Object(storageBucketName, uploadKey, "application/pdf", maxContractBytes, "Tệp hợp đồng");
  const finalKey = uploadKey.replace(/^uploads\//, "");
  await s3.send(new CopyObjectCommand({
    Bucket: storageBucketName,
    CopySource: `${storageBucketName}/${encodeS3CopySource(uploadKey)}`,
    Key: finalKey,
    ContentType: "application/pdf",
    MetadataDirective: "REPLACE"
  }));
  await s3.send(new DeleteObjectCommand({ Bucket: storageBucketName, Key: uploadKey }));

  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: contract.PK, SK: contract.SK },
    updates: { fileKey: finalKey, updatedAt: now, updatedBy: request.claims.sub },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  if (contract.fileKey && contract.fileKey !== finalKey && contract.fileKey.startsWith("contracts/")) {
    await s3.send(new DeleteObjectCommand({ Bucket: storageBucketName, Key: contract.fileKey })).catch(() => undefined);
  }
  return { item: toContract(result.Attributes) };
}

async function listCustomers(request) {
  const query = request.query.q?.toLowerCase();
  const result = await queryFilteredEntity(
    "CUSTOMER",
    readLimit(request.query.limit, 100),
    request.query.nextToken,
    (item) => (!request.query.status || item.status === request.query.status) &&
      (!query || `${item.name} ${item.email} ${item.phone ?? ""}`.toLowerCase().includes(query))
  );
  const items = (result.Items ?? []).map(toCustomer);
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function getCustomerById(id) {
  const item = await getRawByGsi2(`CUSTOMER#${id}`, "Không tìm thấy khách hàng.");
  return { item: toCustomer(item) };
}

async function getCustomerOverview(id) {
  const customer = await getRawByGsi2(`CUSTOMER#${id}`, "Không tìm thấy khách hàng.");
  const [rentalRequests, appointments, contracts] = await Promise.all([
    queryCustomerEntitiesByIdentity(customer.email, "REQUEST"),
    queryCustomerEntitiesByIdentity(customer.email, "APPOINTMENT"),
    queryCustomerEntitiesByIdentity(customer.email, "CONTRACT")
  ]);
  const officeIds = new Set([
    ...rentalRequests.map((item) => item.officeId),
    ...appointments.map((item) => item.officeId),
    ...contracts.map((item) => item.officeId)
  ].filter(Boolean));
  const offices = await Promise.all([...officeIds].map(async (officeId) => {
    const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(officeId) }));
    return result.Item ? toOffice(result.Item) : { id: officeId, title: officeId };
  }));
  const requestItems = rentalRequests.map(toRentalRequest);
  const appointmentItems = appointments.map(toAppointment);
  const contractItems = contracts.map(toContract);
  const activities = [
    ...requestItems.map((item) => ({ type: "RENTAL_REQUEST", id: item.id, status: item.status, officeId: item.officeId, at: item.updatedAt ?? item.createdAt })),
    ...appointmentItems.map((item) => ({ type: "APPOINTMENT", id: item.id, status: item.status, officeId: item.officeId, at: item.updatedAt ?? item.createdAt })),
    ...contractItems.map((item) => ({ type: "CONTRACT", id: item.id, status: item.status, officeId: item.officeId, at: item.updatedAt ?? item.createdAt }))
  ].filter((item) => item.at).sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

  return {
    item: {
      customer: toCustomer(customer),
      rentalRequests: requestItems,
      appointments: appointmentItems,
      contracts: contractItems,
      offices: Object.fromEntries(offices.map((office) => [office.id, office])),
      documents: contractItems.filter((item) => item.fileKey).map((item) => ({ contractId: item.id, fileKey: item.fileKey })),
      activities,
      summary: {
        openRequests: requestItems.filter((item) => blockingRentalRequestStatuses.has(item.status)).length,
        upcomingAppointments: appointmentItems.filter((item) => ["REQUESTED", "CONFIRMED"].includes(item.status) && Date.parse(item.scheduledAt) >= Date.now()).length,
        activeContracts: contractItems.filter((item) => item.status === "ACTIVE").length
      }
    }
  };
}

async function createCustomer(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const email = requireEmail(body.email, "email");
  const id = email.toLowerCase();

  const item = {
    PK: `CUSTOMER#${id}`,
    SK: "METADATA",
    GSI1PK: "ENTITY#CUSTOMER",
    GSI1SK: `CUSTOMER#${now}#${id}`,
    GSI2PK: `CUSTOMER#${id}`,
    GSI2SK: "METADATA",
    entityType: "CUSTOMER",
    id,
    email,
    name: requireString(body.name, "name"),
    phone: optionalString(body.phone),
    status: requireEnum(body.status ?? "ACTIVE", new Set(["ACTIVE", "INACTIVE"]), "status"),
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? "admin",
    updatedBy: request.claims.sub ?? "admin"
  };

  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: item,
    ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
  }));

  return { item: toCustomer(item) };
}

async function updateCustomer(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`CUSTOMER#${id}`, "Không tìm thấy khách hàng.");
  if (body.status === "INACTIVE" && current.status !== "INACTIVE") {
    await assertCustomerCanBeDeleted(request, current);
  }
  const now = new Date().toISOString();
    const result = await updateEntityWithOptionalLockDelete(
      current,
      pickDefined({
        name: body.name === undefined ? undefined : requireString(body.name, "name"),
      phone: body.phone === undefined ? undefined : optionalString(body.phone),
      status: body.status === undefined ? undefined : requireEnum(body.status, new Set(["ACTIVE", "INACTIVE"]), "status"),
        updatedAt: now,
        updatedBy: request.claims.sub ?? "admin"
      }),
      null,
      "Khách hàng vừa được cập nhật bởi một thao tác khác. Vui lòng tải lại dữ liệu."
    );
  return { item: toCustomer(result.Attributes) };
}

async function deleteCustomer(request, id) {
  const current = await getRawByGsi2(`CUSTOMER#${id}`, "Không tìm thấy khách hàng.");
  await assertCustomerCanBeDeleted(request, current);
  const now = new Date().toISOString();
    const result = await updateEntityWithOptionalLockDelete(
      current,
      { status: "INACTIVE", deletedAt: now, deletedBy: request.claims.sub ?? "admin", updatedAt: now, updatedBy: request.claims.sub ?? "admin" },
      null,
      "Khách hàng vừa thay đổi trạng thái. Vui lòng tải lại dữ liệu trước khi xóa."
    );
  return { item: toCustomer(result.Attributes) };
}

async function upsertCustomerFromRequest({ request, email, customerName, phone, now }) {
  const id = email.toLowerCase();
  const item = {
    PK: `CUSTOMER#${id}`,
    SK: "METADATA",
    GSI1PK: "ENTITY#CUSTOMER",
    GSI1SK: `CUSTOMER#${now}#${id}`,
    GSI2PK: `CUSTOMER#${id}`,
    GSI2SK: "METADATA",
    entityType: "CUSTOMER",
    id,
    email,
    name: customerName,
    phone: optionalString(phone),
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? email,
    updatedBy: request.claims.sub ?? email
  };

  try {
    await dynamo.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    }));
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") throw error;
    await updateItem({
      key: { PK: `CUSTOMER#${id}`, SK: "METADATA" },
      updates: { name: customerName, phone: optionalString(phone), status: "ACTIVE", updatedAt: now, updatedBy: request.claims.sub ?? email }
    });
  }
}

async function exportAdminReport(reportFile) {
  const reportType = reportFile.replace(/\.csv$/i, "");
  let headers;
  let rows;

  if (reportType === "offices") {
    headers = ["id", "title", "buildingName", "floor", "roomNumber", "address", "areaSqm", "monthlyPrice", "status", "createdAt"];
    rows = (await listEntityItems("OFFICE")).map(toOffice);
  } else if (reportType === "customers") {
    headers = ["id", "name", "email", "phone", "status", "createdAt"];
    rows = (await listEntityItems("CUSTOMER")).map(toCustomer);
  } else if (reportType === "revenue") {
    headers = ["contractId", "officeId", "customerId", "status", "monthlyPrice", "startDate", "endDate"];
    rows = (await listEntityItems("CONTRACT")).map((item) => ({
      contractId: item.id,
      officeId: item.officeId,
      customerId: item.customerId,
      status: item.status,
      monthlyPrice: item.monthlyPrice ?? 0,
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? ""
    }));
  } else {
    throw httpError(404, "Loại báo cáo không tồn tại.");
  }

  const csv = toCsv(headers, rows);
  return {
    statusCode: 200,
    body: `\uFEFF${csv}`,
    raw: true,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cloffice-${reportType}-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  };
}

function toCsv(headers, rows) {
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))
  ].join("\r\n");
}

async function getAdminStats() {
  const [offices, requests, contracts, customers, appointments] = await Promise.all([
    listEntityItems("OFFICE"),
    listEntityItems("RENTAL_REQUEST"),
    listEntityItems("CONTRACT"),
    listEntityItems("CUSTOMER"),
    listEntityItems("APPOINTMENT")
  ]);
  const activeOffices = offices.filter((item) => item.status !== "INACTIVE");
  const activeContracts = contracts.filter((item) => item.status === "ACTIVE");
  const visibleRequests = requests.filter((item) => !item.deletedAt);
  const visibleAppointments = appointments.filter((item) => !item.deletedAt);
  const now = Date.now();
  const warningWindow = now + (30 * 24 * 60 * 60 * 1000);
  const officesById = new Map(offices.map((item) => [item.id, item]));
  const customersByIdentity = new Map(customers.flatMap((item) => (
    [...normalizedIdentitySet(item.id, item.email)].map((identity) => [identity, item])
  )));
  const expiringContracts = activeContracts
    .filter((item) => item.endDate && Date.parse(item.endDate) >= now && Date.parse(item.endDate) <= warningWindow)
    .sort((left, right) => Date.parse(left.endDate) - Date.parse(right.endDate))
    .slice(0, 8)
    .map((item) => ({
      ...toContract(item),
      officeTitle: officesById.get(item.officeId)?.title,
      customerName: customersByIdentity.get(item.customerId?.toLowerCase())?.name
    }));
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = visibleAppointments
    .filter((item) => item.scheduledAt?.slice(0, 10) === today && ["REQUESTED", "CONFIRMED"].includes(item.status))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))
    .slice(0, 8)
    .map((item) => ({ ...toAppointment(item), officeTitle: officesById.get(item.officeId)?.title }));
  const countByStatus = (items, statuses) => Object.fromEntries(
    statuses.map((status) => [status, items.filter((item) => item.status === status).length])
  );

  return {
    item: {
      offices: activeOffices.length,
      pendingRentalRequests: visibleRequests.filter((item) => item.status === "PENDING").length,
      activeContracts: activeContracts.length,
      customers: customers.filter((item) => item.status !== "INACTIVE").length,
      pendingAppointments: visibleAppointments.filter((item) => item.status === "REQUESTED").length,
      occupancyRate: activeOffices.length ? Math.round((activeContracts.length / activeOffices.length) * 100) : 0,
      monthlyRevenue: activeContracts.reduce((sum, item) => sum + (Number(item.monthlyPrice) || 0), 0),
      expiringContracts,
      todayAppointments,
      officeStatusCounts: countByStatus(offices, [...officeStatuses]),
      requestStatusCounts: countByStatus(visibleRequests, [...rentalRequestStatuses]),
      appointmentStatusCounts: countByStatus(visibleAppointments, [...appointmentStatuses]),
      contractStatusCounts: countByStatus(contracts, [...contractStatuses])
    }
  };
}

async function activateNewContract(contract, rentalRequest) {
  const now = new Date().toISOString();
  const competingRequestItems = await competingRentalRequestClosureItems(contract.officeId, rentalRequest?.id, now);
  const transactItems = [
    {
      Put: {
        TableName: tableName,
        Item: contract,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      }
    },
    activeContractLockPut(contract, now),
    officeLeaseUpdate(contract.officeId, contract.id, now)
  ];
  if (rentalRequest) {
    transactItems.push(rentalRequestApprovalUpdate(rentalRequest, now));
    transactItems.push(rentalRequestLockDelete(rentalRequest));
  }
  transactItems.push(...competingRequestItems);
  await sendContractTransaction(transactItems);
}

async function activateExistingContract(contract, updates, rentalRequest) {
  const now = new Date().toISOString();
  const competingRequestItems = await competingRentalRequestClosureItems(contract.officeId, rentalRequest?.id, now);
  const updateParts = buildUpdateParts(updates);
  updateParts.names["#expectedStatus"] = "status";
  updateParts.values[":expectedStatus"] = contract.status;
  const transactItems = [
    {
      Update: {
        TableName: tableName,
        Key: { PK: contract.PK, SK: contract.SK },
        UpdateExpression: updateParts.expression,
        ExpressionAttributeNames: updateParts.names,
        ExpressionAttributeValues: updateParts.values,
        ConditionExpression: "#expectedStatus = :expectedStatus"
      }
    },
    activeContractLockPut(contract, now),
    officeLeaseUpdate(contract.officeId, contract.id, now)
  ];
  if (rentalRequest) {
    transactItems.push(rentalRequestApprovalUpdate(rentalRequest, now));
    transactItems.push(rentalRequestLockDelete(rentalRequest));
  }
  transactItems.push(...competingRequestItems);
  await sendContractTransaction(transactItems);
}

async function competingRentalRequestClosureItems(officeId, selectedRequestId, now) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const competing = children.filter((item) => (
    item.entityType === "RENTAL_REQUEST" &&
    item.id !== selectedRequestId &&
    !item.deletedAt &&
    !item.convertedAt &&
    blockingRentalRequestStatuses.has(item.status)
  ));
  if (competing.length > 40) {
    throw httpError(409, "Văn phòng có quá nhiều yêu cầu đang mở. Vui lòng từ chối bớt yêu cầu trước khi kích hoạt hợp đồng.");
  }
  return competing.flatMap((item) => ([
    {
      Update: {
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: "SET #status = :rejected, decisionNote = :reason, updatedAt = :now, updatedBy = :actor",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":pending": "PENDING",
          ":approved": "APPROVED",
          ":rejected": "REJECTED",
          ":reason": "Văn phòng đã được ký hợp đồng với khách hàng khác.",
          ":now": now,
          ":actor": "contract-workflow"
        },
        ConditionExpression: "attribute_exists(PK) AND #status IN (:pending, :approved)"
      }
    },
    { Delete: { TableName: tableName, Key: rentalRequestLockKey(item.officeId, item.email) } }
  ]));
}

async function deactivateContract(contract, updates) {
  const now = new Date().toISOString();
  const updateParts = buildUpdateParts(updates);
  updateParts.names["#expectedStatus"] = "status";
  updateParts.values[":expectedStatus"] = "ACTIVE";
  const lockKey = activeContractLockKey(contract.officeId);
  const lock = await dynamo.send(new GetCommand({ TableName: tableName, Key: lockKey }));
  if (lock.Item && lock.Item.contractId !== contract.id) {
      throw httpError(409, "Khóa văn phòng thuộc hợp đồng khác. Vui lòng kiểm tra dữ liệu trước khi kết thúc hợp đồng.");
  }
  const transactItems = [
    {
      Update: {
        TableName: tableName,
        Key: { PK: contract.PK, SK: contract.SK },
        UpdateExpression: updateParts.expression,
        ExpressionAttributeNames: updateParts.names,
        ExpressionAttributeValues: updateParts.values,
        ConditionExpression: "#expectedStatus = :expectedStatus"
      }
    },
    {
      Update: {
        TableName: tableName,
        Key: officeKey(contract.officeId),
        UpdateExpression: "SET #status = :available, updatedAt = :now, updatedBy = :actor REMOVE activeContractId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":available": "AVAILABLE",
          ":now": now,
          ":actor": "contract-workflow",
          ":leased": "LEASED",
          ":contractId": contract.id
        },
        ConditionExpression: "attribute_exists(PK) AND #status = :leased AND activeContractId = :contractId"
      }
    }
  ];
  if (lock.Item?.contractId === contract.id) {
    transactItems.push({
      Delete: {
        TableName: tableName,
        Key: lockKey,
        ConditionExpression: "contractId = :contractId",
        ExpressionAttributeValues: { ":contractId": contract.id }
      }
    });
  }
  if (contract.rentalRequestId) {
    const rentalRequest = await getRawByGsi2(`REQUEST#${contract.rentalRequestId}`, "Không tìm thấy yêu cầu thuê liên quan.");
    if (!rentalRequest.deletedAt) transactItems.push(rentalRequestDelete(rentalRequest));
  }
  await sendContractTransaction(transactItems);
}

function activeContractLockPut(contract, now) {
  return {
    Put: {
      TableName: tableName,
      Item: {
        ...activeContractLockKey(contract.officeId),
        entityType: "ACTIVE_CONTRACT_LOCK",
        officeId: contract.officeId,
        contractId: contract.id,
        createdAt: now
      },
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    }
  };
}

function officeLeaseUpdate(officeId, contractId, now) {
  return {
    Update: {
      TableName: tableName,
      Key: officeKey(officeId),
      UpdateExpression: "SET #status = :leased, activeContractId = :contractId, updatedAt = :now, updatedBy = :actor",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":leased": "LEASED",
        ":inactive": "INACTIVE",
        ":contractId": contractId,
        ":now": now,
        ":actor": "contract-workflow"
      },
      ConditionExpression: "attribute_exists(PK) AND #status <> :inactive"
    }
  };
}

function rentalRequestApprovalUpdate(rentalRequest, now) {
  return {
    Update: {
      TableName: tableName,
      Key: { PK: rentalRequest.PK, SK: rentalRequest.SK },
      UpdateExpression: "SET #status = :approved, convertedAt = :now, updatedAt = :now, updatedBy = :actor",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":pending": "PENDING",
        ":approved": "APPROVED",
        ":now": now,
        ":actor": "contract-workflow"
      },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #status IN (:pending, :approved)"
    }
  };
}

function rentalRequestLockDelete(rentalRequest) {
  return {
    Delete: {
      TableName: tableName,
      Key: rentalRequestLockKey(rentalRequest.officeId, rentalRequest.email)
    }
  };
}

function rentalRequestDelete(rentalRequest) {
  return {
    Delete: {
      TableName: tableName,
      Key: { PK: rentalRequest.PK, SK: rentalRequest.SK },
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":approved": "APPROVED"
      },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #status = :approved"
    }
  };
}

async function createRentalRequestWithLock(item) {
  const lockKey = rentalRequestLockKey(item.officeId, item.email);
  try {
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
          }
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...lockKey,
              entityType: "OPEN_RENTAL_REQUEST_LOCK",
              requestId: item.id,
              email: item.email,
              createdAt: item.createdAt
            },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
          }
        }
      ]
    }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Bạn đã có một yêu cầu thuê đang được xử lý cho văn phòng này.");
    }
    throw error;
  }
}

async function updateRentalRequestWithLock(current, updates) {
  const nextStatus = updates.status ?? current.status;
  const currentNeedsLock = blockingRentalRequestStatuses.has(current.status) && !current.convertedAt;
  const nextNeedsLock = blockingRentalRequestStatuses.has(nextStatus) && !current.convertedAt;
  if (currentNeedsLock === nextNeedsLock) {
    return await updateEntityWithOptionalLockDelete(
      current,
      updates,
      null,
      "Yêu cầu thuê vừa được cập nhật bởi một thao tác khác. Vui lòng tải lại dữ liệu."
    );
  }

  const parts = buildUpdateParts(updates);
  parts.names["#expectedStatus"] = "status";
  parts.values[":expectedStatus"] = current.status;
  const lockKey = rentalRequestLockKey(current.officeId, current.email);
  const transactItems = [{
    Update: {
      TableName: tableName,
      Key: { PK: current.PK, SK: current.SK },
      UpdateExpression: parts.expression,
      ExpressionAttributeNames: parts.names,
      ExpressionAttributeValues: parts.values,
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #expectedStatus = :expectedStatus"
    }
  }];
  if (currentNeedsLock) transactItems.push({ Delete: { TableName: tableName, Key: lockKey } });
  if (nextNeedsLock) {
    transactItems.push({
      Put: {
        TableName: tableName,
        Item: {
          ...lockKey,
          entityType: "OPEN_RENTAL_REQUEST_LOCK",
          requestId: current.id,
          email: current.email,
          createdAt: updates.updatedAt
        },
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      }
    });
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Không thể mở lại yêu cầu thuê vì khách hàng đã có yêu cầu khác đang được xử lý cho văn phòng này.");
    }
    throw error;
  }
  return await getUpdatedEntity(current);
}

async function createAppointmentWithLock(item) {
  const lockKey = appointmentLockKey(item.officeId, item.scheduledAt);
  try {
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
          }
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...lockKey,
              entityType: "APPOINTMENT_LOCK",
              appointmentId: item.id,
              email: item.email,
              scheduledAt: item.scheduledAt,
              createdAt: item.createdAt
            },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
          }
        }
      ]
    }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Văn phòng đã có lịch hẹn vào thời gian này. Vui lòng chọn giờ khác.");
    }
    throw error;
  }
}

async function updateAppointmentWithLock(current, updates) {
  const nextStatus = updates.status ?? current.status;
  const nextScheduledAt = updates.scheduledAt ?? current.scheduledAt;
  const currentNeedsLock = activeAppointmentStatuses.has(current.status);
  const nextNeedsLock = activeAppointmentStatuses.has(nextStatus);
  const currentLockKey = appointmentLockKey(current.officeId, current.scheduledAt);
  const nextLockKey = appointmentLockKey(current.officeId, nextScheduledAt);
  const lockChanged = currentNeedsLock !== nextNeedsLock || currentLockKey.SK !== nextLockKey.SK;

  if (!lockChanged) {
    return await updateEntityWithOptionalLockDelete(
      current,
      updates,
      null,
      "Lịch hẹn vừa được cập nhật bởi một thao tác khác. Vui lòng tải lại dữ liệu."
    );
  }

  const parts = buildUpdateParts(updates);
  parts.names["#expectedStatus"] = "status";
  parts.names["#expectedScheduledAt"] = "scheduledAt";
  parts.values[":expectedStatus"] = current.status;
  parts.values[":expectedScheduledAt"] = current.scheduledAt;
  const transactItems = [{
    Update: {
      TableName: tableName,
      Key: { PK: current.PK, SK: current.SK },
      UpdateExpression: parts.expression,
      ExpressionAttributeNames: parts.names,
      ExpressionAttributeValues: parts.values,
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #expectedStatus = :expectedStatus AND #expectedScheduledAt = :expectedScheduledAt"
    }
  }];
  if (currentNeedsLock) transactItems.push({ Delete: { TableName: tableName, Key: currentLockKey } });
  if (nextNeedsLock) {
    transactItems.push({
      Put: {
        TableName: tableName,
        Item: {
          ...nextLockKey,
          entityType: "APPOINTMENT_LOCK",
          appointmentId: current.id,
          email: current.email,
          scheduledAt: nextScheduledAt,
          createdAt: updates.updatedAt
        },
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      }
    });
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Không thể cập nhật lịch hẹn. Khung giờ đã được sử dụng hoặc lịch vừa thay đổi.");
    }
    throw error;
  }
  return await getUpdatedEntity(current);
}

async function getUpdatedEntity(current) {
  const result = await dynamo.send(new GetCommand({
    TableName: tableName,
    Key: { PK: current.PK, SK: current.SK },
    ConsistentRead: true
  }));
  return { Attributes: result.Item };
}

async function updateEntityWithOptionalLockDelete(current, updates, lockKey, conflictMessage) {
  const parts = buildUpdateParts(updates);
  parts.names["#expectedStatus"] = "status";
  parts.values[":expectedStatus"] = current.status;
  const transactItems = [{
    Update: {
      TableName: tableName,
      Key: { PK: current.PK, SK: current.SK },
      UpdateExpression: parts.expression,
      ExpressionAttributeNames: parts.names,
      ExpressionAttributeValues: parts.values,
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #expectedStatus = :expectedStatus"
    }
  }];
  if (lockKey) transactItems.push({ Delete: { TableName: tableName, Key: lockKey } });

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") throw httpError(409, conflictMessage);
    throw error;
  }

  const result = await dynamo.send(new GetCommand({
    TableName: tableName,
    Key: { PK: current.PK, SK: current.SK },
    ConsistentRead: true
  }));
  return { Attributes: result.Item };
}

async function updateOfficeWithLocationLock(current, updates) {
  const next = { ...current, ...updates };
  const currentLocationKey = current.status === "INACTIVE" ? null : officeLocationKey(current);
  const nextLocationKey = next.status === "INACTIVE" ? null : officeLocationKey(next);
  const locationUnchanged = JSON.stringify(currentLocationKey) === JSON.stringify(nextLocationKey);

  if (locationUnchanged) {
    return await updateEntityWithOptionalLockDelete(
      current,
      updates,
      null,
      "Văn phòng vừa được cập nhật bởi một thao tác khác. Vui lòng tải lại dữ liệu."
    );
  }

  const parts = buildUpdateParts(updates);
  parts.names["#expectedStatus"] = "status";
  parts.values[":expectedStatus"] = current.status;
  const transactItems = [{
    Update: {
      TableName: tableName,
      Key: { PK: current.PK, SK: current.SK },
      UpdateExpression: parts.expression,
      ExpressionAttributeNames: parts.names,
      ExpressionAttributeValues: parts.values,
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #expectedStatus = :expectedStatus"
    }
  }];
  if (currentLocationKey) transactItems.push({ Delete: { TableName: tableName, Key: currentLocationKey } });
  if (nextLocationKey) {
    transactItems.push({
      Put: {
        TableName: tableName,
        Item: officeLocationLock(next, updates.updatedAt),
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      }
    });
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Không thể đổi vị trí phòng. Vị trí mới đã được sử dụng hoặc dữ liệu vừa thay đổi.");
    }
    throw error;
  }

  const result = await dynamo.send(new GetCommand({
    TableName: tableName,
    Key: { PK: current.PK, SK: current.SK },
    ConsistentRead: true
  }));
  return { Attributes: result.Item };
}

async function sendContractTransaction(transactItems) {
  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Không thể cập nhật hợp đồng vì văn phòng hoặc dữ liệu liên quan vừa thay đổi. Vui lòng tải lại và thử lại.");
    }
    throw error;
  }
}

async function assertNoActiveContract(officeId, excludedContractId = "") {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const active = children.find((item) => item.entityType === "CONTRACT" && item.status === "ACTIVE" && item.id !== excludedContractId);
  if (active) throw httpError(409, "Văn phòng đã có hợp đồng đang hiệu lực.");
}

async function assertNoOtherActiveContract(officeId, allowedContractId) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const active = children.find((item) => (
    item.entityType === "CONTRACT" &&
    item.status === "ACTIVE" &&
    item.id !== allowedContractId &&
    !item.deletedAt
  ));
  if (active) throw httpError(409, "Văn phòng đã được cho khách hàng khác thuê nên không thể gửi yêu cầu gia hạn.");
}

async function assertNoContractPeriodConflict(officeId, startDate, endDate, excludedContractId = "") {
  if (!startDate || !endDate) return;
  const start = new Date(startDate).getTime();
  const end = contractEndTimestamp(endDate);
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const conflict = children.find((item) => (
    item.entityType === "CONTRACT" &&
    item.id !== excludedContractId &&
    !item.deletedAt &&
    ["PENDING_SIGNATURE", "ACTIVE"].includes(item.status) &&
    item.startDate && item.endDate &&
    start < contractEndTimestamp(item.endDate) &&
    new Date(item.startDate).getTime() < end
  ));
  if (conflict) {
    throw httpError(409, "Khoảng thời gian này trùng với một hợp đồng khác của văn phòng. Vui lòng chọn thời gian khác.");
  }
}

async function assertNoAppointmentConflict(officeId, startDate, endDate) {
  if (!startDate || !endDate) return;
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const conflict = children.find((item) => (
    item.entityType === "APPOINTMENT" &&
    !item.deletedAt &&
    activeAppointmentStatuses.has(item.status) &&
    appointmentOverlapsContract(item.scheduledAt, startDate, endDate)
  ));
  if (conflict) {
    throw httpError(409, "Hợp đồng trùng với lịch xem văn phòng đang chờ xử lý hoặc đã xác nhận. Vui lòng đổi thời gian hoặc xử lý lịch hẹn trước.");
  }
}

async function assertAppointmentOutsideContractPeriods(officeId, scheduledAt) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const conflict = children.find((item) => (
    item.entityType === "CONTRACT" &&
    !item.deletedAt &&
    ["PENDING_SIGNATURE", "ACTIVE"].includes(item.status) &&
    item.startDate && item.endDate &&
    appointmentOverlapsContract(scheduledAt, item.startDate, item.endDate)
  ));
  if (conflict) {
    throw httpError(409, "Thời gian này nằm trong thời hạn văn phòng đã được ký thuê. Vui lòng chọn lịch khác.");
  }
}

async function assertCustomerExists(customerId) {
  const customer = await getRawByGsi2(`CUSTOMER#${customerId.toLowerCase()}`, "Không tìm thấy khách hàng của hợp đồng.");
  if (customer.status === "INACTIVE") throw httpError(409, "Khách hàng đã ngừng hoạt động.");
  return customer;
}

async function assertRentalRequestMatchesContract(id, officeId, customerId) {
  const request = await getRawByGsi2(`REQUEST#${id}`, "Không tìm thấy yêu cầu thuê của hợp đồng.");
  if (request.officeId !== officeId) throw httpError(409, "Yêu cầu thuê không thuộc văn phòng của hợp đồng.");
  if (!hasIdentityOverlap(normalizedIdentitySet(request.email, request.createdBy), normalizedIdentitySet(customerId))) {
    throw httpError(409, "Yêu cầu thuê không thuộc khách hàng của hợp đồng.");
  }
  if (["REJECTED", "CANCELLED"].includes(request.status)) {
    throw httpError(409, "Yêu cầu thuê đã bị từ chối hoặc hủy.");
  }
  return request;
}

function assertContractTransition(currentStatus, nextStatus) {
  if (!canTransitionContract(currentStatus, nextStatus)) {
    throw httpError(409, `Không thể chuyển hợp đồng từ ${currentStatus} sang ${nextStatus}.`);
  }
}

function validateContractDates(startDate, endDate, status) {
  if (["PENDING_SIGNATURE", "ACTIVE"].includes(status) && (!startDate || !endDate)) {
    throw httpError(400, "Hợp đồng chờ ký hoặc đang hiệu lực phải có thời gian bắt đầu và kết thúc.");
  }
  if (startDate && endDate && new Date(startDate).getTime() >= new Date(endDate).getTime()) {
    throw httpError(400, "Thời gian bắt đầu hợp đồng phải trước thời gian kết thúc.");
  }
  if (status === "ACTIVE" && contractEndTimestamp(endDate) <= Date.now()) {
    throw httpError(400, "Không thể kích hoạt hợp đồng đã hết hạn.");
  }
}

function contractBelongsToCurrentUser(contract, request) {
  return entityBelongsToCurrentUser({ ...contract, email: contract.customerId }, request);
}

function activeContractLockKey(officeId) {
  return { PK: `OFFICE#${officeId}`, SK: "ACTIVE_CONTRACT" };
}

async function assertNoOpenRentalRequest(officeId, email) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const duplicate = children.find((item) => (
    item.entityType === "RENTAL_REQUEST" &&
    item.email?.toLowerCase() === email.toLowerCase() &&
    blockingRentalRequestStatuses.has(item.status) &&
    !item.convertedAt
  ));
  if (duplicate) throw httpError(409, "Bạn đã có một yêu cầu thuê đang được xử lý cho văn phòng này.");
}

async function assertNoRenewalPriorityWindow(officeId) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const priorityContract = children.find((item) => (
    item.entityType === "CONTRACT" &&
    !item.deletedAt &&
    ["EXPIRED", "TERMINATED"].includes(item.status) &&
    Date.parse(resolveContractRenewalDeadline(item)) >= Date.now()
  ));
  if (priorityContract) {
    throw httpError(409, "Văn phòng đang trong thời gian ưu tiên gia hạn cho khách hàng hiện tại. Vui lòng quay lại sau.");
  }
}

async function assertNoDuplicateAppointment(officeId, scheduledAt) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const duplicate = children.find((item) => (
    item.entityType === "APPOINTMENT" &&
    item.scheduledAt === scheduledAt &&
    !["REJECTED", "CANCELLED"].includes(item.status)
  ));
  if (duplicate) throw httpError(409, "Văn phòng đã có lịch hẹn vào thời gian này.");
}

function rentalRequestLockKey(officeId, email) {
  return {
    PK: `OFFICE#${officeId}`,
    SK: `LOCK#RENTAL_REQUEST#${stableHash(email)}`
  };
}

function appointmentLockKey(officeId, scheduledAt) {
  return {
    PK: `OFFICE#${officeId}`,
    SK: `LOCK#APPOINTMENT#${stableHash(scheduledAt)}`
  };
}

function assertAppointmentTransition(currentStatus, nextStatus, admin) {
  if (!canTransitionAppointment(currentStatus, nextStatus, admin)) {
    throw httpError(409, "Trạng thái lịch hẹn không cho phép thao tác này.");
  }
}

function assertRentalRequestTransition(currentStatus, nextStatus) {
  if (!canTransitionRentalRequest(currentStatus, nextStatus)) {
    throw httpError(409, `Không thể chuyển yêu cầu thuê từ ${currentStatus} sang ${nextStatus}.`);
  }
}

function entityBelongsToCurrentUser(entity, request) {
  return hasIdentityOverlap(
    normalizedIdentitySet(entity.customerId, entity.email, entity.createdBy),
    normalizedIdentitySet(request.claims.sub, request.claims.email)
  );
}

async function assertOfficeExists(id) {
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(id) }));
  if (!result.Item || result.Item.status === "INACTIVE") {
    throw httpError(400, "Văn phòng không tồn tại hoặc đã ngừng hoạt động.");
  }
  return result.Item;
}

async function assertOfficeAcceptsRequests(id) {
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(id) }));
  if (!result.Item || !["AVAILABLE", "RESERVED"].includes(result.Item.status)) {
    throw httpError(409, "Văn phòng hiện không sẵn sàng nhận thêm yêu cầu thuê.");
  }
  return result.Item;
}

async function assertOfficeAcceptsAppointments(id) {
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(id) }));
  if (!result.Item || result.Item.status === "INACTIVE") {
    throw httpError(409, "Văn phòng hiện không sẵn sàng để đặt lịch tham quan.");
  }
  return result.Item;
}

async function assertOfficeStatusUpdateAllowed(office, nextStatus) {
  if (office.status === nextStatus) return;
  const lock = await dynamo.send(new GetCommand({
    TableName: tableName,
    Key: activeContractLockKey(office.id)
  }));

  if (lock.Item && nextStatus !== "LEASED") {
    throw httpError(409, "Văn phòng đang có hợp đồng hiệu lực nên phải giữ trạng thái LEASED.");
  }
  if (!lock.Item && nextStatus === "LEASED") {
    throw httpError(409, "Chỉ quy trình kích hoạt hợp đồng mới được chuyển văn phòng sang LEASED.");
  }
  if (nextStatus === "INACTIVE") await assertOfficeCanBeDeleted(office.id);
}

async function hydrateOfficeImageUrls(offices) {
  return await Promise.all(offices.map(hydrateOfficeImageUrl));
}

async function hydrateOfficeImageUrl(office) {
  const imageKey = office.processedImageReady && office.processedImageKey ? office.processedImageKey : office.imageKey;
  const imageBucket = office.processedImageReady && office.processedImageKey && processedBucketName
    ? processedBucketName
    : storageBucketName;

  if (!imageKey || !imageBucket) return office;

  try {
    const signedImageUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: imageBucket,
      Key: imageKey
    }), { expiresIn: 3600 });

    return { ...office, imageUrl: signedImageUrl };
  } catch {
    return office;
  }
}

async function hydrateUserProfileAvatar(profile) {
  if (!profile.avatarKey || !storageBucketName) return profile;
  try {
    const avatarUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: storageBucketName,
      Key: profile.avatarKey
    }), { expiresIn: 3600 });
    return { ...profile, avatarUrl };
  } catch {
    return profile;
  }
}

async function assertS3Object(bucket, key, expectedContentType, maximumBytes, label) {
  let metadata;
  try {
    metadata = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    throw httpError(400, `${label} chưa được tải lên hoặc không tồn tại.`);
  }
  if (metadata.ContentType?.toLowerCase() !== expectedContentType) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    throw httpError(400, `${label} không đúng định dạng.`);
  }
  if (!metadata.ContentLength || metadata.ContentLength > maximumBytes) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    throw httpError(400, `${label} vượt quá dung lượng cho phép.`);
  }
  if (expectedContentType === "application/pdf") {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-4" }));
    const prefix = Buffer.from(await object.Body.transformToByteArray()).toString("ascii");
    if (prefix !== "%PDF-") {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
      throw httpError(400, "Nội dung tệp không phải tài liệu PDF hợp lệ.");
    }
  }
  return metadata;
}

async function assertS3ImageObject(bucket, key, maximumBytes, label) {
  let metadata;
  try {
    metadata = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    throw httpError(400, `${label} chưa được tải lên hoặc không tồn tại.`);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(metadata.ContentType?.toLowerCase())) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    throw httpError(400, `${label} không đúng định dạng.`);
  }
  if (!metadata.ContentLength || metadata.ContentLength > maximumBytes) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    throw httpError(400, `${label} vượt quá dung lượng cho phép.`);
  }
  return metadata;
}

function encodeS3CopySource(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

  async function assertOfficeCanBeDeleted(id) {
  const office = await dynamo.send(new GetCommand({ TableName: tableName, Key: officeKey(id) }));
  if (!office.Item) throw httpError(404, "Không tìm thấy văn phòng.");

  const children = await queryItemsByPk(`OFFICE#${id}`);
  const openContracts = children.filter((item) => item.entityType === "CONTRACT" && blockingContractStatuses.has(item.status));
  const openRentalRequests = children.filter((item) => (
    item.entityType === "RENTAL_REQUEST" &&
    blockingRentalRequestStatuses.has(item.status) &&
    !item.convertedAt
  ));

    if (openContracts.length > 0 || openRentalRequests.length > 0) {
      throw httpError(409, buildDeleteBlockMessage("văn phòng này", openContracts.length, openRentalRequests.length));
    }
    return office.Item;
  }

async function assertRentalRequestCanBeDeleted(requestItem) {
  if (!["REJECTED", "CANCELLED"].includes(requestItem.status)) {
    throw httpError(409, "Chỉ có thể xóa yêu cầu thuê đã hủy hoặc bị từ chối.");
  }
  if (requestItem.deletedAt) {
    throw httpError(409, "Yêu cầu thuê này đã được xóa khỏi danh sách.");
  }

  const contracts = await listEntityItems("CONTRACT");
  const linkedContracts = contracts.filter((item) => (
    item.rentalRequestId === requestItem.id && blockingContractStatuses.has(item.status)
  ));

  if (linkedContracts.length > 0) {
    throw httpError(409, "Không thể xóa yêu cầu thuê vì đã có hợp đồng liên quan đang xử lý.");
  }
}

function assertContractCanBeDeleted(contractItem) {
  if (protectedContractDeleteStatuses.has(contractItem.status)) {
    throw httpError(409, "Không thể xóa hợp đồng đang chờ ký hoặc đang hiệu lực. Vui lòng hoàn tất quy trình kết thúc hợp đồng trước.");
  }
  if (!["EXPIRED", "TERMINATED"].includes(contractItem.status)) {
    throw httpError(409, "Chỉ có thể xóa hợp đồng đã hết hạn hoặc đã kết thúc.");
  }
  if (contractItem.deletedAt) {
    throw httpError(409, "Hợp đồng này đã được xóa khỏi danh sách.");
  }
  const deadline = resolveContractRenewalDeadline(contractItem);
  if (!deadline || Date.now() < Date.parse(deadline)) {
    throw httpError(409, "Hợp đồng đang trong thời gian chờ gia hạn 3 ngày nên chưa thể xóa.");
  }
}

function assertContractCanBeRenewed(contractItem) {
  if (contractItem.deletedAt) throw httpError(409, "Hợp đồng đã được xóa nên không thể gia hạn.");
  const deadline = resolveContractRenewalDeadline(contractItem);
  if (!deadline || Date.now() > Date.parse(deadline)) {
    throw httpError(409, "Thời hạn gia hạn 3 ngày đã kết thúc. Vui lòng tạo hợp đồng mới.");
  }
}

function resolveContractRenewalDeadline(contractItem) {
  if (contractItem.renewalDeadline && Number.isFinite(Date.parse(contractItem.renewalDeadline))) {
    return contractItem.renewalDeadline;
  }
  const endedAt = contractItem.endedAt ?? contractItem.updatedAt ?? contractItem.endDate;
  return endedAt ? contractRenewalDeadline(endedAt) : "";
}

async function assertCustomerCanBeDeleted(request, customerItem) {
  const customerKeys = normalizedIdentitySet(customerItem.id, customerItem.email, customerItem.createdBy);
  const currentUserKeys = normalizedIdentitySet(request.claims.sub, request.claims.email);

  if (hasIdentityOverlap(customerKeys, currentUserKeys)) {
    throw httpError(409, "Không thể xóa khách hàng hoặc tài khoản đang đăng nhập.");
  }

  const [contracts, rentalRequests] = await Promise.all([
    listEntityItems("CONTRACT"),
    listEntityItems("RENTAL_REQUEST")
  ]);

  const openContracts = contracts.filter((item) => (
    blockingContractStatuses.has(item.status) && hasIdentityOverlap(customerKeys, normalizedIdentitySet(item.customerId))
  ));
  const openRentalRequests = rentalRequests.filter((item) => (
    blockingRentalRequestStatuses.has(item.status) &&
    !item.convertedAt &&
    hasIdentityOverlap(customerKeys, normalizedIdentitySet(item.email, item.createdBy))
  ));

  if (openContracts.length > 0 || openRentalRequests.length > 0) {
    throw httpError(409, buildDeleteBlockMessage("khách hàng này", openContracts.length, openRentalRequests.length));
  }
}

function buildDeleteBlockMessage(target, contractCount, rentalRequestCount) {
  const parts = [];
  if (contractCount > 0) parts.push(`${contractCount} hợp đồng đang mở`);
  if (rentalRequestCount > 0) parts.push(`${rentalRequestCount} yêu cầu thuê đang xử lý`);
  return `Không thể xóa ${target} vì còn ${parts.join(" và ")}. Vui lòng xử lý dữ liệu liên quan trước.`;
}

function normalizedIdentitySet(...values) {
  return new Set(values
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim().toLowerCase()));
}

function hasIdentityOverlap(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

async function getRawByGsi2(gsi2pk, notFoundMessage) {
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :pk",
    ExpressionAttributeValues: { ":pk": gsi2pk },
    Limit: 1
  }));
  const item = result.Items?.[0];
  if (!item) throw httpError(404, notFoundMessage);
  return item;
}

async function queryItemsByPk(pk) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ExclusiveStartKey: exclusiveStartKey
    }));
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

async function listEntityItems(entityType) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `ENTITY#${entityType}` },
      ScanIndexForward: false,
      ExclusiveStartKey: exclusiveStartKey
    }));
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

async function queryFilteredEntity(entityType, limit, nextToken, predicate = () => true) {
  const items = [];
  let exclusiveStartKey = decodeNextToken(nextToken);

  while (items.length < limit) {
    const result = await dynamo.send(new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `ENTITY#${entityType}` },
      ScanIndexForward: false,
      Limit: Math.min(Math.max(limit * 2, 50), 200),
      ExclusiveStartKey: exclusiveStartKey
    }));
    const page = result.Items ?? [];

    for (let index = 0; index < page.length; index += 1) {
      const item = page[index];
      if (!predicate(item)) continue;
      items.push(item);
      if (items.length === limit) {
        const hasMore = index < page.length - 1 || Boolean(result.LastEvaluatedKey);
        return { Items: items, LastEvaluatedKey: hasMore ? entityCursor(item) : undefined };
      }
    }

    if (!result.LastEvaluatedKey) return { Items: items, LastEvaluatedKey: undefined };
    exclusiveStartKey = result.LastEvaluatedKey;
  }

  return { Items: items, LastEvaluatedKey: exclusiveStartKey };
}

function entityCursor(item) {
  return {
    PK: item.PK,
    SK: item.SK,
    GSI1PK: item.GSI1PK,
    GSI1SK: item.GSI1SK
  };
}

async function queryCustomerEntities(request, entityPrefix) {
  const identities = [...normalizedIdentitySet(request.claims.email, request.claims.sub)];
  const results = await Promise.all(identities.map((identity) => dynamo.send(new QueryCommand({
    TableName: tableName,
    IndexName: "GSI3",
    KeyConditionExpression: "GSI3PK = :pk AND begins_with(GSI3SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `CUSTOMER#${identity}`,
      ":prefix": `${entityPrefix}#`
    },
    ScanIndexForward: false,
    Limit: 200
  }))));

  const byId = new Map();
  for (const result of results) {
    for (const item of result.Items ?? []) byId.set(`${item.PK}|${item.SK}`, item);
  }
  return [...byId.values()].filter((item) => !item.deletedAt);
}

async function queryCustomerEntitiesByIdentity(identity, entityPrefix) {
  const normalized = requireString(identity, "customer identity").toLowerCase();
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    IndexName: "GSI3",
    KeyConditionExpression: "GSI3PK = :pk AND begins_with(GSI3SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `CUSTOMER#${normalized}`,
      ":prefix": `${entityPrefix}#`
    },
    ScanIndexForward: false,
    Limit: 200
  }));
  return (result.Items ?? []).filter((item) => !item.deletedAt);
}

async function updateItem({ key, updates, condition }) {
  const parts = buildUpdateParts(updates);

  return await dynamo.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: parts.expression,
    ExpressionAttributeNames: parts.names,
    ExpressionAttributeValues: parts.values,
    ConditionExpression: condition,
    ReturnValues: "ALL_NEW"
  }));
}

export function buildUpdateParts(updates) {
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw httpError(400, "Không có trường hợp lệ để cập nhật.");
  const names = {};
  const values = {};
  const expressions = entries.map(([field, value], index) => {
    const nameKey = `#f${index}`;
    const valueKey = `:v${index}`;
    names[nameKey] = field;
    values[valueKey] = value;
    return `${nameKey} = ${valueKey}`;
  });
  return { expression: `SET ${expressions.join(", ")}`, names, values };
}

function normalizeRequest(event) {
  const rawPath = event.rawPath ?? event.path ?? "/";
  return {
    event,
    method: event.requestContext?.http?.method ?? event.httpMethod ?? "GET",
    path: rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath,
    query: event.queryStringParameters ?? {},
    claims: getJwtClaims(event)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Body phải là JSON hợp lệ.");
  }
}

function getJwtClaims(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (claims?.sub) return claims;

  const devAuthEnabled = process.env.DEV_AUTH_ENABLED === "true" || process.env.AWS_SAM_LOCAL === "true";
  if (!devAuthEnabled) return claims ?? {};

  const headers = normalizeHeaders(event.headers ?? {});
  const tokenClaims = decodeBearerClaims(headers.authorization);
  if (tokenClaims?.sub) return tokenClaims;

  const sub = headers["x-dev-user-id"];
  if (!sub) return {};

  return {
    sub,
    email: headers["x-dev-user-email"] ?? `${sub}@local.test`,
    "cognito:groups": headers["x-dev-user-groups"] ?? ""
  };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function decodeBearerClaims(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function requireAuthenticated(request) {
  if (!request.claims.sub) throw httpError(401, "Cần đăng nhập.");
}

function requireAdmin(request) {
  requireAuthenticated(request);
  if (!isAdmin(request)) throw httpError(403, "Cần quyền admin.");
}

function isAdmin(request) {
  return claimValues(request.claims["cognito:groups"]).includes("admin");
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") throw httpError(400, `Thiếu trường bắt buộc: ${fieldName}`);
  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function optionalContractDateTime(value, fieldName) {
  const text = optionalString(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    throw httpError(400, `${fieldName} phải bao gồm cả ngày và giờ.`);
  }
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) throw httpError(400, `${fieldName} không đúng định dạng ngày giờ.`);
  const date = new Date(time);
  if (date.getUTCMinutes() % 30 !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
    throw httpError(400, "Thời gian hợp đồng phải theo khung 30 phút.");
  }
  return date.toISOString();
}

function requireFutureDateTime(value, fieldName) {
  const text = requireString(value, fieldName);
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) throw httpError(400, `${fieldName} không đúng định dạng ngày giờ.`);
  if (time <= Date.now()) throw httpError(400, "Thời gian lịch hẹn phải ở tương lai.");
  const date = new Date(time);
  if (date.getUTCMinutes() % 30 !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
    throw httpError(400, "Thời gian lịch hẹn phải theo khung 30 phút.");
  }
  return new Date(time).toISOString();
}

function requireEmail(value, fieldName) {
  const email = requireString(value, fieldName).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, `${fieldName} không đúng định dạng email.`);
  return email;
}

export function resolveCustomerEmail(request, submittedEmail) {
  if (!isAdmin(request)) return requireEmail(request.claims.email, "email Cognito");
  return requireEmail(submittedEmail ?? request.claims.email, "email");
}

function requirePositiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `${fieldName} phải là số >= 0.`);
  return number;
}

function requireInteger(value, fieldName, minimum = 0, maximum = 10000) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw httpError(400, `${fieldName} phải là số nguyên từ ${minimum} đến ${maximum}.`);
  }
  return number;
}

function parseOfficeLocation(body, current = {}) {
  const buildingName = body.buildingName === undefined ? current.buildingName : optionalString(body.buildingName);
  const buildingIdInput = body.buildingId === undefined ? current.buildingId : optionalString(body.buildingId);
  const buildingId = buildingIdInput || (buildingName ? slugifyLocation(buildingName) : "");
  const floor = body.floor === undefined
    ? current.floor
    : requireInteger(body.floor, "floor", -5, 200);
  const roomNumber = body.roomNumber === undefined ? current.roomNumber : optionalString(body.roomNumber);
  const position = body.position === undefined
    ? current.position
    : requireInteger(body.position, "position", 0, 10000);
  const hasAnyLocation = Boolean(buildingName || buildingId || roomNumber || floor !== undefined);
  if (hasAnyLocation && (!buildingName || !buildingId || !roomNumber || floor === undefined)) {
    throw httpError(400, "Vị trí văn phòng cần đủ tên tòa nhà, tầng và số phòng.");
  }
  if (roomNumber && roomNumber.length > 30) throw httpError(400, "Số phòng không được vượt quá 30 ký tự.");
  return pickDefined({ buildingId, buildingName, floor, roomNumber, position: position ?? 0 });
}

function slugifyLocation(value) {
  const slug = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `building-${stableHash(String(value)).slice(0, 10)}`;
}

function requireEnum(value, allowedValues, fieldName) {
  const normalized = requireString(value, fieldName).toUpperCase();
  if (!allowedValues.has(normalized)) throw httpError(400, `${fieldName} không hợp lệ.`);
  return normalized;
}

function requireStringArray(value, fieldName) {
  if (!Array.isArray(value)) throw httpError(400, `${fieldName} phải là mảng.`);
  return value.map((item) => requireString(item, fieldName));
}

function normalizeId(value, fieldName) {
  const id = requireString(value, fieldName);
  if (!/^[a-zA-Z0-9._-]{3,120}$/.test(id)) {
    throw httpError(400, `${fieldName} chỉ được chứa chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.`);
  }
  return id;
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function requireImageContentType(value) {
  const contentType = optionalString(value).toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw httpError(400, "Ảnh văn phòng phải có định dạng JPG, PNG hoặc WebP.");
  }
  return contentType;
}

function requirePdfContentType(value) {
  const contentType = optionalString(value).toLowerCase();
  if (contentType !== "application/pdf") throw httpError(400, "Hợp đồng chỉ chấp nhận tệp PDF.");
  return contentType;
}

function requireFileSize(value, maximumBytes, label) {
  const size = Number(value);
  if (!Number.isInteger(size) || size <= 0) throw httpError(400, `${label} phải có dung lượng hợp lệ.`);
  if (size > maximumBytes) throw httpError(400, `${label} vượt quá giới hạn ${Math.round(maximumBytes / 1024 / 1024)} MB.`);
  return size;
}

function extensionFromContentType(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function readLimit(value, fallback) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.floor(limit), 1), 200);
}

function encodeNextToken(key) {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeNextToken(token) {
  if (!token) return undefined;
  try {
    const key = JSON.parse(Buffer.from(String(token), "base64url").toString("utf8"));
    if (!key || typeof key !== "object" || Array.isArray(key)) throw new Error("invalid");
    return key;
  } catch {
    throw httpError(400, "nextToken không hợp lệ.");
  }
}

function pickDefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function pathParam(path, index) {
  return decodeURIComponent(path.split("/")[index + 1] ?? "");
}

function officeKey(id) {
  return { PK: `OFFICE#${id}`, SK: "METADATA" };
}

function officeLocationKey(office) {
  if (!office.buildingId || office.floor === undefined || !office.roomNumber) return null;
  return {
    PK: `LOCATION#${String(office.buildingId).toLowerCase()}`,
    SK: `FLOOR#${office.floor}#ROOM#${String(office.roomNumber).toLowerCase()}`
  };
}

function officeLocationLock(office, now) {
  return {
    ...officeLocationKey(office),
    entityType: "OFFICE_LOCATION_LOCK",
    officeId: office.id,
    buildingId: office.buildingId,
    floor: office.floor,
    roomNumber: office.roomNumber,
    updatedAt: now
  };
}

function userProfileKey(sub) {
  return { PK: `USER#${sub}`, SK: "PROFILE" };
}

function defaultUserProfile(claims) {
  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email ?? "",
    displayName: claims.name ?? "",
    phone: "",
    avatarKey: "",
    avatarUrl: "",
    avatarDataUrl: "",
    createdAt: undefined,
    updatedAt: undefined
  };
}

function defaultUserProfileItem(claims, now) {
  return {
    ...userProfileKey(claims.sub),
    GSI1PK: "ENTITY#USER_PROFILE",
    GSI1SK: `USER_PROFILE#${now}#${claims.sub}`,
    GSI2PK: `USER_PROFILE#${claims.sub}`,
    GSI2SK: "METADATA",
    entityType: "USER_PROFILE",
    id: claims.sub,
    sub: claims.sub,
    email: claims.email ?? "",
    displayName: claims.name ?? "",
    phone: "",
    avatarKey: "",
    avatarDataUrl: "",
    createdAt: now,
    updatedAt: now,
    updatedBy: claims.sub
  };
}

function toOffice(item) {
  return {
    id: item.id,
    title: item.title,
    address: item.address,
    areaSqm: item.areaSqm,
    monthlyPrice: item.monthlyPrice,
    status: item.status,
    buildingId: item.buildingId,
    buildingName: item.buildingName,
    floor: item.floor,
    roomNumber: item.roomNumber,
    position: item.position ?? 0,
    description: item.description,
    imageUrl: item.imageUrl,
    externalImageUrl: item.imageUrl,
    imageKey: item.imageKey,
    processedImageKey: item.processedImageKey,
    processedImageReady: Boolean(item.processedImageReady),
    amenities: item.amenities ?? [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function toRentalRequest(item) {
  return {
    id: item.id,
    officeId: item.officeId,
    customerName: item.customerName,
    email: item.email,
    phone: item.phone,
    message: item.message,
    requestType: item.requestType ?? "NEW_LEASE",
    renewalContractId: item.renewalContractId,
    status: item.status,
    decisionNote: item.decisionNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    createdBy: item.createdBy
  };
}

function toContract(item) {
  return {
    id: item.id,
    officeId: item.officeId,
    customerId: item.customerId,
    rentalRequestId: item.rentalRequestId,
    title: item.title,
    status: item.status,
    startDate: item.startDate,
    endDate: item.endDate,
    monthlyPrice: item.monthlyPrice,
    fileKey: item.fileKey,
    endedAt: item.endedAt,
    renewedAt: item.renewedAt,
    renewalDeadline: ["EXPIRED", "TERMINATED"].includes(item.status) ? resolveContractRenewalDeadline(item) : undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    createdBy: item.createdBy
  };
}

function toAppointment(item) {
  return {
    id: item.id,
    officeId: item.officeId,
    customerName: item.customerName,
    email: item.email,
    phone: item.phone,
    scheduledAt: item.scheduledAt,
    note: item.note,
    adminNote: item.adminNote,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function toCustomer(item) {
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function toUserProfile(item, claims = {}) {
  return {
    id: item.id ?? claims.sub,
    sub: item.sub ?? claims.sub,
    email: item.email ?? claims.email ?? "",
    displayName: item.displayName ?? claims.name ?? "",
    phone: item.phone ?? "",
    avatarKey: item.avatarKey ?? "",
    avatarUrl: "",
    avatarDataUrl: item.avatarDataUrl ?? "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function ok(body) {
  return { statusCode: 200, body };
}

function created(body) {
  return { statusCode: 201, body };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}

function rawResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...corsHeaders, ...headers },
    body: String(body ?? "")
  };
}
