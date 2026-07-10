import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const tableName = process.env.TABLE_NAME;
const storageBucketName = process.env.STORAGE_BUCKET_NAME;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

export async function handler(event) {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.rawPath ?? event.path ?? "/";

    if (method === "OPTIONS") {
      return json(204, {});
    }

    if (method === "GET" && path === "/offices") {
      return json(200, await listOffices(event));
    }

    if (method === "GET" && path.startsWith("/offices/")) {
      return json(200, await getOffice(path));
    }

    if (method === "POST" && path === "/offices") {
      return json(201, await createOffice(event));
    }

    if (method === "POST" && path === "/rental-requests") {
      return json(201, await createRentalRequest(event));
    }

    if (method === "GET" && path.startsWith("/rental-requests/")) {
      return json(200, await getRentalRequest(path));
    }

    if (method === "POST" && path.startsWith("/contracts/") && path.endsWith("/upload-url")) {
      return json(200, await createContractUploadUrl(event, path));
    }

    return json(404, { message: "Route không tồn tại." });
  } catch (error) {
    console.error(error);
    const statusCode = error.statusCode ?? 500;
    return json(statusCode, { message: error.message ?? "Internal server error" });
  }
}

async function listOffices(event) {
  const query = event.queryStringParameters?.q?.toLowerCase();
  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "entityType = :entityType",
      ExpressionAttributeValues: {
        ":entityType": "OFFICE"
      },
      Limit: 50
    })
  );

  const items = (result.Items ?? []).map(toOffice);
  return {
    items: query
      ? items.filter((office) => `${office.title} ${office.address}`.toLowerCase().includes(query))
      : items
  };
}

async function getOffice(path) {
  const id = decodeURIComponent(path.split("/")[2] ?? "");
  const result = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: `OFFICE#${id}`,
        SK: "METADATA"
      }
    })
  );

  if (!result.Item) {
    throw httpError(404, "Không tìm thấy văn phòng.");
  }

  return { item: toOffice(result.Item) };
}

async function createOffice(event) {
  const body = parseBody(event);
  const claims = getJwtClaims(event);
  const id = randomUUID();
  const now = new Date().toISOString();

  const item = {
    PK: `OFFICE#${id}`,
    SK: "METADATA",
    entityType: "OFFICE",
    id,
    title: requireString(body.title, "title"),
    address: requireString(body.address, "address"),
    areaSqm: Number(body.areaSqm),
    monthlyPrice: Number(body.monthlyPrice),
    status: body.status ?? "AVAILABLE",
    description: body.description ?? "",
    imageUrl: body.imageUrl ?? "",
    createdAt: now,
    createdBy: claims.sub ?? "unknown"
  };

  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
  return { item: toOffice(item) };
}

async function createRentalRequest(event) {
  const body = parseBody(event);
  const claims = getJwtClaims(event);
  const id = randomUUID();
  const now = new Date().toISOString();
  const officeId = requireString(body.officeId, "officeId");

  const item = {
    PK: `OFFICE#${officeId}`,
    SK: `REQUEST#${id}`,
    GSI1PK: `REQUEST#${id}`,
    GSI1SK: now,
    entityType: "RENTAL_REQUEST",
    id,
    officeId,
    customerName: requireString(body.customerName, "customerName"),
    email: requireString(body.email, "email"),
    message: body.message ?? "",
    status: "PENDING",
    createdAt: now,
    createdBy: claims.sub ?? "unknown"
  };

  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
  return { item: toRentalRequest(item) };
}

async function getRentalRequest(path) {
  const requestId = decodeURIComponent(path.split("/")[2] ?? "");
  const result = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `REQUEST#${requestId}`
      },
      Limit: 1
    })
  );

  const item = result.Items?.[0];
  if (!item) {
    throw httpError(404, "Không tìm thấy yêu cầu thuê.");
  }

  return { item: toRentalRequest(item) };
}

async function createContractUploadUrl(event, path) {
  const body = parseBody(event);
  const contractId = decodeURIComponent(path.split("/")[2] ?? "");
  const fileName = sanitizeFileName(body.fileName ?? "contract.pdf");
  const contentType = body.contentType ?? "application/octet-stream";
  const objectKey = `contracts/${contractId}/${randomUUID()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: storageBucketName,
    Key: objectKey,
    ContentType: contentType
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  return {
    bucket: storageBucketName,
    key: objectKey,
    uploadUrl,
    expiresIn: 900
  };
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(text);
}

function getJwtClaims(event) {
  return event.requestContext?.authorizer?.jwt?.claims ?? {};
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw httpError(400, `Thiếu trường bắt buộc: ${fieldName}`);
  }
  return value.trim();
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
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
    imageUrl: item.imageUrl
  };
}

function toRentalRequest(item) {
  return {
    id: item.id,
    officeId: item.officeId,
    customerName: item.customerName,
    email: item.email,
    message: item.message,
    status: item.status,
    createdAt: item.createdAt
  };
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
