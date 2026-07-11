import { randomUUID } from "node:crypto";
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
const contractTransitions = {
  DRAFT: new Set(["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "TERMINATED"]),
  PENDING_SIGNATURE: new Set(["PENDING_SIGNATURE", "ACTIVE", "TERMINATED"]),
  ACTIVE: new Set(["ACTIVE", "EXPIRED", "TERMINATED"]),
  EXPIRED: new Set(["EXPIRED"]),
  TERMINATED: new Set(["TERMINATED"])
};
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

  if (method === "GET" && path === "/admin/rental-requests") return ok(await listRentalRequests(request));
  if (method === "POST" && path === "/admin/rental-requests") return created(await createRentalRequest(request));
  if (method === "GET" && /^\/admin\/rental-requests\/[^/]+$/.test(path)) {
    return ok(await getRentalRequestById(pathParam(path, 2)));
  }
  if (method === "PATCH" && /^\/admin\/rental-requests\/[^/]+$/.test(path)) {
    return ok(await updateRentalRequestStatus(request, pathParam(path, 2)));
  }
  if (method === "DELETE" && /^\/admin\/rental-requests\/[^/]+$/.test(path)) {
    return ok(await cancelRentalRequest(request, pathParam(path, 2)));
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
  if (method === "GET" && /^\/admin\/appointments\/[^/]+$/.test(path)) {
    return ok(await getAppointmentById(pathParam(path, 2)));
  }
  if (method === "PATCH" && /^\/admin\/appointments\/[^/]+$/.test(path)) {
    return ok(await updateAppointmentStatus(request, pathParam(path, 2)));
  }

  if (method === "GET" && /^\/admin\/reports\/(offices|customers|revenue)\.csv$/.test(path)) {
    return await exportAdminReport(pathParam(path, 2));
  }

  if (method === "GET" && path === "/admin/customers") return ok(await listCustomers(request));
  if (method === "POST" && path === "/admin/customers") return created(await createCustomer(request));
  if (method === "GET" && /^\/admin\/customers\/[^/]+$/.test(path)) return ok(await getCustomerById(pathParam(path, 2)));
  if (method === "PATCH" && /^\/admin\/customers\/[^/]+$/.test(path)) return ok(await updateCustomer(request, pathParam(path, 2)));
  if (method === "DELETE" && /^\/admin\/customers\/[^/]+$/.test(path)) return ok(await deleteCustomer(request, pathParam(path, 2)));

  throw httpError(404, "Admin route không tồn tại.");
}

async function listOffices(request, options = {}) {
  const query = request.query.q?.toLowerCase();
  const status = request.query.status;
  const result = await queryEntity("OFFICE", readLimit(request.query.limit, 50), request.query.nextToken);
  let items = (result.Items ?? []).map(toOffice);

  if (!options.includeInactive) items = items.filter((office) => office.status !== "INACTIVE");
  if (status) items = items.filter((office) => office.status === status);
  if (query) items = items.filter((office) => `${office.title} ${office.address}`.toLowerCase().includes(query));
  items = await hydrateOfficeImageUrls(items);

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
    imageKey: optionalString(body.imageKey),
    processedImageKey: optionalString(body.processedImageKey),
    processedImageReady: Boolean(body.processedImageReady),
    amenities: body.amenities === undefined ? [] : requireStringArray(body.amenities, "amenities"),
    createdAt: now,
    updatedAt: now,
    createdBy: request.claims.sub ?? "unknown",
    updatedBy: request.claims.sub ?? "unknown"
  };

  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: item,
    ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
  }));

  return { item: await hydrateOfficeImageUrl(toOffice(item)) };
}

