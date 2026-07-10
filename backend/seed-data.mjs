import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const args = parseArgs(process.argv.slice(2));
const region = args.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-southeast-1";
const tableName = args.table ?? process.env.TABLE_NAME ?? "cloffice-offices-table";
const endpoint = args.endpoint ?? process.env.DYNAMODB_ENDPOINT;
const now = new Date().toISOString();

const dynamoClient = new DynamoDBClient({
  region,
  ...(endpoint ? {
    endpoint,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local"
    }
  } : {})
});
const dynamo = DynamoDBDocumentClient.from(dynamoClient);

const offices = [
  {
    id: "office-d1-1201",
    title: "Văn phòng hạng A - Quận 1",
    address: "Tòa nhà Saigon Centre, Quận 1, TP.HCM",
    areaSqm: 85,
    monthlyPrice: 68000000,
    status: "AVAILABLE",
    description: "Không gian làm việc cao cấp, đầy đủ nội thất, phù hợp nhóm 18-24 người.",
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Lễ tân", "Phòng họp", "Internet tốc độ cao", "Bãi giữ xe"]
  },
  {
    id: "office-bt-0805",
    title: "Văn phòng view sông - Bình Thạnh",
    address: "Pearl Plaza, Bình Thạnh, TP.HCM",
    areaSqm: 120,
    monthlyPrice: 92000000,
    status: "RESERVED",
    description: "Mặt bằng rộng, ánh sáng tự nhiên, thích hợp doanh nghiệp công nghệ đang mở rộng.",
    imageUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Pantry", "An ninh 24/7", "Điều hòa trung tâm", "Thang máy riêng"]
  },
  {
    id: "office-tb-0302",
    title: "Văn phòng linh hoạt - Tân Bình",
    address: "Etown Central, Tân Bình, TP.HCM",
    areaSqm: 48,
    monthlyPrice: 31000000,
    status: "AVAILABLE",
    description: "Không gian gọn, tối ưu chi phí, thuận tiện di chuyển sân bay và trung tâm.",
    imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Nội thất cơ bản", "Máy lạnh", "Khu tiếp khách", "Dịch vụ vệ sinh"]
  }
];

const customers = [
  {
    id: "minh.nguyen@example.com",
    email: "minh.nguyen@example.com",
    name: "Nguyễn Hoàng Minh",
    phone: "0901234567",
    status: "ACTIVE"
  },
  {
    id: "linh.tran@example.com",
    email: "linh.tran@example.com",
    name: "Trần Gia Linh",
    phone: "0912345678",
    status: "ACTIVE"
  }
];

const rentalRequests = [
  {
    id: "request-office-d1-1201-001",
    officeId: "office-d1-1201",
    customerName: "Nguyễn Hoàng Minh",
    email: "minh.nguyen@example.com",
    phone: "0901234567",
    message: "Cần thuê văn phòng cho đội kinh doanh từ tháng sau.",
    status: "PENDING"
  },
  {
    id: "request-office-tb-0302-001",
    officeId: "office-tb-0302",
    customerName: "Trần Gia Linh",
    email: "linh.tran@example.com",
    phone: "0912345678",
    message: "Muốn xem văn phòng trong tuần này.",
    status: "APPROVED"
  }
];

const contracts = [
  {
    id: "contract-office-tb-0302-001",
    officeId: "office-tb-0302",
    customerId: "linh.tran@example.com",
    rentalRequestId: "request-office-tb-0302-001",
    title: "Hợp đồng thuê văn phòng Tân Bình 0302",
    status: "ACTIVE",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    monthlyPrice: 31000000,
    fileKey: ""
  }
];

const items = [
  ...offices.map(toOfficeItem),
  ...customers.map(toCustomerItem),
  ...rentalRequests.map(toRentalRequestItem),
  ...contracts.map(toContractItem)
];

if (args.createTable) {
  await ensureTable();
}

for (const item of items) {
  await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
  console.log(`Seeded ${item.entityType}: ${item.id}`);
}

console.log(`Done. Inserted/updated ${items.length} items into ${tableName} (${region}).`);

function toOfficeItem(office) {
  return {
    PK: `OFFICE#${office.id}`,
    SK: "METADATA",
    GSI1PK: "ENTITY#OFFICE",
    GSI1SK: `OFFICE#${now}#${office.id}`,
    GSI2PK: `OFFICE#${office.id}`,
    GSI2SK: "METADATA",
    entityType: "OFFICE",
    createdAt: now,
    updatedAt: now,
    createdBy: "seed-data",
    updatedBy: "seed-data",
    ...office
  };
}

async function ensureTable() {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table exists: ${tableName}`);
    return;
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
  }

  console.log(`Creating table: ${tableName}`);
  await dynamoClient.send(new CreateTableCommand({
    TableName: tableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" },
      { AttributeName: "SK", AttributeType: "S" },
      { AttributeName: "GSI1PK", AttributeType: "S" },
      { AttributeName: "GSI1SK", AttributeType: "S" },
      { AttributeName: "GSI2PK", AttributeType: "S" },
      { AttributeName: "GSI2SK", AttributeType: "S" }
    ],
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1PK", KeyType: "HASH" },
          { AttributeName: "GSI1SK", KeyType: "RANGE" }
        ],
        Projection: { ProjectionType: "ALL" }
      },
      {
        IndexName: "GSI2",
        KeySchema: [
          { AttributeName: "GSI2PK", KeyType: "HASH" },
          { AttributeName: "GSI2SK", KeyType: "RANGE" }
        ],
        Projection: { ProjectionType: "ALL" }
      }
    ]
  }));
}

function toCustomerItem(customer) {
  return {
    PK: `CUSTOMER#${customer.id}`,
    SK: "METADATA",
    GSI1PK: "ENTITY#CUSTOMER",
    GSI1SK: `CUSTOMER#${now}#${customer.id}`,
    GSI2PK: `CUSTOMER#${customer.id}`,
    GSI2SK: "METADATA",
    entityType: "CUSTOMER",
    createdAt: now,
    updatedAt: now,
    createdBy: "seed-data",
    updatedBy: "seed-data",
    ...customer
  };
}

function toRentalRequestItem(request) {
  return {
    PK: `OFFICE#${request.officeId}`,
    SK: `REQUEST#${request.id}`,
    GSI1PK: "ENTITY#RENTAL_REQUEST",
    GSI1SK: `REQUEST#${now}#${request.id}`,
    GSI2PK: `REQUEST#${request.id}`,
    GSI2SK: "METADATA",
    entityType: "RENTAL_REQUEST",
    createdAt: now,
    updatedAt: now,
    createdBy: request.email,
    updatedBy: request.email,
    ...request
  };
}

function toContractItem(contract) {
  return {
    PK: `OFFICE#${contract.officeId}`,
    SK: `CONTRACT#${contract.id}`,
    GSI1PK: "ENTITY#CONTRACT",
    GSI1SK: `CONTRACT#${now}#${contract.id}`,
    GSI2PK: `CONTRACT#${contract.id}`,
    GSI2SK: "METADATA",
    entityType: "CONTRACT",
    createdAt: now,
    updatedAt: now,
    createdBy: "seed-data",
    updatedBy: "seed-data",
    ...contract
  };
}

function parseArgs(input) {
  const result = {};
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];
    if (value === "--table") result.table = input[index += 1];
    if (value === "--region") result.region = input[index += 1];
    if (value === "--endpoint") result.endpoint = input[index += 1];
    if (value === "--create-table") result.createTable = true;
  }
  return result;
}
