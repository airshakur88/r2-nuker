import { R2Client } from "../client/r2-client.js";
import { BypassChecker } from "../utils/bypass.js";
import type { Config, BucketConfig } from "../config/config.js";
import type { NukeResult } from "../types.js";
import { withBatchProgress } from "../utils/progress.js";

export class NukeCommand {
  private client: R2Client;
  private config: Config;
  private concurrency: number;

  constructor(config: Config) {
    this.config = config;
    this.client = new R2Client(config);
    this.concurrency = config.concurrency;
  }

  async runBucket(bucketConfig: BucketConfig): Promise<NukeResult> {
    const result: NukeResult = {
      bucket: bucketConfig.name,
      deletedObjects: 0,
      bypassedObjects: 0,
      abortedUploads: 0,
      deletedUploads: 0,
      errors: [],
    };

    console.log(`\n=== Nuking bucket: ${bucketConfig.name} ===`);

    const bypassChecker = new BypassChecker(this.config.globalBypass, bucketConfig.bypass);

    console.log(`Listing objects in ${bucketConfig.name}...`);
    const objects = await this.client.listObjects(bucketConfig.name);
    console.log(`Found ${objects.length} objects`);

    const { bypassed, toDelete } = bypassChecker.filterBypassed(objects);
    result.bypassedObjects = bypassed.length;

    if (bypassed.length > 0) {
      console.log(`Bypassed ${bypassed.length} objects:`);
      for (const obj of bypassed.slice(0, 10)) {
        console.log(` - ${obj.key}`);
      }
      if (bypassed.length > 10) {
        console.log(` ... and ${bypassed.length - 10} more`);
      }
    }

    if (toDelete.length > 0) {
      console.log(`Deleting ${toDelete.length} objects...`);
      const keysToDelete = toDelete.map((o) => o.key);
      const deleted = await withBatchProgress(
        keysToDelete,
        this.concurrency,
        async (batch) => {
          return this.client.deleteObjects(bucketConfig.name, batch);
        },
        "Deleting"
      );
      result.deletedObjects = deleted;
    }

    console.log(`Listing multipart uploads in ${bucketConfig.name}...`);
    const uploads = await this.client.listMultipartUploads(bucketConfig.name);
    console.log(`Found ${uploads.length} multipart uploads`);

    if (uploads.length > 0) {
      const { bypassed: bypassedUploads, toDelete: uploadsToAbort } = bypassChecker.filterBypassed(uploads);
      result.deletedUploads = bypassedUploads.length;

      if (bypassedUploads.length > 0) {
        console.log(`Bypassed ${bypassedUploads.length} multipart uploads`);
      }

      console.log(`Aborting ${uploadsToAbort.length} multipart uploads...`);
      const aborted = await this.client.abortMultipartUploads(bucketConfig.name, uploadsToAbort);
      result.abortedUploads = aborted;
    }

    return result;
  }

  async run(bucket?: string): Promise<NukeResult[]> {
    const results: NukeResult[] = [];

    if (this.client.isDryRun()) {
      console.log("=== DRY RUN MODE ===");
      console.log("No files will be actually deleted.\n");
    }

    const buckets = bucket
      ? this.config.buckets.filter((b) => b.name === bucket)
      : this.config.buckets;

    if (bucket && buckets.length === 0) {
      console.error(`Bucket "${bucket}" not found in config`);
      process.exit(1);
    }

    for (const bucketConfig of buckets) {
      try {
        const result = await this.runBucket(bucketConfig);
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

export function printNukeResults(results: NukeResult[], dryRun: boolean): void {
  console.log("\n=== RESULTS ===");
  let totalDeleted = 0;
  let totalBypassed = 0;
  let totalAborted = 0;
  let totalErrors = 0;

  for (const result of results) {
    console.log(`\nBucket: ${result.bucket}`);
    console.log(`  Deleted objects: ${result.deletedObjects}`);
    console.log(`  Bypassed objects: ${result.bypassedObjects}`);
    console.log(`  Aborted uploads: ${result.abortedUploads}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`   - ${error}`);
      }
    }

    totalDeleted += result.deletedObjects;
    totalBypassed += result.bypassedObjects;
    totalAborted += result.abortedUploads;
    totalErrors += result.errors.length;
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total deleted: ${totalDeleted}`);
  console.log(`Total bypassed: ${totalBypassed}`);
  console.log(`Total aborted: ${totalAborted}`);
  console.log(`Total errors: ${totalErrors}`);

  if (dryRun) {
    console.log("\nThis was a DRY RUN. Use --force to actually delete.");
  }
}