async function updateOffice(request, id) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: officeKey(id),
    updates: pickDefined({
      title: body.title === undefined ? undefined : requireString(body.title, "title"),
      address: body.address === undefined ? undefined : requireString(body.address, "address"),
      areaSqm: body.areaSqm === undefined ? undefined : requirePositiveNumber(body.areaSqm, "areaSqm"),
      monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
      status: body.status === undefined ? undefined : requireEnum(body.status, officeStatuses, "status"),
      description: body.description === undefined ? undefined : optionalString(body.description),
      imageUrl: body.imageUrl === undefined ? undefined : optionalString(body.imageUrl),
      imageKey: body.imageKey === undefined ? undefined : optionalString(body.imageKey),
      processedImageKey: body.processedImageKey === undefined ? undefined : optionalString(body.processedImageKey),
      processedImageReady: body.processedImageReady === undefined ? undefined : Boolean(body.processedImageReady),
      amenities: body.amenities === undefined ? undefined : requireStringArray(body.amenities, "amenities"),
      updatedAt: now,
      updatedBy: request.claims.sub ?? "unknown"
    }),
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: await hydrateOfficeImageUrl(toOffice(result.Attributes)) };
}

async function deleteOffice(request, id) {
  await assertOfficeCanBeDeleted(id);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: officeKey(id),
    updates: { status: "INACTIVE", deletedAt: now, deletedBy: request.claims.sub ?? "unknown", updatedAt: now, updatedBy: request.claims.sub ?? "unknown" },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
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

async function createRentalRequest(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = randomUUID();
  const officeId = requireString(body.officeId, "officeId");
  const email = requireEmail(body.email ?? request.claims.email, "email");
  const customerName = requireString(body.customerName, "customerName");

  if (!isAdmin(request) && email !== requireEmail(request.claims.email, "email Cognito")) {
    throw httpError(403, "Email yêu cầu thuê phải trùng với email tài khoản đang đăng nhập.");
  }

  await assertOfficeExists(officeId);
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

  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
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
  const result = await queryEntity("RENTAL_REQUEST", readLimit(request.query.limit, 100), request.query.nextToken);
  let items = (result.Items ?? []).map(toRentalRequest);
  if (request.query.status) items = items.filter((item) => item.status === request.query.status);
  if (request.query.officeId) items = items.filter((item) => item.officeId === request.query.officeId);
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function listCurrentUserRentalRequests(request) {
  const items = await queryCustomerEntities(request, "REQUEST");
  return { items: items.map(toRentalRequest), count: items.length };
}

async function updateRentalRequestStatus(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`REQUEST#${id}`, "Không tìm thấy yêu cầu thuê.");
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: {
      status: requireEnum(body.status, rentalRequestStatuses, "status"),
      decisionNote: optionalString(body.decisionNote),
      updatedAt: now,
      updatedBy: request.claims.sub ?? "admin"
    },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: toRentalRequest(result.Attributes) };
}

async function cancelRentalRequest(request, id) {
  const current = await getRawByGsi2(`REQUEST#${id}`, "Không tìm thấy yêu cầu thuê.");
  await assertRentalRequestCanBeDeleted(current);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: { status: "CANCELLED", updatedAt: now, updatedBy: request.claims.sub ?? "admin" },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: toRentalRequest(result.Attributes) };
}

async function createAppointment(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = randomUUID();
  const officeId = requireString(body.officeId, "officeId");
  const email = requireEmail(body.email ?? request.claims.email, "email");
  const customerName = requireString(body.customerName, "customerName");
  const scheduledAt = requireFutureDateTime(body.scheduledAt, "scheduledAt");

  if (!isAdmin(request) && email !== requireEmail(request.claims.email, "email Cognito")) {
    throw httpError(403, "Email lịch hẹn phải trùng với email tài khoản đang đăng nhập.");
  }
  await assertOfficeExists(officeId);
  await assertNoDuplicateAppointment(officeId, email, scheduledAt);

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
  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: item,
    ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
  }));
  return { item: toAppointment(item) };
}

