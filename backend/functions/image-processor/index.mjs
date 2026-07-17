import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const processedBucketName = process.env.PROCESSED_BUCKET_NAME;
const tableName = process.env.TABLE_NAME;
const maxImageBytes = Number(process.env.MAX_IMAGE_BYTES ?? 10 * 1024 * 1024);

export async function handler(event) {
  for (const record of event.Records ?? []) {
    const sourceBucket = record.s3.bucket.name;
    const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!isSupportedImage(sourceKey)) {
      console.log(`Skip non-image object: ${sourceKey}`);
      continue;
    }


    if (Number(record.s3.object.size ?? 0) > maxImageBytes) {
      console.warn(`Delete oversized image: ${sourceBucket}/${sourceKey}`);
      await s3.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));
      continue;
    }

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: sourceBucket,
        Key: sourceKey
      })
    );

    const inputBuffer = await streamToBuffer(object.Body);
    let outputBuffer;
    try {
      outputBuffer = await sharp(inputBuffer, { limitInputPixels: 40_000_000, failOn: "error" })
        .rotate()
        .resize({ width: 1280, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      console.warn(`Delete invalid image ${sourceBucket}/${sourceKey}: ${error.message}`);
      await s3.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));
      continue;
    }

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
    const attached = await markOfficeImageProcessed(sourceKey, targetKey);
    if (!attached) {
      // The S3 event can finish before the admin confirmation request attaches the key.
      // Keep the output so that confirmation can detect and attach the processed image.
      console.log(`Processed image is waiting for confirmation: ${processedBucketName}/${targetKey}`);
    }
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
  if (!tableName) return false;

  const match = /^images\/offices\/([^/]+)\//.exec(sourceKey);
  if (!match) return false;

  const officeId = decodeURIComponent(match[1]);
  try {
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `OFFICE#${officeId}`, SK: "METADATA" },
      UpdateExpression: "SET processedImageKey = :processedImageKey, processedImageReady = :ready, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":sourceImageKey": sourceKey,
        ":processedImageKey": processedImageKey,
        ":ready": true,
        ":updatedAt": new Date().toISOString()
      },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND imageKey = :sourceImageKey"
    }));
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      console.warn(`Skip stale office image metadata update for ${officeId}`);
      return false;
    }
    throw error;
  }
}
