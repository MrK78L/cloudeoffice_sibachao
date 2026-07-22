import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";

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

const imageUrls = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366811364-ccf3f52b97c9?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366858526-0766cadbe8fa?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1531497865144-0464ef8fb9a9?auto=format&fit=crop&w=1200&q=80"
];

const amenitySets = [
  ["Lễ tân", "Phòng họp", "Internet tốc độ cao", "Bãi giữ xe"],
  ["Pantry", "An ninh 24/7", "Điều hòa trung tâm", "Máy phát điện"],
  ["Phone booth", "Khu tiếp khách", "Tủ cá nhân", "Dịch vụ vệ sinh"],
  ["Phòng họp riêng", "Bãi đỗ ô tô", "Thang máy", "Internet dự phòng"]
];

const officeInventory = [
  ["office-d1-sc-1201", "Văn phòng hạng A trung tâm Quận 1", "Quận 1", "saigon-centre", "Saigon Centre", 12, "1201", 1, 85, 68000000, "AVAILABLE"],
  ["office-d1-sc-1202", "Văn phòng góc hai mặt kính", "Quận 1", "saigon-centre", "Saigon Centre", 12, "1202", 2, 105, 82000000, "RESERVED"],
  ["office-d1-vcb-1503", "Văn phòng doanh nghiệp view sông", "Quận 1", "vietcombank-tower", "Vietcombank Tower", 15, "1503", 1, 150, 125000000, "AVAILABLE"],
  ["office-d1-vcb-1802", "Văn phòng điều hành cao cấp", "Quận 1", "vietcombank-tower", "Vietcombank Tower", 18, "1802", 1, 118, 103000000, "AVAILABLE"],
  ["office-d1-dh-0901", "Văn phòng tiêu chuẩn quốc tế", "Quận 1", "deutsches-haus", "Deutsches Haus", 9, "901", 1, 92, 79000000, "AVAILABLE"],
  ["office-d1-dh-1104", "Không gian làm việc xanh", "Quận 1", "deutsches-haus", "Deutsches Haus", 11, "1104", 2, 135, 112000000, "RESERVED"],
  ["office-d3-ct-0701", "Văn phòng sáng tạo Quận 3", "Quận 3", "centec-tower", "Centec Tower", 7, "701", 1, 95, 73000000, "AVAILABLE"],
  ["office-d3-ct-1003", "Văn phòng linh hoạt gần trung tâm", "Quận 3", "centec-tower", "Centec Tower", 10, "1003", 2, 70, 52000000, "AVAILABLE"],
  ["office-bt-pp-0805", "Văn phòng view thành phố Bình Thạnh", "Bình Thạnh", "pearl-plaza", "Pearl Plaza", 8, "805", 1, 120, 92000000, "AVAILABLE"],
  ["office-bt-pp-1206", "Văn phòng mở cho đội ngũ tăng trưởng", "Bình Thạnh", "pearl-plaza", "Pearl Plaza", 12, "1206", 2, 140, 106000000, "RESERVED"],
  ["office-bt-lm-1002", "Văn phòng hiện đại gần Landmark 81", "Bình Thạnh", "landmark-81", "Landmark 81", 10, "1002", 1, 72, 56000000, "AVAILABLE"],
  ["office-bt-lm-1408", "Văn phòng cao tầng đầy đủ nội thất", "Bình Thạnh", "landmark-81", "Landmark 81", 14, "1408", 2, 98, 76000000, "AVAILABLE"],
  ["office-tb-et-0302", "Văn phòng tối ưu chi phí gần sân bay", "Tân Bình", "etown-central", "Etown Central", 3, "302", 1, 48, 31000000, "AVAILABLE"],
  ["office-tb-et-0506", "Văn phòng logistics và thương mại", "Tân Bình", "etown-central", "Etown Central", 5, "506", 2, 65, 42000000, "AVAILABLE"],
  ["office-q7-mt-0904", "Văn phòng Phú Mỹ Hưng quy mô lớn", "Quận 7", "mapletree-business-centre", "Mapletree Business Centre", 9, "904", 1, 180, 118000000, "AVAILABLE"],
  ["office-q7-mt-1102", "Văn phòng doanh nghiệp khu Nam", "Quận 7", "mapletree-business-centre", "Mapletree Business Centre", 11, "1102", 2, 125, 86000000, "RESERVED"],
  ["office-td-oh-0608", "Văn phòng công nghệ tại OneHub", "TP. Thủ Đức", "onehub-saigon", "OneHub Saigon", 6, "608", 1, 110, 65000000, "AVAILABLE"],
  ["office-td-oh-0810", "Không gian R&D hiện đại", "TP. Thủ Đức", "onehub-saigon", "OneHub Saigon", 8, "810", 2, 155, 89000000, "AVAILABLE"],
  ["office-td-hm-1205", "Văn phòng cao cấp The Hallmark", "TP. Thủ Đức", "the-hallmark", "The Hallmark", 12, "1205", 1, 130, 98000000, "AVAILABLE"],
  ["office-td-hm-1507", "Văn phòng điều hành khu đô thị mới", "TP. Thủ Đức", "the-hallmark", "The Hallmark", 15, "1507", 2, 165, 126000000, "AVAILABLE"]
];