async function listAppointments(request) {
  const result = await queryEntity("APPOINTMENT", readLimit(request.query.limit, 100), request.query.nextToken);
  let items = (result.Items ?? []).map(toAppointment);
  if (request.query.status) items = items.filter((item) => item.status === request.query.status);
  if (request.query.officeId) items = items.filter((item) => item.officeId === request.query.officeId);
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function listCurrentUserAppointments(request) {
  const items = await queryCustomerEntities(request, "APPOINTMENT");
  return { items: items.map(toAppointment), count: items.length };
}

async function getAppointmentById(id) {
  const item = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  return { item: toAppointment(item) };
}

async function updateAppointmentStatus(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  const status = requireEnum(body.status, appointmentStatuses, "status");
  assertAppointmentTransition(current.status, status, true);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: {
      status,
      adminNote: body.adminNote === undefined ? current.adminNote : optionalString(body.adminNote),
      updatedAt: now,
      updatedBy: request.claims.sub
    },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: toAppointment(result.Attributes) };
}

async function cancelCurrentUserAppointment(request, id) {
  const current = await getRawByGsi2(`APPOINTMENT#${id}`, "Không tìm thấy lịch hẹn.");
  if (!entityBelongsToCurrentUser(current, request)) throw httpError(403, "Bạn không có quyền hủy lịch hẹn này.");
  assertAppointmentTransition(current.status, "CANCELLED", false);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: { status: "CANCELLED", updatedAt: now, updatedBy: request.claims.sub },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: toAppointment(result.Attributes) };
}

async function createContract(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = body.id ? normalizeId(body.id, "id") : randomUUID();
  const officeId = requireString(body.officeId, "officeId");
  const customerId = requireString(body.customerId ?? body.customerEmail, "customerId").toLowerCase();
  const rentalRequestId = optionalString(body.rentalRequestId);
  const status = requireEnum(body.status ?? "DRAFT", contractStatuses, "status");
  const startDate = optionalDate(body.startDate, "startDate");
  const endDate = optionalDate(body.endDate, "endDate");

  await assertOfficeExists(officeId);
  await assertCustomerExists(customerId);
  validateContractDates(startDate, endDate, status);
  const rentalRequest = rentalRequestId
    ? await assertRentalRequestMatchesContract(rentalRequestId, officeId, customerId)
    : null;

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
    title: optionalString(body.title) || `Hợp đồng ${id}`,
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
  const result = await queryEntity("CONTRACT", readLimit(request.query.limit, 100), request.query.nextToken);
  let items = (result.Items ?? []).map(toContract);
  if (request.query.status) items = items.filter((item) => item.status === request.query.status);
  if (request.query.officeId) items = items.filter((item) => item.officeId === request.query.officeId);
  if (request.query.customerId) items = items.filter((item) => item.customerId === request.query.customerId);
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

  const item = {
    ...key,
    GSI1PK: "ENTITY#USER_PROFILE",
    GSI1SK: `USER_PROFILE#${existing.Item?.createdAt ?? now}#${request.claims.sub}`,
    GSI2PK: `USER_PROFILE#${request.claims.sub}`,
    GSI2SK: "METADATA",
    entityType: "USER_PROFILE",
    id: request.claims.sub,
    sub: request.claims.sub,
    email: request.claims.email ?? existing.Item?.email ?? "",
    displayName: body.displayName === undefined ? existing.Item?.displayName ?? request.claims.name ?? "" : optionalString(body.displayName),
    phone: body.phone === undefined ? existing.Item?.phone ?? "" : optionalString(body.phone),
    avatarKey: existing.Item?.avatarKey ?? "",
    avatarDataUrl: existing.Item?.avatarDataUrl ?? "",
    createdAt: existing.Item?.createdAt ?? now,
    updatedAt: now,
    updatedBy: request.claims.sub
  };

  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
  return { item: await hydrateUserProfileAvatar(toUserProfile(item, request.claims)) };
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
  const item = {
    ...(existing.Item ?? defaultUserProfileItem(request.claims, now)),
    ...profileKey,
    avatarKey: key,
    avatarDataUrl: "",
    updatedAt: now,
    updatedBy: request.claims.sub
  };
  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));

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
  const nextStartDate = body.startDate === undefined ? current.startDate : optionalDate(body.startDate, "startDate");
  const nextEndDate = body.endDate === undefined ? current.endDate : optionalDate(body.endDate, "endDate");
  validateContractDates(nextStartDate, nextEndDate, nextStatus);

  const updates = pickDefined({
    title: body.title === undefined ? undefined : optionalString(body.title),
    status: body.status === undefined ? undefined : nextStatus,
    startDate: body.startDate === undefined ? undefined : nextStartDate,
    endDate: body.endDate === undefined ? undefined : nextEndDate,
    monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
    fileKey: body.fileKey === undefined ? undefined : optionalString(body.fileKey),
    updatedAt: now,
    updatedBy: request.claims.sub ?? "admin"
  });

  if (current.status !== "ACTIVE" && nextStatus === "ACTIVE") {
    await assertNoActiveContract(current.officeId, current.id);
    const rentalRequest = current.rentalRequestId
      ? await assertRentalRequestMatchesContract(current.rentalRequestId, current.officeId, current.customerId)
      : null;
    await activateExistingContract(current, updates, rentalRequest);
    return await getContractById(id);
  }

  if (current.status === "ACTIVE" && nextStatus !== "ACTIVE") {
    await deactivateContract(current, updates);
    return await getContractById(id);
  }

  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates,
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: toContract(result.Attributes) };
}

