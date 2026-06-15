import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatBytes, formatDate, formatNumber } from "../utils/format.js";
import type { R2Object } from "../types.js";

export class LsCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);
    if (!parsed) return;

    const { bucket, prefix, delimiter, long, json: jsonOutput } = parsed;

    if (delimiter) {
      await this.listWithFolders(bucket, prefix, delimiter, long, jsonOutput);
    } else {
      await this.listFlat(bucket, prefix, long, jsonOutput);
    }
  }

  private async listFlat(bucket: string, prefix: string | undefined, long: boolean, jsonOutput: boolean): Promise<void> {
    const objects = await this.client.listObjects(bucket, prefix);

    if (jsonOutput) {
      console.log(JSON.stringify(objects, null, 2));
      return;
    }

    if (objects.length === 0) {
      console.log("No objects found.");
      return;
    }

    if (long) {
      this.printTable(objects, bucket);
    } else {
      for (const obj of objects) {
        console.log(`${bucket}/${obj.key}`);
      }
    }

    const totalSize = objects.reduce((sum, o) => sum + (o.size ?? 0), 0);
    console.log(`\nTotal: ${formatNumber(objects.length)} objects, ${formatBytes(totalSize)}`);
  }

  private async listWithFolders(bucket: string, prefix: string | undefined, delimiter: string, long: boolean, jsonOutput: boolean): Promise<void> {
    const [objects, prefixes] = await Promise.all([
      this.client.listObjects(bucket, prefix, delimiter),
      this.client.listCommonPrefixes(bucket, prefix, delimiter),
    ]);

    if (jsonOutput) {
      console.log(JSON.stringify({ objects, prefixes }, null, 2));
      return;
    }

    for (const p of prefixes) {
      console.log(`  PRE ${p}`);
    }

    if (long) {
      this.printTable(objects, bucket);
    } else {
      for (const obj of objects) {
        console.log(`${bucket}/${obj.key}`);
      }
    }

    console.log(`\nFolders: ${prefixes.length}, Objects: ${objects.length}`);
  }

  private printTable(objects: R2Object[], bucket: string): void {
    const maxKeyLen = Math.max(...objects.map((o) => o.key.length), 4);
    const header = `  ${"Key".padEnd(maxKeyLen)}  Size        Last Modified          Storage Class`;
    console.log(header);
    console.log("  " + "-".repeat(header.length - 2));

    for (const obj of objects) {
      const key = obj.key.padEnd(maxKeyLen);
      const size = formatBytes(obj.size ?? 0).padStart(10);
      const date = formatDate(obj.lastModified).padEnd(22);
      const sc = obj.storageClass ?? "STANDARD";
      console.log(`  ${key}  ${size}  ${date}  ${sc}`);
    }
  }

  private parseArgs(args: string[]): { bucket: string; prefix?: string; delimiter?: string; long: boolean; json: boolean } | null {
    let bucket = "";
    let prefix: string | undefined;
    let delimiter: string | undefined;
    let long = false;
    let json = false;

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
        case "--delimiter":
          delimiter = args[++i];
          break;
        case "--long":
        case "-l":
          long = true;
          break;
        case "--json":
          json = true;
          break;
        case "--help":
        case "-h":
          this.printHelp();
          return null;
      }
    }

    if (!bucket) {
      console.error("Error: --bucket is required");
      this.printHelp();
      return null;
    }

    return { bucket, prefix, delimiter, long, json };
  }

  private printHelp(): void {
    console.log(`
List objects in an R2 bucket

Usage: r2-tools ls [options]

Options:
  --bucket, -b <name>     Bucket name (required)
  --prefix, -p <prefix>   Filter by prefix
  --delimiter <char>      Delimiter for folder-like listing (default: /)
  --long, -l              Show detailed info (size, date, storage class)
  --json                  Output as JSON
  --help, -h              Show this help

Examples:
  r2-tools ls -b my-bucket
  r2-tools ls -b my-bucket -p logs/ -l
  r2-tools ls -b my-bucket --delimiter / --long
  r2-tools ls -b my-bucket --json
`);
  }
}
