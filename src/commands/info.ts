import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatBytes, formatDate } from "../utils/format.js";

export class InfoCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    let bucket = "";
    let key = "";
    let json = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--key":
        case "-k":
          key = args[++i] ?? "";
          break;
        case "--json":
          json = true;
          break;
        case "--help":
        case "-h":
          this.printHelp();
          return;
      }
    }

    if (!bucket || !key) {
      console.error("Error: --bucket and --key are required");
      this.printHelp();
      return;
    }

    try {
      const detail = await this.client.headObject(bucket, key);

      if (json) {
        console.log(JSON.stringify(detail, null, 2));
        return;
      }

      console.log(`\nObject: ${bucket}/${key}`);
      console.log("─────────────────────────────────────");
      console.log(`  Size:           ${formatBytes(detail.size)} (${detail.size} bytes)`);
      console.log(`  Last Modified:  ${formatDate(detail.lastModified)}`);
      console.log(`  Storage Class:  ${detail.storageClass}`);
      console.log(`  Content Type:   ${detail.contentType}`);
      console.log(`  ETag:           ${detail.etag}`);

      const metadataKeys = Object.keys(detail.metadata);
      if (metadataKeys.length > 0) {
        console.log(`  Metadata:`);
        for (const k of metadataKeys) {
          console.log(`    ${k}: ${detail.metadata[k]}`);
        }
      }
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
        console.log(`Object not found: ${bucket}/${key}`);
      } else {
        console.error(`Error: ${(error as Error).message}`);
      }
    }
  }

  private printHelp(): void {
    console.log(`
Get detailed info about an R2 object

Usage: r2-tools info [options]

Options:
  --bucket, -b <name>     Bucket name (required)
  --key, -k <key>         Object key (required)
  --json                  Output as JSON
  --help, -h              Show this help

Examples:
  r2-tools info -b my-bucket -k image.png
  r2-tools info -b my-bucket -k data/file.zip --json
`);
  }
}