async function deleteContract(request, id) {
  const current = await getRawByGsi2(`CONTRACT#${id}`, "Không tìm thấy hợp đồng.");
  assertContractCanBeDeleted(current);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: { status: "TERMINATED", deletedAt: now, deletedBy: request.claims.sub ?? "admin", updatedAt: now, updatedBy: request.claims.sub ?? "admin" },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
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
  return { item: toContract(result.Attributes) };
}

async function listCustomers(request) {
  const result = await queryEntity("CUSTOMER", readLimit(request.query.limit, 100), request.query.nextToken);
  let items = (result.Items ?? []).map(toCustomer);
  const query = request.query.q?.toLowerCase();
  if (query) items = items.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(query));
  return { items, count: items.length, nextToken: encodeNextToken(result.LastEvaluatedKey) };
}

async function getCustomerById(id) {
  const item = await getRawByGsi2(`CUSTOMER#${id}`, "Không tìm thấy khách hàng.");
  return { item: toCustomer(item) };
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
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: pickDefined({
      name: body.name === undefined ? undefined : requireString(body.name, "name"),
      phone: body.phone === undefined ? undefined : optionalString(body.phone),
      status: body.status === undefined ? undefined : requireEnum(body.status, new Set(["ACTIVE", "INACTIVE"]), "status"),
      updatedAt: now,
      updatedBy: request.claims.sub ?? "admin"
    }),
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
  return { item: toCustomer(result.Attributes) };
}

async function deleteCustomer(request, id) {
  const current = await getRawByGsi2(`CUSTOMER#${id}`, "Không tìm thấy khách hàng.");
  await assertCustomerCanBeDeleted(request, current);
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: { status: "INACTIVE", deletedAt: now, deletedBy: request.claims.sub ?? "admin", updatedAt: now, updatedBy: request.claims.sub ?? "admin" },
    condition: "attribute_exists(PK) AND attribute_exists(SK)"
  });
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
    headers = ["id", "title", "address", "areaSqm", "monthlyPrice", "status", "createdAt"];
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
  return {
    item: {
      offices: offices.filter((item) => item.status !== "INACTIVE").length,
      pendingRentalRequests: requests.filter((item) => item.status === "PENDING").length,
      activeContracts: contracts.filter((item) => item.status === "ACTIVE").length,
      customers: customers.filter((item) => item.status !== "INACTIVE").length,
      pendingAppointments: appointments.filter((item) => item.status === "REQUESTED").length
    }
  };
}