const offices = officeInventory.map((entry, index) => {
  const [id, title, district, buildingId, buildingName, floor, roomNumber, position, areaSqm, monthlyPrice, status] = entry;
  return {
    id,
    title,
    address: `${buildingName}, ${district}, TP.HCM`,
    areaSqm,
    monthlyPrice,
    status,
    buildingId,
    buildingName,
    floor,
    roomNumber,
    position,
    description: `Không gian ${areaSqm} m² tại ${buildingName}, phù hợp cho doanh nghiệp cần nơi làm việc chuyên nghiệp và vận hành ổn định.`,
    imageUrl: imageUrls[index % imageUrls.length],
    amenities: amenitySets[index % amenitySets.length]
  };
});

if (args.dryRun) {
  console.log(`Seed is valid: ${offices.length} offices prepared for ${tableName} (${region}).`);
  process.exit(0);
}

if (args.createTable) await ensureTable();
if (args.reset) await resetTable();

const items = [
  ...offices.map(toOfficeItem),
  ...offices.map(toOfficeLocationLockItem)
];

await batchWrite(items.map((item) => ({ PutRequest: { Item: item } })));
console.log(`Done. Seeded ${offices.length} offices and ${offices.length} location locks into ${tableName} (${region}).`);

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

function toOfficeLocationLockItem(office) {
  return {
    PK: `LOCATION#${office.buildingId.toLowerCase()}`,
    SK: `FLOOR#${office.floor}#ROOM#${office.roomNumber.toLowerCase()}`,
    entityType: "OFFICE_LOCATION_LOCK",
    officeId: office.id,
    buildingId: office.buildingId,
    floor: office.floor,
    roomNumber: office.roomNumber,
    updatedAt: now
  };
}

async function resetTable() {
  if (!endpoint && args.confirmReset !== tableName) {
    throw new Error(`Refusing to reset AWS table. Add --confirm-reset ${tableName} to confirm.`);
  }

  console.log(`Resetting all data in ${tableName}${endpoint ? ` at ${endpoint}` : " on AWS"}...`);
  let exclusiveStartKey;
  let deletedCount = 0;

  do {
    const page = await dynamo.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: "#pk, #sk",
      ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
      ExclusiveStartKey: exclusiveStartKey
    }));
    const deletes = (page.Items ?? []).map((item) => ({
      DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
    }));
    await batchWrite(deletes);
    deletedCount += deletes.length;
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  console.log(`Deleted ${deletedCount} existing items.`);
}

async function batchWrite(requests) {
  for (let offset = 0; offset < requests.length; offset += 25) {
    let pending = requests.slice(offset, offset + 25);
    while (pending.length > 0) {
      const response = await dynamo.send(new BatchWriteCommand({
        RequestItems: { [tableName]: pending }
      }));
      pending = response.UnprocessedItems?.[tableName] ?? [];
      if (pending.length > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
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
      { AttributeName: "GSI2SK", AttributeType: "S" },
      { AttributeName: "GSI3PK", AttributeType: "S" },
      { AttributeName: "GSI3SK", AttributeType: "S" }
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
      },
      {
        IndexName: "GSI3",
        KeySchema: [
          { AttributeName: "GSI3PK", KeyType: "HASH" },
          { AttributeName: "GSI3SK", KeyType: "RANGE" }
        ],
        Projection: { ProjectionType: "ALL" }
      }
    ]
  }));

  await waitUntilTableExists({ client: dynamoClient, maxWaitTime: 60 }, { TableName: tableName });
}

function parseArgs(input) {
  const result = {};
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];
    if (value.startsWith("--table=")) result.table = value.slice("--table=".length);
    if (value.startsWith("--region=")) result.region = value.slice("--region=".length);
    if (value.startsWith("--endpoint=")) result.endpoint = value.slice("--endpoint=".length);
    if (value.startsWith("--confirm-reset=")) result.confirmReset = value.slice("--confirm-reset=".length);
    if (value === "--table") result.table = input[index += 1];
    if (value === "--region") result.region = input[index += 1];
    if (value === "--endpoint") result.endpoint = input[index += 1];
    if (value === "--confirm-reset") result.confirmReset = input[index += 1];
    if (value === "--create-table") result.createTable = true;
    if (value === "--reset") result.reset = true;
    if (value === "--dry-run") result.dryRun = true;
  }
  return result;
}
