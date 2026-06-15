import { CfApiClient } from "../client/cf-api-client.js";
import type { Config } from "../config/config.js";

export class TokensCommand {
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
      case "list":
      case "ls":
        await this.list(args.slice(1));
        break;
      case "create":
        await this.create(args.slice(1));
        break;
      case "delete":
      case "rm":
        await this.delete(args.slice(1));
        break;
      default:
        this.printHelp();
    }
  }

  private async list(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    const tokens = await this.cfClient.listBucketTokens(bucket);

    if (tokens.length === 0) {
      console.log(`No bucket-scoped tokens for: ${bucket}`);
      return;
    }

    console.log(`Bucket-scoped tokens for ${bucket}:\n`);
    for (const t of tokens) {
      console.log(`  ID:       ${t.id}`);
      console.log(`  Access Key: ${t.accessKeyId}`);
      console.log(`  Status:   ${t.status}`);
      console.log();
    }
  }

  private async create(args: string[]): Promise<void> {
    let bucket = "";
    let name = `token-${Date.now()}`;
    let permissions: string[] = ["Read"];
    let ttl: number | undefined;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--name":
        case "-n":
          name = args[++i] ?? name;
          break;
        case "--permissions":
          permissions = (args[++i] ?? "").split(",");
          break;
        case "--ttl":
          ttl = parseInt(args[++i] ?? "0", 10);
          break;
      }
    }

    if (!bucket) {
      console.error("Error: --bucket is required");
      return;
    }

    const token = await this.cfClient.createBucketToken(bucket, name, permissions, ttl);
    console.log(`Token created for ${bucket}:`);
    console.log(`  Access Key ID:     ${token.accessKeyId}`);
    console.log(`  Secret Access Key: ${token.secretAccessKey}`);
    console.log(`  Status:            ${token.status}`);
    console.log("\n⚠️  Save the Secret Access Key now — it won't be shown again!");
  }

  private async delete(args: string[]): Promise<void> {
    let bucket = "";
    let tokenId = "";

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--id":
          tokenId = args[++i] ?? "";
          break;
      }
    }

    if (!bucket || !tokenId) {
      console.error("Error: --bucket and --id are required");
      return;
    }

    await this.cfClient.deleteBucketToken(bucket, tokenId);
    console.log(`Token ${tokenId} deleted from bucket: ${bucket}`);
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
Manage bucket-scoped API tokens (requires accountId + apiToken)

Usage: r2-tools tokens <subcommand> [options]

Subcommands:
  list                    List bucket-scoped tokens
  create                  Create a new bucket-scoped token
  delete                  Delete a bucket-scoped token

Common options:
  --bucket, -b <name>     Bucket name (required)

Create options:
  --name, -n <name>       Token name (default: auto-generated)
  --permissions <list>    Comma-separated permissions (default: Read)
                          Options: Read, Write, Delete, List
  --ttl <seconds>         Time-to-live for the token

Delete options:
  --id <token-id>         Token ID to delete (required)

Examples:
  r2-tools tokens list -b my-bucket
  r2-tools tokens create -b my-bucket --permissions Read,Write
  r2-tools tokens create -b my-bucket -n deploy-token --permissions Read,Write,Delete --ttl 86400
  r2-tools tokens delete -b my-bucket --id abc123
`);
  }
}