async function activateNewContract(contract, rentalRequest) {
  const now = new Date().toISOString();
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
  if (rentalRequest) transactItems.push(rentalRequestApprovalUpdate(rentalRequest, now));
  await sendContractTransaction(transactItems);
}

async function activateExistingContract(contract, updates, rentalRequest) {
  const now = new Date().toISOString();
  const updateParts = buildUpdateParts(updates);
  updateParts.values[":expectedStatus"] = contract.status;
  const transactItems = [
    {
      Update: {
        TableName: tableName,
        Key: { PK: contract.PK, SK: contract.SK },
        UpdateExpression: updateParts.expression,
        ExpressionAttributeNames: updateParts.names,
        ExpressionAttributeValues: updateParts.values,
        ConditionExpression: "#status = :expectedStatus"
      }
    },
    activeContractLockPut(contract, now),
    officeLeaseUpdate(contract.officeId, contract.id, now)
  ];
  if (rentalRequest) transactItems.push(rentalRequestApprovalUpdate(rentalRequest, now));
  await sendContractTransaction(transactItems);
}

async function deactivateContract(contract, updates) {
  const now = new Date().toISOString();
  const updateParts = buildUpdateParts(updates);
  updateParts.values[":expectedStatus"] = "ACTIVE";
  const lockKey = activeContractLockKey(contract.officeId);
  const lock = await dynamo.send(new GetCommand({ TableName: tableName, Key: lockKey }));
  const transactItems = [
    {
      Update: {
        TableName: tableName,
        Key: { PK: contract.PK, SK: contract.SK },
        UpdateExpression: updateParts.expression,
        ExpressionAttributeNames: updateParts.names,
        ExpressionAttributeValues: updateParts.values,
        ConditionExpression: "#status = :expectedStatus"
      }
    },
    {
      Update: {
        TableName: tableName,
        Key: officeKey(contract.officeId),
        UpdateExpression: "SET #status = :available, updatedAt = :now, updatedBy = :actor REMOVE activeContractId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":available": "AVAILABLE", ":now": now, ":actor": "contract-workflow", ":leased": "LEASED" },
        ConditionExpression: "attribute_exists(PK) AND #status = :leased"
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
      UpdateExpression: "SET #status = :approved, updatedAt = :now, updatedBy = :actor",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":approved": "APPROVED", ":now": now, ":actor": "contract-workflow" },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
    }
  };
}

async function sendContractTransaction(transactItems) {
  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw httpError(409, "Không thể kích hoạt hợp đồng. Văn phòng có thể đã có hợp đồng hiệu lực hoặc dữ liệu vừa thay đổi.");
    }
    throw error;
  }
}

async function assertNoActiveContract(officeId, excludedContractId = "") {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const active = children.find((item) => item.entityType === "CONTRACT" && item.status === "ACTIVE" && item.id !== excludedContractId);
  if (active) throw httpError(409, "Văn phòng đã có hợp đồng đang hiệu lực.");
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
  if (!contractTransitions[currentStatus]?.has(nextStatus)) {
    throw httpError(409, `Không thể chuyển hợp đồng từ ${currentStatus} sang ${nextStatus}.`);
  }
}

function validateContractDates(startDate, endDate, status) {
  if (status === "ACTIVE" && (!startDate || !endDate)) {
    throw httpError(400, "Hợp đồng hiệu lực phải có ngày bắt đầu và ngày kết thúc.");
  }
  if (startDate && endDate && new Date(startDate).getTime() >= new Date(endDate).getTime()) {
    throw httpError(400, "Ngày bắt đầu hợp đồng phải trước ngày kết thúc.");
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
    blockingRentalRequestStatuses.has(item.status)
  ));
  if (duplicate) throw httpError(409, "Bạn đã có một yêu cầu thuê đang được xử lý cho văn phòng này.");
}

