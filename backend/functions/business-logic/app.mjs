import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

export async function handler(event) {
  try {
    const request = normalizeRequest(event);

    if (request.method === "OPTIONS") {
      return json(204, {});
    }

    const route = await dispatch(request);
    return json(route.statusCode, route.body);
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

  if (method === "GET" && path === "/me/rental-requests") {
    requireAuthenticated(request);
    return ok(await listCurrentUserRentalRequests(request));
  }

  if (method === "GET" && path === "/me/contracts") {
    requireAuthenticated(request);
    return ok(await listCurrentUserContracts(request));
  }

  if (method === "GET" && path === "/me/profile") {
    requireAuthenticated(request);
    return ok(await getCurrentUserProfile(request));
  }

  if (method === "PATCH" && path === "/me/profile") {
    requireAuthenticated(request);
    return ok(await updateCurrentUserProfile(request));
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
  const result = await queryEntity("OFFICE", readLimit(request.query.limit, 50));
  let items = (result.Items ?? []).map(toOffice);

  if (!options.includeInactive) items = items.filter((office) => office.status !== "INACTIVE");
  if (status) items = items.filter((office) => office.status === status);
  if (query) items = items.filter((office) => `${office.title} ${office.address}`.toLowerCase().includes(query));
  items = await hydrateOfficeImageUrls(items);

  return { items, count: items.length };
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
  const email = requireEmail(body.email, "email");
  const customerName = requireString(body.customerName, "customerName");

  await assertOfficeExists(officeId);
  await upsertCustomerFromRequest({ request, email, customerName, phone: body.phone, now });

  const item = {
    PK: `OFFICE#${officeId}`,
    SK: `REQUEST#${id}`,
    GSI1PK: "ENTITY#RENTAL_REQUEST",
    GSI1SK: `REQUEST#${now}#${id}`,
    GSI2PK: `REQUEST#${id}`,
    GSI2SK: "METADATA",
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
  const result = await queryEntity("RENTAL_REQUEST", readLimit(request.query.limit, 100));
  let items = (result.Items ?? []).map(toRentalRequest);
  if (request.query.status) items = items.filter((item) => item.status === request.query.status);
  if (request.query.officeId) items = items.filter((item) => item.officeId === request.query.officeId);
  return { items, count: items.length };
}

async function listCurrentUserRentalRequests(request) {
  const email = request.claims.email;
  const subject = request.claims.sub;
  const result = await queryEntity("RENTAL_REQUEST", readLimit(request.query.limit, 100));
  const items = (result.Items ?? [])
    .map(toRentalRequest)
    .filter((item) => item.email === email || item.createdBy === subject || item.createdBy === email);
  return { items, count: items.length };
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

async function createContract(request) {
  const body = parseBody(request.event);
  const now = new Date().toISOString();
  const id = body.id ? normalizeId(body.id, "id") : randomUUID();
  const officeId = requireString(body.officeId, "officeId");

  await assertOfficeExists(officeId);

  const item = {
    PK: `OFFICE#${officeId}`,
    SK: `CONTRACT#${id}`,
    GSI1PK: "ENTITY#CONTRACT",
    GSI1SK: `CONTRACT#${now}#${id}`,
    GSI2PK: `CONTRACT#${id}`,
    GSI2SK: "METADATA",
    entityType: "CONTRACT",
    id,
    officeId,
    customerId: requireString(body.customerId ?? body.customerEmail, "customerId"),
    rentalRequestId: optionalString(body.rentalRequestId),
    title: optionalString(body.title) || `Hợp đồng ${id}`,
    status: requireEnum(body.status ?? "DRAFT", contractStatuses, "status"),
    startDate: optionalString(body.startDate),
    endDate: optionalString(body.endDate),
    monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
    fileKey: optionalString(body.fileKey),
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
  return { item: toContract(item) };
}

async function listContracts(request) {
  const result = await queryEntity("CONTRACT", readLimit(request.query.limit, 100));
  let items = (result.Items ?? []).map(toContract);
  if (request.query.status) items = items.filter((item) => item.status === request.query.status);
  if (request.query.officeId) items = items.filter((item) => item.officeId === request.query.officeId);
  if (request.query.customerId) items = items.filter((item) => item.customerId === request.query.customerId);
  return { items, count: items.length };
}

async function listCurrentUserContracts(request) {
  const email = request.claims.email;
  const subject = request.claims.sub;
  const result = await queryEntity("CONTRACT", readLimit(request.query.limit, 100));
  const items = (result.Items ?? [])
    .map(toContract)
    .filter((item) => item.customerId === email || item.customerId === subject || item.createdBy === subject || item.createdBy === email);
  return { items, count: items.length };
}

async function getCurrentUserProfile(request) {
  const key = userProfileKey(request.claims.sub);
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: key }));
  if (result.Item) return { item: toUserProfile(result.Item, request.claims) };
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
    avatarDataUrl: body.avatarDataUrl === undefined ? existing.Item?.avatarDataUrl ?? "" : optionalAvatarDataUrl(body.avatarDataUrl),
    createdAt: existing.Item?.createdAt ?? now,
    updatedAt: now,
    updatedBy: request.claims.sub
  };

  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
  return { item: toUserProfile(item, request.claims) };
}

async function getContractById(id) {
  const item = await getRawByGsi2(`CONTRACT#${id}`, "Không tìm thấy hợp đồng.");
  return { item: toContract(item) };
}

async function updateContract(request, id) {
  const body = parseBody(request.event);
  const current = await getRawByGsi2(`CONTRACT#${id}`, "Không tìm thấy hợp đồng.");
  const now = new Date().toISOString();
  const result = await updateItem({
    key: { PK: current.PK, SK: current.SK },
    updates: pickDefined({
      title: body.title === undefined ? undefined : optionalString(body.title),
      status: body.status === undefined ? undefined : requireEnum(body.status, contractStatuses, "status"),
      startDate: body.startDate === undefined ? undefined : optionalString(body.startDate),
      endDate: body.endDate === undefined ? undefined : optionalString(body.endDate),
      monthlyPrice: body.monthlyPrice === undefined ? undefined : requirePositiveNumber(body.monthlyPrice, "monthlyPrice"),
      fileKey: body.fileKey === undefined ? undefined : optionalString(body.fileKey),
      updatedAt: now,
      updatedBy: request.claims.sub ?? "admin"
    }),
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
  if (!isAdmin(request) && contract.createdBy !== request.claims.sub) {
    throw httpError(403, "Bạn không có quyền upload file cho hợp đồng này.");
  }

  const fileName = sanitizeFileName(body.fileName ?? "contract.pdf");
  const contentType = optionalString(body.contentType) || "application/octet-stream";
  const objectKey = `contracts/${contractId}/${randomUUID()}-${fileName}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: storageBucketName,
    Key: objectKey,
    ContentType: contentType
  }), { expiresIn: 900 });

  return { bucket: storageBucketName, key: objectKey, uploadUrl, expiresIn: 900 };
}

async function listCustomers(request) {
  const result = await queryEntity("CUSTOMER", readLimit(request.query.limit, 100));
  let items = (result.Items ?? []).map(toCustomer);
  const query = request.query.q?.toLowerCase();
  if (query) items = items.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(query));
  return { items, count: items.length };
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

async function getAdminStats() {
  const [offices, requests, contracts, customers] = await Promise.all([
    queryEntity("OFFICE", 200),
    queryEntity("RENTAL_REQUEST", 200),
    queryEntity("CONTRACT", 200),
    queryEntity("CUSTOMER", 200)
  ]);
  return {
    item: {
      offices: offices.Items?.filter((item) => item.status !== "INACTIVE").length ?? 0,
      pendingRentalRequests: requests.Items?.filter((item) => item.status === "PENDING").length ?? 0,
      activeContracts: contracts.Items?.filter((item) => item.status === "ACTIVE").length ?? 0,
      customers: customers.Items?.filter((item) => item.status !== "INACTIVE").length ?? 0
    }
  };
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
  try {
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

    if (items.length > 0) return items;
    return await scanEntityItems(entityType);
  } catch (error) {
    if (error.name !== "ValidationException") throw error;
    return await scanEntityItems(entityType);
  }
}

async function scanEntityItems(entityType) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "entityType = :entityType",
      ExpressionAttributeValues: { ":entityType": entityType },
      ExclusiveStartKey: exclusiveStartKey
    }));
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

async function queryEntity(entityType, limit) {
  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `ENTITY#${entityType}` },
      ScanIndexForward: false,
      Limit: limit
    }));
    if ((result.Items ?? []).length > 0) return result;
    return await scanEntity(entityType, limit);
  } catch (error) {
    if (error.name !== "ValidationException") throw error;
    return await scanEntity(entityType, limit);
  }
}

async function scanEntity(entityType, limit) {
  return await dynamo.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: "entityType = :entityType",
    ExpressionAttributeValues: { ":entityType": entityType },
    Limit: limit
  }));
}

async function updateItem({ key, updates, condition }) {
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

  return await dynamo.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: `SET ${expressions.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: condition,
    ReturnValues: "ALL_NEW"
  }));
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

function optionalAvatarDataUrl(value) {
  const text = optionalString(value);
  if (!text) return "";
  if (text.length > 180000) throw httpError(400, "Ảnh đại diện quá lớn. Vui lòng chọn ảnh nhỏ hơn.");
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(text)) {
    throw httpError(400, "Ảnh đại diện không đúng định dạng.");
  }
  return text;
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
    avatarDataUrl: "",
    createdAt: undefined,
    updatedAt: undefined
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
