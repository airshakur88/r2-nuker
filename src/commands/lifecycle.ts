import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import type { LifecycleRule } from "../types.js";

export class LifecycleCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const subcommand = args[0];

    switch (subcommand) {
      case "list":
      case "ls":
        await this.list(args.slice(1));
        break;
      case "add":
        await this.add(args.slice(1));
        break;
      case "remove":
      case "rm":
        await this.remove(args.slice(1));
        break;
      case "clear":
        await this.clear(args.slice(1));
        break;
      default:
        this.printHelp();
    }
  }

  private async list(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    const rules = await this.client.getBucketLifecycle(bucket);

    if (rules.length === 0) {
      console.log(`No lifecycle rules for bucket: ${bucket}`);
      return;
    }

    console.log(`Lifecycle rules for ${bucket}:\n`);
    for (const rule of rules) {
      console.log(`  Rule: ${rule.id}`);
      console.log(`    Enabled:  ${rule.enabled}`);
      console.log(`    Prefix:   ${rule.prefix || "(all)"}`);
      if (rule.expirationDays) console.log(`    Expire after: ${rule.expirationDays} days`);
      if (rule.expirationDate) console.log(`    Expire on: ${rule.expirationDate}`);
      if (rule.transitionDays) console.log(`    Transition to ${rule.transitionStorageClass} after: ${rule.transitionDays} days`);
      if (rule.abortMultipartUploadsDays) console.log(`    Abort multipart uploads after: ${rule.abortMultipartUploadsDays} days`);
      console.log();
    }
  }

  private async add(args: string[]): Promise<void> {
    let bucket = "";
    let id = "";
    let prefix = "";
    let expirationDays: number | undefined;
    let transitionDays: number | undefined;
    let transitionClass = "STANDARD_IA";
    let abortDays: number | undefined;
    let enabled = true;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--id":
          id = args[++i] ?? "";
          break;
        case "--prefix":
        case "-p":
          prefix = args[++i] ?? "";
          break;
        case "--expire-days":
          expirationDays = parseInt(args[++i] ?? "0", 10);
          break;
        case "--transition-days":
          transitionDays = parseInt(args[++i] ?? "0", 10);
          break;
        case "--transition-class":
          transitionClass = args[++i] ?? "STANDARD_IA";
          break;
        case "--abort-days":
          abortDays = parseInt(args[++i] ?? "0", 10);
          break;
        case "--disabled":
          enabled = false;
          break;
      }
    }

    if (!bucket) {
      console.error("Error: --bucket is required");
      return;
    }

    if (!id) id = `Rule-${Date.now()}`;

    const existingRules = await this.client.getBucketLifecycle(bucket);
    const newRule: LifecycleRule = {
      id,
      prefix,
      enabled,
      expirationDays,
      transitionDays,
      transitionStorageClass: transitionDays ? transitionClass : undefined,
      abortMultipartUploadsDays: abortDays,
    };

    existingRules.push(newRule);
    await this.client.putBucketLifecycle(bucket, existingRules);
    console.log(`Lifecycle rule "${id}" added to bucket: ${bucket}`);
  }

  private async remove(args: string[]): Promise<void> {
    let bucket = "";
    let ruleId = "";

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--id":
          ruleId = args[++i] ?? "";
          break;
      }
    }

    if (!bucket || !ruleId) {
      console.error("Error: --bucket and --id are required");
      return;
    }

    const rules = await this.client.getBucketLifecycle(bucket);
    const filtered = rules.filter((r) => r.id !== ruleId);

    if (filtered.length === rules.length) {
      console.log(`Rule "${ruleId}" not found`);
      return;
    }

    await this.client.putBucketLifecycle(bucket, filtered);
    console.log(`Lifecycle rule "${ruleId}" removed from bucket: ${bucket}`);
  }

  private async clear(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    await this.client.deleteBucketLifecycle(bucket);
  }

  private getBucketArg(args: string[]): string | null {
    let bucket = "";
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--bucket" || args[i] === "-b") {
        bucket = args[++i] ?? "";
      }
    }
    if (!bucket) {
      console.error("Error: --bucket is required");
      return null;
    }
    return bucket;
  }

  private printHelp(): void {
    console.log(`
Manage object lifecycle rules for R2 buckets

Usage: r2-tools lifecycle <subcommand> [options]

Subcommands:
  list                    List lifecycle rules
  add                     Add a lifecycle rule
  remove                  Remove a specific rule
  clear                   Remove all lifecycle rules

Common options:
  --bucket, -b <name>     Bucket name (required)

Add options:
  --id <name>             Rule ID (auto-generated if not set)
  --prefix, -p <prefix>   Apply to objects with this prefix
  --expire-days <n>       Delete objects after N days
  --transition-days <n>   Transition to Infrequent Access after N days
  --transition-class <c>  Storage class (default: STANDARD_IA)
  --abort-days <n>        Abort multipart uploads after N days
  --disabled              Create rule as disabled

Remove options:
  --id <name>             Rule ID to remove (required)

Examples:
  r2-tools lifecycle list -b my-bucket
  r2-tools lifecycle add -b my-bucket --expire-days 90 -p logs/
  r2-tools lifecycle add -b my-bucket --transition-days 30 --transition-class STANDARD_IA
  r2-tools lifecycle add -b my-bucket --abort-days 7
  r2-tools lifecycle remove -b my-bucket --id "Delete Old Logs"
  r2-tools lifecycle clear -b my-bucket
`);
  }
}