async function assertNoDuplicateAppointment(officeId, email, scheduledAt) {
  const children = await queryItemsByPk(`OFFICE#${officeId}`);
  const duplicate = children.find((item) => (
    item.entityType === "APPOINTMENT" &&
    item.email?.toLowerCase() === email.toLowerCase() &&
    item.scheduledAt === scheduledAt &&
    !["REJECTED", "CANCELLED"].includes(item.status)
  ));
  if (duplicate) throw httpError(409, "Bạn đã có lịch hẹn vào thời gian này.");
}

function assertAppointmentTransition(currentStatus, nextStatus, admin) {
  const allowed = admin
    ? {
        REQUESTED: new Set(["REQUESTED", "CONFIRMED", "REJECTED", "CANCELLED"]),
        CONFIRMED: new Set(["CONFIRMED", "COMPLETED", "CANCELLED"]),
        COMPLETED: new Set(["COMPLETED"]),
        REJECTED: new Set(["REJECTED"]),
        CANCELLED: new Set(["CANCELLED"])
      }
    : {
        REQUESTED: new Set(["CANCELLED"]),
        CONFIRMED: new Set(["CANCELLED"])
      };
  if (!allowed[currentStatus]?.has(nextStatus)) {
    throw httpError(409, "Trạng thái lịch hẹn không cho phép thao tác này.");
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
  const openRentalRequests = children.filter((item) => item.entityType === "RENTAL_REQUEST" && blockingRentalRequestStatuses.has(item.status));

  if (openContracts.length > 0 || openRentalRequests.length > 0) {
    throw httpError(409, buildDeleteBlockMessage("văn phòng này", openContracts.length, openRentalRequests.length));
  }
}

async function assertRentalRequestCanBeDeleted(requestItem) {
  if (requestItem.status === "APPROVED") {
    throw httpError(409, "Không thể hủy yêu cầu thuê đã được duyệt. Vui lòng xử lý hợp đồng liên quan trước.");
  }

  if (requestItem.status === "CANCELLED") return;

  const contracts = await listEntityItems("CONTRACT");
  const linkedContracts = contracts.filter((item) => (
    item.rentalRequestId === requestItem.id && blockingContractStatuses.has(item.status)
  ));

  if (linkedContracts.length > 0) {
    throw httpError(409, "Không thể hủy yêu cầu thuê vì đã có hợp đồng liên quan đang xử lý.");
  }
}

function assertContractCanBeDeleted(contractItem) {
  if (protectedContractDeleteStatuses.has(contractItem.status)) {
    throw httpError(409, "Không thể xóa hợp đồng đang chờ ký hoặc đang hiệu lực. Vui lòng hoàn tất quy trình kết thúc hợp đồng trước.");
  }
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

async function queryEntity(entityType, limit, nextToken) {
  return await dynamo.send(new QueryCommand({
    TableName: tableName,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `ENTITY#${entityType}` },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: decodeNextToken(nextToken)
  }));
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
  return [...byId.values()];
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

function buildUpdateParts(updates) {
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
  if (Object.values(names).includes("status")) names["#status"] = "status";
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
  const groups = request.claims["cognito:groups"];
  if (Array.isArray(groups)) return groups.includes("admin");
  if (typeof groups === "string") return groups.split(",").map((group) => group.trim()).includes("admin");
  return false;
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") throw httpError(400, `Thiếu trường bắt buộc: ${fieldName}`);
  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function optionalDate(value, fieldName) {
  const text = optionalString(value);
  if (!text) return "";
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) throw httpError(400, `${fieldName} không đúng định dạng ngày.`);
  return text;
}

function requireFutureDateTime(value, fieldName) {
  const text = requireString(value, fieldName);
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) throw httpError(400, `${fieldName} không đúng định dạng ngày giờ.`);
  if (time <= Date.now()) throw httpError(400, "Thời gian lịch hẹn phải ở tương lai.");
  return new Date(time).toISOString();
}

function requireEmail(value, fieldName) {
  const email = requireString(value, fieldName).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, `${fieldName} không đúng định dạng email.`);
  return email;
}

function requirePositiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `${fieldName} phải là số >= 0.`);
  return number;
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
