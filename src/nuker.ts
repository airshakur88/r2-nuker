import { R2Client, R2Object } from "./r2-client.js";
import { BypassChecker } from "./bypass.js";
import { Config, BucketConfig } from "./config.js";

export interface NukeResult {
  bucket: string;
  deletedObjects: number;
  bypassedObjects: number;
  abortedUploads: number;
  deletedUploads: number;
  errors: string[];
}

export class R2Nuker {
  private client: R2Client;
  private config: Config;
  private concurrency: number;

  constructor(config: Config) {
    this.config = config;
    this.client = new R2Client(config);
    this.concurrency = config.concurrency;
  }

  async nukeBucket(bucketConfig: BucketConfig): Promise<NukeResult> {
    const result: NukeResult = {
      bucket: bucketConfig.name,
      deletedObjects: 0,
      bypassedObjects: 0,
      abortedUploads: 0,
      deletedUploads: 0,
      errors: [],
    };

    console.log(`\n=== Nuking bucket: ${bucketConfig.name} ===`);

    const bypassChecker = new BypassChecker(
      this.config.globalBypass,
      bucketConfig.bypass
    );

    console.log(`Listing objects in ${bucketConfig.name}...`);
    const objects = await this.client.listObjects(bucketConfig.name);
    console.log(`Found ${objects.length} objects`);

    const { bypassed, toDelete } = bypassChecker.filterBypassed(objects);
    result.bypassedObjects = bypassed.length;

    if (bypassed.length > 0) {
      console.log(`Bypassed ${bypassed.length} objects:`);
      for (const obj of bypassed.slice(0, 10)) {
        console.log(`  - ${obj.key}`);
      }
      if (bypassed.length > 10) {
        console.log(`  ... and ${bypassed.length - 10} more`);
      }
    }

    if (toDelete.length > 0) {
      console.log(`Deleting ${toDelete.length} objects...`);
      const keysToDelete = toDelete.map((o) => o.key);
      const deleted = await this.deleteInBatches(keysToDelete, bucketConfig.name);
      result.deletedObjects = deleted;
    }

    console.log(`Listing multipart uploads in ${bucketConfig.name}...`);
    const uploads = await this.client.listMultipartUploads(bucketConfig.name);
    console.log(`Found ${uploads.length} multipart uploads`);

    if (uploads.length > 0) {
      const { bypassed: bypassedUploads, toDelete: uploadsToAbort } =
        bypassChecker.filterBypassed(uploads);

      result.deletedUploads = bypassedUploads.length;

      if (bypassedUploads.length > 0) {
        console.log(`Bypassed ${bypassedUploads.length} multipart uploads`);
      }

      console.log(`Aborting ${uploadsToAbort.length} multipart uploads...`);
      const aborted = await this.client.abortMultipartUploads(
        bucketConfig.name,
        uploadsToAbort
      );
      result.abortedUploads = aborted;
    }

    return result;
  }

  private async deleteInBatches(keys: string[], bucket: string): Promise<number> {
    let totalDeleted = 0;

    for (let i = 0; i < keys.length; i += this.concurrency) {
      const batch = keys.slice(i, i + this.concurrency);
      const deleted = await this.client.deleteObjects(bucket, batch);
      totalDeleted += deleted;

      const progress = Math.min(i + this.concurrency, keys.length);
      console.log(`Progress: ${progress}/${keys.length}`);
    }

    return totalDeleted;
  }

  async nukeAll(): Promise<NukeResult[]> {
    const results: NukeResult[] = [];

    if (this.client.isDryRun()) {
      console.log("=== DRY RUN MODE ===");
      console.log("No files will be actually deleted.\n");
    }

    for (const bucketConfig of this.config.buckets) {
      try {
        const result = await this.nukeBucket(bucketConfig);
        results.push(result);
      } catch (error) {
        results.push({
          bucket: bucketConfig.name,
          deletedObjects: 0,
          bypassedObjects: 0,
          abortedUploads: 0,
          deletedUploads: 0,
          errors: [(error as Error).message],
        });
      }
    }

    return results;
  }

  setDryRun(dryRun: boolean): void {
    this.client.setDryRun(dryRun);
  }
}