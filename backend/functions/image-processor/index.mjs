import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const processedBucketName = process.env.PROCESSED_BUCKET_NAME;
const tableName = process.env.TABLE_NAME;

export async function handler(event) {
  for (const record of event.Records ?? []) {
    const sourceBucket = record.s3.bucket.name;
    const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!isSupportedImage(sourceKey)) {
      console.log(`Skip non-image object: ${sourceKey}`);
      continue;
    }

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: sourceBucket,
        Key: sourceKey
      })
    );

    const inputBuffer = await streamToBuffer(object.Body);
    const outputBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 1280, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const targetKey = sourceKey.replace(/\.[^.]+$/, ".webp");
    await s3.send(
      new PutObjectCommand({
        Bucket: processedBucketName,
        Key: targetKey,
        Body: outputBuffer,
        ContentType: "image/webp",
        Metadata: {
          sourceBucket,
          sourceKey
        }
      })
    );

    console.log(`Processed ${sourceBucket}/${sourceKey} -> ${processedBucketName}/${targetKey}`);
    await markOfficeImageProcessed(sourceKey, targetKey);
  }

  return { processed: event.Records?.length ?? 0 };
}

function isSupportedImage(key) {
  return /\.(jpe?g|png|webp)$/i.test(key);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function markOfficeImageProcessed(sourceKey, processedImageKey) {
  if (!tableName) return;

  const match = /^images\/offices\/([^/]+)\//.exec(sourceKey);
  if (!match) return;

  const officeId = decodeURIComponent(match[1]);
  try {
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `OFFICE#${officeId}`, SK: "METADATA" },
      UpdateExpression: "SET processedImageKey = :processedImageKey, processedImageReady = :ready, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":processedImageKey": processedImageKey,
        ":ready": true,
        ":updatedAt": new Date().toISOString()
      },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
    }));
  } catch (error) {
    console.warn(`Skip office image metadata update for ${officeId}: ${error.name}`);
  }
}
