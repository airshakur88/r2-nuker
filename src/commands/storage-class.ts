import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatBytes, formatNumber } from "../utils/format.js";
import { withProgress } from "../utils/progress.js";

export class StorageClassCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    let bucket = "";
    let prefix: string | undefined;
    let storageClass: "STANDARD" | "STANDARD_IA" = "STANDARD_IA";
    let key: string | undefined;
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--prefix":
        case "-p":
          prefix = args[++i];
          break;
        case "--key":
        case "-k":
          key = args[++i];
          break;
        case "--class":
        case "-c":
          const cls = args[++i];
          if (cls !== "STANDARD" && cls !== "STANDARD_IA") {
            console.error("Error: --class must be STANDARD or STANDARD_IA");
            return;
          }
          storageClass = cls;
          break;
        case "--dry-run":
          dryRun = true;
          break;
        case "--help":
        case "-h":
          this.printHelp();
          return;
      }
    }

    if (!bucket) {
      console.error("Error: --bucket is required");
      this.printHelp();
      return;
    }

    if (!key && !prefix) {
      console.error("Error: --key or --prefix is required");
      this.printHelp();
      return;
    }

    if (key) {
      if (dryRun) {
        console.log(`[DRY RUN] Would transition ${key} to ${storageClass}`);
        return;
      }
      await this.client.transitionStorageClass(bucket, key, storageClass);
      console.log(`Transitioned ${key} to ${storageClass}`);
    } else {
      const objects = await this.client.listObjects(bucket, prefix);
      if (objects.length === 0) {
        console.log("No objects found.");
        return;
      }

      const alreadyInClass = objects.filter((o) => o.storageClass === storageClass);
      const toTransition = objects.filter((o) => o.storageClass !== storageClass);

      console.log(`Found ${objects.length} objects, ${alreadyInClass.length} already in ${storageClass}, ${toTransition.length} to transition`);

      if (dryRun) {
        console.log(`[DRY RUN] Would transition ${toTransition.length} objects to ${storageClass}`);
        return;
      }

      let transitioned = 0;
      await withProgress(toTransition, async (obj) => {
        try {
          await this.client.transitionStorageClass(bucket, obj.key, storageClass);
          transitioned++;
        } catch (error) {
          console.error(`\nFailed to transition ${obj.key}: ${(error as Error).message}`);
        }
      }, "Transitioning");

      console.log(`\nTransitioned ${transitioned}/${toTransition.length} objects to ${storageClass}`);
    }
  }

  private printHelp(): void {
    console.log(`
Transition storage class for R2 objects

Usage: r2-tools storage-class [options]

Options:
  --bucket, -b <name>     Bucket name (required)
  --key, -k <key>         Transition a single object
  --prefix, -p <prefix>   Transition all objects with this prefix
  --class, -c <class>     Target storage class: STANDARD or STANDARD_IA (required)
  --dry-run               Simulate without making changes
  --help, -h              Show this help

Note: Transitioning from Infrequent Access to Standard is supported.
      Transitioning from Standard to Infrequent Access saves storage costs.

Examples:
  r2-tools storage-class -b my-bucket -k archive.zip -c STANDARD_IA
  r2-tools storage-class -b my-bucket -p logs/ -c STANDARD_IA
  r2-tools storage-class -b my-bucket -p recent/ -c STANDARD
  r2-tools storage-class -b my-bucket -p old/ -c STANDARD_IA --dry-run
`);
  }
}
