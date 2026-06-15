import { CfApiClient } from "../client/cf-api-client.js";
import type { Config } from "../config/config.js";
import { formatBytes, formatDate } from "../utils/format.js";

export class StatsCommand {
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

    let bucket = "";
    let since = "-24h";

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--since":
        case "-s":
          since = args[++i] ?? "-24h";
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

    try {
      const analytics = await this.cfClient.getBucketAnalytics(bucket, since);

      if (!analytics || analytics.length === 0) {
        console.log(`No analytics data found for bucket: ${bucket} (since: ${since})`);
        return;
      }

      console.log(`\nAnalytics for ${bucket} (since: ${since}):\n`);
      console.log("─────────────────────────────────────────────");

      let totalObjects = 0;
      let totalSize = 0;
      let totalUploads = 0;
      let totalDeletes = 0;

      for (const entry of analytics) {
        const sum = entry.sum ?? {};
        const dims = entry.dimensions ?? {};
        totalObjects += sum.objectCount ?? 0;
        totalSize += sum.payloadSize ?? 0;
        totalUploads += sum.uploadCount ?? 0;
        totalDeletes += sum.deleteCount ?? 0;

        if (dims.date) {
          console.log(`  Date: ${dims.date}`);
          console.log(`    Objects:  ${sum.objectCount ?? 0}`);
          console.log(`    Size:     ${formatBytes(sum.payloadSize ?? 0)}`);
          console.log(`    Uploads:  ${sum.uploadCount ?? 0}`);
          console.log(`    Deletes:  ${sum.deleteCount ?? 0}`);
          console.log();
        }
      }

      console.log("─────────────────────────────────────────────");
      console.log(`  Total Objects:  ${totalObjects}`);
      console.log(`  Total Size:     ${formatBytes(totalSize)}`);
      console.log(`  Total Uploads:  ${totalUploads}`);
      console.log(`  Total Deletes:  ${totalDeletes}`);
    } catch (error) {
      console.error(`Failed to get analytics: ${(error as Error).message}`);
    }
  }

  private printHelp(): void {
    console.log(`
View R2 bucket analytics/metrics (requires accountId + apiToken)

Usage: r2-tools stats [options]

Options:
  --bucket, -b <name>     Bucket name (required)
  --since, -s <time>      Time range (default: -24h)
                          Examples: -1h, -24h, -7d, -30d
  --help, -h              Show this help

Examples:
  r2-tools stats -b my-bucket
  r2-tools stats -b my-bucket -s -7d
  r2-tools stats -b my-bucket -s -30d
`);
  }
}
