import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const tableName = process.env.TABLE_NAME;
const topicArn = process.env.ALERT_TOPIC_ARN;
const warningDays = Number(process.env.EXPIRY_WARNING_DAYS ?? 30);

export async function handler() {
  const contracts = await listContracts();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const threshold = now + warningDays * 24 * 60 * 60 * 1000;

  let expiredCount = 0;
  for (const contract of contracts) {
    if (contract.status !== "ACTIVE" || !contract.endDate) continue;
    const endTime = contractEndTimestamp(contract.endDate);
    if (Number.isFinite(endTime) && endTime < now && await expireContract(contract, nowIso)) {
      expiredCount += 1;
    }
  }

  const expiring = contracts.filter((contract) => {
    if (contract.status !== "ACTIVE" || !contract.endDate) return false;
    const endTime = contractEndTimestamp(contract.endDate);
    return Number.isFinite(endTime) &&
      endTime >= now &&
      endTime <= threshold &&
      contract.expiryWarningForEndDate !== contract.endDate;
  });

  if (expiring.length > 0) {
    const lines = expiring
      .sort((left, right) => left.endDate.localeCompare(right.endDate))
      .map((contract) => `- ${contract.id} | office=${contract.officeId} | customer=${contract.customerId} | end=${contract.endDate}`);

    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: `[Cloud Office] ${expiring.length} hợp đồng sắp hết hạn`,
      Message: `Các hợp đồng hết hạn trong ${warningDays} ngày tới:\n\n${lines.join("\n")}`
    }));
    await Promise.all(expiring.map((contract) => markWarningSent(contract, nowIso)));
  }

  return { expired: expiredCount, notified: expiring.length };
}

async function expireContract(contract, nowIso) {
  const lockKey = { PK: `OFFICE#${contract.officeId}`, SK: "ACTIVE_CONTRACT" };
  const lock = await dynamo.send(new GetCommand({ TableName: tableName, Key: lockKey }));
  if (lock.Item && lock.Item.contractId !== contract.id) {
    console.warn(`Skip contract expiration because the office lock belongs to another contract: ${contract.id}`);
    return false;
  }
  const renewalDeadline = new Date(Date.parse(nowIso) + 3 * 24 * 60 * 60 * 1000).toISOString();
  const rentalRequest = contract.rentalRequestId ? await getRentalRequest(contract.rentalRequestId) : null;

  const transactItems = [
    {
      Update: {
        TableName: tableName,
        Key: { PK: contract.PK, SK: contract.SK },
        UpdateExpression: "SET #status = :expired, expiredAt = :now, endedAt = :now, renewalDeadline = :renewalDeadline, updatedAt = :now, updatedBy = :actor REMOVE rentalRequestId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":active": "ACTIVE",
          ":expired": "EXPIRED",
          ":now": nowIso,
          ":renewalDeadline": renewalDeadline,
          ":actor": "contract-expiry-notifier"
        },
        ConditionExpression: "#status = :active"
      }
    },
    {
      Update: {
        TableName: tableName,
        Key: { PK: `OFFICE#${contract.officeId}`, SK: "METADATA" },
        UpdateExpression: "SET #status = :available, updatedAt = :now, updatedBy = :actor REMOVE activeContractId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":available": "AVAILABLE",
          ":leased": "LEASED",
          ":contractId": contract.id,
          ":now": nowIso,
          ":actor": "contract-expiry-notifier"
        },
        ConditionExpression: "attribute_exists(PK) AND #status = :leased AND activeContractId = :contractId"
      }
    }
  ];
  if (lock.Item) {
    transactItems.push({
      Delete: {
        TableName: tableName,
        Key: lockKey,
        ConditionExpression: "contractId = :contractId",
        ExpressionAttributeValues: { ":contractId": contract.id }
      }
    });
  }
  if (rentalRequest && !rentalRequest.deletedAt && rentalRequest.status === "APPROVED") {
    transactItems.push({
      Delete: {
        TableName: tableName,
        Key: { PK: rentalRequest.PK, SK: rentalRequest.SK },
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":approved": "APPROVED"
        },
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #status = :approved"
      }
    });
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return true;
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      console.warn(`Skip conflicting contract expiration: ${contract.id}`);
      return false;
    }
    throw error;
  }
}

async function getRentalRequest(id) {
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :pk AND GSI2SK = :sk",
    ExpressionAttributeValues: { ":pk": `REQUEST#${id}`, ":sk": "METADATA" },
    Limit: 1
  }));
  return result.Items?.[0] ?? null;
}

async function markWarningSent(contract, nowIso) {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: contract.PK, SK: contract.SK },
      UpdateExpression: "SET expiryWarningForEndDate = :endDate, expiryWarningSentAt = :now",
      ExpressionAttributeValues: {
        ":active": "ACTIVE",
        ":endDate": contract.endDate,
        ":now": nowIso
      },
      ConditionExpression: "#status = :active AND endDate = :endDate",
      ExpressionAttributeNames: { "#status": "status" }
    }));
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") throw error;
  }
}

async function listContracts() {
  const items = [];
  let exclusiveStartKey;
  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "ENTITY#CONTRACT" },
      ExclusiveStartKey: exclusiveStartKey
    }));
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

function contractEndTimestamp(endDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return new Date(`${endDate}T23:59:59.999Z`).getTime();
  return new Date(endDate).getTime();
}
