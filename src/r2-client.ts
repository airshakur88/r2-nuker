import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
  _Object,
} from "@aws-sdk/client-s3";
import { Config } from "./config.js";

export interface R2Object {
  key: string;
  size?: number;
}

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

  async listObjects(bucket: string): Promise<R2Object[]> {
    const objects: R2Object[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          objects.push({
            key: obj.Key!,
            size: obj.Size,
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async listMultipartUploads(bucket: string) {
    const uploads: { key: string; uploadId: string }[] = [];
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

  async abortMultipartUploads(
    bucket: string,
    uploads: { key: string; uploadId: string }[]
  ): Promise<number> {
    if (uploads.length === 0) return 0;
    if (this.dryRun) {
      console.log(
        `[DRY RUN] Would abort ${uploads.length} multipart uploads in ${bucket}`
      );
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

  isDryRun(): boolean {
    return this.dryRun;
  }

  setDryRun(dryRun: boolean): void {
    this.dryRun = dryRun;
  }
}