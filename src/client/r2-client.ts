import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  HeadBucketCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  DeleteBucketLifecycleCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  DeleteBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "../config/config.js";
import type {
  R2Object,
  R2ObjectDetail,
  MultipartUpload,
  BucketInfo,
  LifecycleRule,
  CorsRule,
  PresignedUrlResult,
} from "../types.js";
import { createReadStream, readFileSync, statSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { formatBytes } from "../utils/format.js";

const MULTIPART_THRESHOLD = 5 * 1024 * 1024;
const MULTIPART_PART_SIZE = 5 * 1024 * 1024;

export class R2Client {
  private client: S3Client;
  private config: Config;
  private dryRun: boolean;

  constructor(config: Config) {
    this.config = config;
    this.dryRun = config.dryRun;

    this.client = new S3Client({
      region: config.r2.region,
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  isDryRun(): boolean {
    return this.dryRun;
  }

  setDryRun(dryRun: boolean): void {
    this.dryRun = dryRun;
  }

  async listObjects(bucket: string, prefix?: string, delimiter?: string): Promise<R2Object[]> {
    const objects: R2Object[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        Prefix: prefix,
        Delimiter: delimiter,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          objects.push({
            key: obj.Key!,
            size: obj.Size,
            lastModified: obj.LastModified,
            storageClass: obj.StorageClass,
            etag: obj.ETag,
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async listCommonPrefixes(bucket: string, prefix?: string, delimiter: string = "/"): Promise<string[]> {
    const prefixes: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        Prefix: prefix,
        Delimiter: delimiter,
      });

      const response = await this.client.send(command);

      if (response.CommonPrefixes) {
        for (const p of response.CommonPrefixes) {
          if (p.Prefix) prefixes.push(p.Prefix);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return prefixes;
  }

  async headObject(bucket: string, key: string): Promise<R2ObjectDetail> {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);

    return {
      key,
      size: response.ContentLength ?? 0,
      lastModified: response.LastModified ?? new Date(),
      storageClass: response.StorageClass ?? "STANDARD",
      etag: response.ETag ?? "",
      contentType: response.ContentType ?? "application/octet-stream",
      metadata: (response.Metadata ?? {}) as Record<string, string>,
    };
  }

  async getObject(bucket: string, key: string, outputPath?: string): Promise<Uint8Array | void> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);

    if (!response.Body) throw new Error(`Empty response body for ${key}`);

    const bytes = await response.Body.transformToByteArray();

    if (outputPath) {
      const dir = dirname(outputPath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(outputPath, bytes);
      console.log(`Downloaded: ${key} (${formatBytes(bytes.length)}) -> ${outputPath}`);
    } else {
      return bytes;
    }
  }

  async putObject(bucket: string, key: string, body: Uint8Array | string, contentType?: string, metadata?: Record<string, string>): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    await this.client.send(command);
    console.log(`Uploaded: ${key}`);
  }

  async uploadFile(bucket: string, key: string, filePath: string, contentType?: string, metadata?: Record<string, string>): Promise<void> {
    const stat = statSync(filePath);
    const fileSize = stat.size;

    if (fileSize < MULTIPART_THRESHOLD) {
      const body = readFileSync(filePath);
      await this.putObject(bucket, key, new Uint8Array(body), contentType, metadata);
    } else {
      await this.multipartUpload(bucket, key, filePath, fileSize, contentType, metadata);
    }
  }

  private async multipartUpload(
    bucket: string,
    key: string,
    filePath: string,
    fileSize: number,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const createCmd = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });

    const createResponse = await this.client.send(createCmd);
    const uploadId = createResponse.UploadId!;

    const partSize = MULTIPART_PART_SIZE;
    const totalParts = Math.ceil(fileSize / partSize);
    const completedParts: { PartNumber: number; ETag: string }[] = [];

    console.log(`Multipart upload: ${key} (${formatBytes(fileSize)}, ${totalParts} parts)`);

    const fileStream = createReadStream(filePath);
    let partNumber = 0;
    let bytesRead = 0;
    let currentBuffer = Buffer.alloc(0);

    for await (const chunk of fileStream) {
      currentBuffer = Buffer.concat([currentBuffer, chunk as Buffer]);

      while (currentBuffer.length >= partSize && partNumber < totalParts) {
        partNumber++;
        const partData = currentBuffer.subarray(0, partSize);
        currentBuffer = currentBuffer.subarray(partSize);

        const uploadCmd = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: new Uint8Array(partData),
        });

        const uploadResp = await this.client.send(uploadCmd);
        completedParts.push({
          PartNumber: partNumber,
          ETag: uploadResp.ETag!,
        });

        bytesRead += partData.length;
        const progress = Math.min(Math.round((bytesRead / fileSize) * 100), 100);
        process.stdout.write(`\rUploading part ${partNumber}/${totalParts} (${progress}%)`);
      }
    }

    if (currentBuffer.length > 0) {
      partNumber++;
      const uploadCmd = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: new Uint8Array(currentBuffer),
      });

      const uploadResp = await this.client.send(uploadCmd);
      completedParts.push({
        PartNumber: partNumber,
        ETag: uploadResp.ETag!,
      });
    }

    const completeCmd = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: completedParts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    });

    await this.client.send(completeCmd);
    process.stdout.write("\n");
    console.log(`Multipart upload complete: ${key} (${formatBytes(fileSize)})`);
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    storageClass?: "STANDARD" | "STANDARD_IA"
  ): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      CopySource: `${sourceBucket}/${sourceKey}`,
      StorageClass: storageClass,
    });

    await this.client.send(command);
  }

  async listMultipartUploads(bucket: string): Promise<MultipartUpload[]> {
    const uploads: MultipartUpload[] = [];
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;

    do {
      const command = new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      });

      const response = await this.client.send(command);

      if (response.Uploads) {
        for (const upload of response.Uploads) {
          uploads.push({
            key: upload.Key!,
            uploadId: upload.UploadId!,
            initiated: upload.Initiated,
          });
        }
      }

      keyMarker = response.NextKeyMarker;
      uploadIdMarker = response.NextUploadIdMarker;
    } while (keyMarker);

    return uploads;
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    if (this.dryRun) {
      console.log(`[DRY RUN] Would delete ${keys.length} objects from ${bucket}`);
      return keys.length;
    }

    const deleteObjects = keys.map((key) => ({ Key: key }));

    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: deleteObjects,
        Quiet: true,
      },
    });

    await this.client.send(command);
    return keys.length;
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[DRY RUN] Would delete: ${key}`);
      return;
    }
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await this.client.send(command);
  }

  async abortMultipartUploads(bucket: string, uploads: MultipartUpload[]): Promise<number> {
    if (uploads.length === 0) return 0;
    if (this.dryRun) {
      console.log(`[DRY RUN] Would abort ${uploads.length} multipart uploads in ${bucket}`);
      return uploads.length;
    }

    let aborted = 0;
    for (const upload of uploads) {
      const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      });

      await this.client.send(command);
      aborted++;
    }

    return aborted;
  }

  async listBuckets(): Promise<BucketInfo[]> {
    const command = new ListBucketsCommand({});
    const response = await this.client.send(command);

    return (response.Buckets ?? []).map((b) => ({
      name: b.Name ?? "",
      creationDate: b.CreationDate?.toISOString(),
    }));
  }

  async headBucket(bucket: string): Promise<boolean> {
    try {
      const command = new HeadBucketCommand({ Bucket: bucket });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async createBucket(name: string, locationHint?: string): Promise<void> {
    const command = new CreateBucketCommand({
      Bucket: name,
      CreateBucketConfiguration: {
        LocationConstraint: locationHint as any,
      },
    });

    await this.client.send(command);
    console.log(`Bucket created: ${name}`);
  }

  async deleteBucket(name: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[DRY RUN] Would delete bucket: ${name}`);
      return;
    }
    const command = new DeleteBucketCommand({ Bucket: name });
    await this.client.send(command);
    console.log(`Bucket deleted: ${name}`);
  }

  async getBucketLifecycle(bucket: string): Promise<LifecycleRule[]> {
    const command = new GetBucketLifecycleConfigurationCommand({ Bucket: bucket });
    const response = await this.client.send(command);

    return (response.Rules ?? []).map((rule) => ({
      id: rule.ID ?? "",
      prefix: rule.Filter?.Prefix ?? rule.Prefix ?? "",
      enabled: rule.Status === "Enabled",
      abortMultipartUploadsDays: rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation,
      expirationDays: rule.Expiration?.Days,
      expirationDate: rule.Expiration?.Date?.toISOString(),
      transitionDays: rule.Transitions?.[0]?.Days,
      transitionStorageClass: rule.Transitions?.[0]?.StorageClass,
    }));
  }

  async putBucketLifecycle(bucket: string, rules: LifecycleRule[]): Promise<void> {
    const command = new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: rules.map((rule) => ({
          ID: rule.id,
          Status: rule.enabled ? "Enabled" : "Disabled",
          Filter: { Prefix: rule.prefix },
          ...(rule.expirationDays && { Expiration: { Days: rule.expirationDays } }),
          ...(rule.expirationDate && { Expiration: { Date: new Date(rule.expirationDate) } }),
          ...(rule.abortMultipartUploadsDays && {
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: rule.abortMultipartUploadsDays },
          }),
          ...(rule.transitionDays && rule.transitionStorageClass && {
            Transitions: [{ Days: rule.transitionDays, StorageClass: rule.transitionStorageClass as any }],
          }),
        })),
      },
    });

    await this.client.send(command);
    console.log(`Lifecycle rules updated for bucket: ${bucket}`);
  }

  async deleteBucketLifecycle(bucket: string): Promise<void> {
    const command = new DeleteBucketLifecycleCommand({ Bucket: bucket });
    await this.client.send(command);
    console.log(`Lifecycle rules deleted for bucket: ${bucket}`);
  }

  async getBucketCors(bucket: string): Promise<CorsRule[]> {
    const command = new GetBucketCorsCommand({ Bucket: bucket });
    const response = await this.client.send(command);

    return (response.CORSRules ?? []).map((rule) => ({
      id: rule.ID,
      allowedMethods: rule.AllowedMethods ?? [],
      allowedOrigins: rule.AllowedOrigins ?? [],
      allowedHeaders: rule.AllowedHeaders,
      exposeHeaders: rule.ExposeHeaders,
      maxAgeSeconds: rule.MaxAgeSeconds,
    }));
  }

  async putBucketCors(bucket: string, rules: CorsRule[]): Promise<void> {
    const command = new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: rules.map((rule) => ({
          ID: rule.id,
          AllowedMethods: rule.allowedMethods as any[],
          AllowedOrigins: rule.allowedOrigins,
          AllowedHeaders: rule.allowedHeaders,
          ExposeHeaders: rule.exposeHeaders,
          MaxAgeSeconds: rule.maxAgeSeconds,
        })),
      },
    });

    await this.client.send(command);
    console.log(`CORS rules updated for bucket: ${bucket}`);
  }

  async deleteBucketCors(bucket: string): Promise<void> {
    const command = new DeleteBucketCorsCommand({ Bucket: bucket });
    await this.client.send(command);
    console.log(`CORS rules deleted for bucket: ${bucket}`);
  }

  async transitionStorageClass(bucket: string, key: string, storageClass: "STANDARD" | "STANDARD_IA"): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: `${bucket}/${key}`,
      StorageClass: storageClass,
      MetadataDirective: "COPY",
    });

    await this.client.send(command);
  }

  async generatePresignedUrl(
    bucket: string,
    key: string,
    operation: "get" | "put" | "head" | "delete",
    expiresIn: number = 3600
  ): Promise<PresignedUrlResult> {
    let command;
    switch (operation) {
      case "get":
        command = new GetObjectCommand({ Bucket: bucket, Key: key });
        break;
      case "put":
        command = new PutObjectCommand({ Bucket: bucket, Key: key });
        break;
      case "head":
        command = new HeadObjectCommand({ Bucket: bucket, Key: key });
        break;
      case "delete": {
        const { DeleteObjectCommand: DelCmd } = await import("@aws-sdk/client-s3");
        command = new DelCmd({ Bucket: bucket, Key: key });
        break;
      }
      default:
        throw new Error(`Unsupported presigned URL operation: ${operation}`);
    }

    const url = await getSignedUrl(this.client as any, command as any, { expiresIn });

    return {
      url,
      expiresInSeconds: expiresIn,
      operation: operation.toUpperCase(),
      key,
      bucket,
    };
  }

  getClient(): S3Client {
    return this.client;
  }

  getConfig(): Config {
    return this.config;
  }
}
