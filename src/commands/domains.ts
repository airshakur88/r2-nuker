import { CfApiClient } from "../client/cf-api-client.js";
import type { Config } from "../config/config.js";

export class DomainsCommand {
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
      case "add":
        await this.add(args.slice(1));
        break;
      case "remove":
      case "rm":
        await this.remove(args.slice(1));
        break;
      default:
        this.printHelp();
    }
  }

  private async list(args: string[]): Promise<void> {
    const bucket = this.getBucketArg(args);
    if (!bucket) return;

    const domains = await this.cfClient.listCustomDomains(bucket);

    if (domains.length === 0) {
      console.log(`No custom domains for bucket: ${bucket}`);
      return;
    }

    console.log(`Custom domains for ${bucket}:\n`);
    for (const d of domains) {
      const status = d.enabled ? "ENABLED" : "DISABLED";
      console.log(`  ${d.domain}`);
      console.log(`    Status:  ${status}`);
      console.log(`    Ownership: ${d.status.ownership}, SSL: ${d.status.ssl}`);
      if (d.zoneName) console.log(`    Zone:    ${d.zoneName}`);
      console.log();
    }
  }

  private async add(args: string[]): Promise<void> {
    let bucket = "";
    let domain = "";
    let zoneId: string | undefined;
    let minTls: string | undefined;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--domain":
        case "-d":
          domain = args[++i] ?? "";
          break;
        case "--zone-id":
          zoneId = args[++i];
          break;
        case "--min-tls":
          minTls = args[++i];
          break;
      }
    }

    if (!bucket || !domain) {
      console.error("Error: --bucket and --domain are required");
      return;
    }

    await this.cfClient.addCustomDomain(bucket, domain, zoneId, minTls);
    console.log(`Custom domain "${domain}" added to bucket: ${bucket}`);
  }

  private async remove(args: string[]): Promise<void> {
    let bucket = "";
    let domain = "";

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--domain":
        case "-d":
          domain = args[++i] ?? "";
          break;
      }
    }

    if (!bucket || !domain) {
      console.error("Error: --bucket and --domain are required");
      return;
    }

    await this.cfClient.removeCustomDomain(bucket, domain);
    console.log(`Custom domain "${domain}" removed from bucket: ${bucket}`);
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
Manage custom domains for R2 buckets (requires accountId + apiToken)

Usage: r2-tools domains <subcommand> [options]

Subcommands:
  list                    List custom domains
  add                     Add a custom domain
  remove                  Remove a custom domain

Common options:
  --bucket, -b <name>     Bucket name (required)

Add options:
  --domain, -d <domain>   Domain name (required)
  --zone-id <id>          Cloudflare Zone ID
  --min-tls <version>     Minimum TLS version (1.0, 1.1, 1.2, 1.3)

Remove options:
  --domain, -d <domain>   Domain name (required)

Examples:
  r2-tools domains list -b my-bucket
  r2-tools domains add -b my-bucket -d cdn.example.com
  r2-tools domains add -b my-bucket -d cdn.example.com --min-tls 1.2
  r2-tools domains remove -b my-bucket -d cdn.example.com
`);
  }
}
