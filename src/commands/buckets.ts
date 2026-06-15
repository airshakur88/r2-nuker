import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatDate } from "../utils/format.js";

export class BucketsCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const subcommand = args[0];

    switch (subcommand) {
      case "list":
      case "ls":
        await this.list();
        break;
      case "create":
        await this.create(args.slice(1));
        break;
      case "delete":
      case "rm":
        await this.delete(args.slice(1));
        break;
      case "info":
        await this.info(args.slice(1));
        break;
      case "exists":
        await this.exists(args.slice(1));
        break;
      default:
        this.printHelp();
    }
  }

  private async list(): Promise<void> {
    const buckets = await this.client.listBuckets();
    if (buckets.length === 0) {
      console.log("No buckets found.");
      return;
    }

    console.log(`Found ${buckets.length} buckets:\n`);
    for (const bucket of buckets) {
      const date = bucket.creationDate ? formatDate(bucket.creationDate) : "N/A";
      console.log(`  ${bucket.name}  (created: ${date})`);
    }
  }

  private async create(args: string[]): Promise<void> {
    let name = "";
    let locationHint: string | undefined;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--name":
        case "-n":
          name = args[++i] ?? "";
          break;
        case "--location":
        case "-l":
          locationHint = args[++i];
          break;
      }
    }

    if (!name) {
      console.error("Error: --name is required");
      return;
    }

    await this.client.createBucket(name, locationHint);
  }

  private async delete(args: string[]): Promise<void> {
    let name = "";
    let force = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--name":
        case "-n":
          name = args[++i] ?? "";
          break;
        case "--force":
        case "-f":
          force = true;
          break;
      }
    }

    if (!name) {
      console.error("Error: --name is required");
      return;
    }

    if (this.client.isDryRun()) {
      console.log(`[DRY RUN] Would delete bucket: ${name}`);
      return;
    }

    await this.client.deleteBucket(name);
  }

  private async info(args: string[]): Promise<void> {
    const name = args[0];
    if (!name) {
      console.error("Error: bucket name is required");
      return;
    }

    const exists = await this.client.headBucket(name);
    if (exists) {
      console.log(`Bucket "${name}" exists`);
    } else {
      console.log(`Bucket "${name}" does NOT exist`);
    }
  }

  private async exists(args: string[]): Promise<void> {
    await this.info(args);
  }

  private printHelp(): void {
    console.log(`
Manage R2 buckets

Usage: r2-tools buckets <subcommand> [options]

Subcommands:
  list                    List all buckets
  create                  Create a new bucket
  delete                  Delete a bucket
  info <name>             Check if a bucket exists

Create options:
  --name, -n <name>       Bucket name (required)
  --location, -l <loc>    Location hint (apac, eeur, enam, weur, wnam, oc)

Delete options:
  --name, -n <name>       Bucket name (required)
  --force, -f             Actually delete (default: dry-run)

Examples:
  r2-tools buckets list
  r2-tools buckets create -n my-new-bucket
  r2-tools buckets create -n eu-bucket -l weur
  r2-tools buckets delete -n old-bucket -f
  r2-tools buckets info my-bucket
`);
  }
}
