import { CfApiClient } from "../client/cf-api-client.js";
import type { Config } from "../config/config.js";

export class DevUrlCommand {
  private cfClient: CfApiClient;

  constructor(config: Config) {
    this.cfClient = new CfApiClient(config);
  }

  async run(args: string[]): Promise<void> {
    if (args.includes("--help") || args.includes("-h")) {
      this.printHelp();
      return;
    }

    this.cfClient.requireAvailable();

    const subcommand = args[0];

    switch (subcommand) {
      case "enable":
        await this.enable(args.slice(1));
        break;
      case "disable":
        await this.disable(args.slice(1));
        break;
      case "status":
        await this.status(args.slice(1));
        break;
      default:
        this.printHelp();
    }
  }

  private async enable(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    await this.cfClient.enableDevUrl(bucket);
    console.log(`Public development URL enabled for bucket: ${bucket}`);
  }

  private async disable(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    await this.cfClient.disableDevUrl(bucket);
    console.log(`Public development URL disabled for bucket: ${bucket}`);
  }

  private async status(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    const result = await this.cfClient.getDevUrl(bucket);
    console.log(`Dev URL status for ${bucket}:`);
    console.log(JSON.stringify(result, null, 2));
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
Manage public development URL (r2.dev) for R2 buckets (requires accountId + apiToken)

Usage: r2-tools dev-url <subcommand> [options]

Subcommands:
  enable                  Enable r2.dev public access
  disable                 Disable r2.dev public access
  status                  Check r2.dev status

Options:
  --bucket, -b <name>     Bucket name (required)

Examples:
  r2-tools dev-url enable -b my-bucket
  r2-tools dev-url disable -b my-bucket
  r2-tools dev-url status -b my-bucket
`);
  }
}
