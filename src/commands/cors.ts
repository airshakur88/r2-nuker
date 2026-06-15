import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import type { CorsRule } from "../types.js";

export class CorsCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const subcommand = args[0];

    switch (subcommand) {
      case "get":
        await this.get(args.slice(1));
        break;
      case "set":
        await this.set(args.slice(1));
        break;
      case "delete":
      case "rm":
        await this.delete(args.slice(1));
        break;
      default:
        this.printHelp();
    }
  }

  private async get(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    const rules = await this.client.getBucketCors(bucket);

    if (rules.length === 0) {
      console.log(`No CORS rules for bucket: ${bucket}`);
      return;
    }

    console.log(`CORS rules for ${bucket}:\n`);
    for (const rule of rules) {
      console.log(`  ${rule.id ?? "(unnamed)"}`);
      console.log(`    Origins:  ${rule.allowedOrigins.join(", ")}`);
      console.log(`    Methods:  ${rule.allowedMethods.join(", ")}`);
      if (rule.allowedHeaders) console.log(`    Headers:  ${rule.allowedHeaders.join(", ")}`);
      if (rule.exposeHeaders) console.log(`    Expose:   ${rule.exposeHeaders.join(", ")}`);
      if (rule.maxAgeSeconds) console.log(`    Max-Age:  ${rule.maxAgeSeconds}s`);
      console.log();
    }
  }

  private async set(args: string[]): Promise<void> {
    let bucket = "";
    let origins: string[] = [];
    let methods: string[] = [];
    let headers: string[] = [];
    let expose: string[] = [];
    let maxAge: number | undefined;
    let id: string | undefined;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--origins":
          origins = (args[++i] ?? "").split(",");
          break;
        case "--methods":
          methods = (args[++i] ?? "").split(",").map((m) => m.toUpperCase());
          break;
        case "--headers":
          headers = (args[++i] ?? "").split(",");
          break;
        case "--expose":
          expose = (args[++i] ?? "").split(",");
          break;
        case "--max-age":
          maxAge = parseInt(args[++i] ?? "0", 10);
          break;
        case "--id":
          id = args[++i];
          break;
      }
    }

    if (!bucket) {
      console.error("Error: --bucket is required");
      return;
    }

    if (origins.length === 0 || methods.length === 0) {
      console.error("Error: --origins and --methods are required");
      return;
    }

    const existingRules = await this.client.getBucketCors(bucket);
    const newRule: CorsRule = {
      id: id ?? `CORS-${Date.now()}`,
      allowedOrigins: origins,
      allowedMethods: methods,
      allowedHeaders: headers.length > 0 ? headers : undefined,
      exposeHeaders: expose.length > 0 ? expose : undefined,
      maxAgeSeconds: maxAge,
    };

    existingRules.push(newRule);
    await this.client.putBucketCors(bucket, existingRules);
    console.log(`CORS rule added to bucket: ${bucket}`);
  }

  private async delete(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    await this.client.deleteBucketCors(bucket);
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
Manage CORS policies for R2 buckets

Usage: r2-tools cors <subcommand> [options]

Subcommands:
  get                     Get CORS rules
  set                     Add a CORS rule
  delete                  Delete all CORS rules

Common options:
  --bucket, -b <name>     Bucket name (required)

Set options:
  --origins <list>        Comma-separated allowed origins (required)
  --methods <list>        Comma-separated allowed methods (required, e.g. GET,PUT)
  --headers <list>        Comma-separated allowed headers
  --expose <list>         Comma-separated exposed headers
  --max-age <seconds>     Preflight cache duration
  --id <name>             Rule identifier

Examples:
  r2-tools cors get -b my-bucket
  r2-tools cors set -b my-bucket --origins "http://localhost:3000" --methods GET,PUT --headers "x-requested-by"
  r2-tools cors set -b my-bucket --origins "*" --methods GET --max-age 3600
  r2-tools cors delete -b my-bucket
`);
  }
}
