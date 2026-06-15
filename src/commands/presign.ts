import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";

export class PresignCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    let bucket = "";
    let key = "";
    let operation: "get" | "put" | "head" | "delete" = "get";
    let expires = 3600;

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
        case "--operation":
        case "-o":
          const op = args[++i];
          if (op !== "get" && op !== "put" && op !== "head" && op !== "delete") {
            console.error("Error: --operation must be get, put, head, or delete");
            return;
          }
          operation = op;
          break;
        case "--expires":
        case "-e":
          expires = parseInt(args[++i] ?? "3600", 10);
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

    const result = await this.client.generatePresignedUrl(bucket, key, operation, expires);

    console.log(`Presigned URL (${result.operation} ${result.bucket}/${result.key}):`);
    console.log(`Expires in: ${result.expiresInSeconds}s`);
    console.log(`\n${result.url}`);
  }

  private printHelp(): void {
    console.log(`
Generate presigned URLs for R2 objects

Usage: r2-tools presign [options]

Options:
  --bucket, -b <name>       Bucket name (required)
  --key, -k <key>           Object key (required)
  --operation, -o <op>      Operation: get, put, head, delete (default: get)
  --expires, -e <seconds>   URL expiration in seconds (default: 3600, max: 604800)
  --help, -h                Show this help

Examples:
  r2-tools presign -b my-bucket -k image.png
  r2-tools presign -b my-bucket -k upload.zip -o put -e 7200
  r2-tools presign -b my-bucket -k file.txt -o delete -e 300
  r2-tools presign -b my-bucket -k doc.pdf -o get -e 86400
`);
  }
}
