import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const tableName = process.env.TABLE_NAME;
const topicArn = process.env.ALERT_TOPIC_ARN;
const warningDays = Number(process.env.EXPIRY_WARNING_DAYS ?? 30);

export async function handler() {
  const contracts = await listContracts();
  const now = Date.now();
  const threshold = now + warningDays * 24 * 60 * 60 * 1000;
  const expiring = contracts.filter((contract) => {
    if (contract.status !== "ACTIVE" || !contract.endDate) return false;
    const endTime = new Date(contract.endDate).getTime();
    return Number.isFinite(endTime) && endTime >= now && endTime <= threshold;
  });

  if (expiring.length === 0) return { notified: 0 };

  const lines = expiring
    .sort((left, right) => left.endDate.localeCompare(right.endDate))
    .map((contract) => `- ${contract.id} | office=${contract.officeId} | customer=${contract.customerId} | end=${contract.endDate}`);

  await sns.send(new PublishCommand({
    TopicArn: topicArn,
    Subject: `[Cloud Office] ${expiring.length} hợp đồng sắp hết hạn`,
    Message: `Các hợp đồng hết hạn trong ${warningDays} ngày tới:\n\n${lines.join("\n")}`
  }));
  return { notified: expiring.length };
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
