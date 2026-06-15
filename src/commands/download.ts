import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatBytes } from "../utils/format.js";
import { resolve, dirname, join } from "path";
import { mkdirSync } from "fs";

export class DownloadCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);
    if (!parsed) return;

    const { bucket, key, output, recursive, prefix } = parsed;

    if (recursive) {
      await this.downloadDirectory(bucket, prefix, output);
    } else {
      await this.downloadSingle(bucket, key, output);
    }
  }

  private parseArgs(args: string[]): { bucket: string; key: string; output?: string; recursive: boolean; prefix?: string } | null {
    let bucket = "";
    let key = "";
    let output: string | undefined;
    let recursive = false;
    let prefix: string | undefined;

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
        case "--output":
        case "-o":
          output = args[++i];
          break;
        case "--recursive":
        case "-r":
          recursive = true;
          break;
        case "--prefix":
        case "-p":
          prefix = args[++i];
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

    if (!recursive && !key) {
      console.error("Error: --key is required (or use --recursive with --prefix)");
      this.printHelp();
      return null;
    }

    return { bucket, key, output, recursive, prefix };
  }

  private async downloadSingle(bucket: string, key: string, output?: string): Promise<void> {
    const outputPath = output ?? resolve(".", key.split("/").pop()!);
    console.log(`Downloading: ${bucket}/${key} -> ${outputPath}`);
    await this.client.getObject(bucket, key, outputPath);
    console.log("Download complete!");
  }

  private async downloadDirectory(bucket: string, prefix?: string, outputDir?: string): Promise<void> {
    const objects = await this.client.listObjects(bucket, prefix);

    if (objects.length === 0) {
      console.log("No objects found.");
      return;
    }

    const baseDir = outputDir ?? resolve(".", prefix ?? "download");
    console.log(`Downloading ${objects.length} objects to ${baseDir}`);

    let downloaded = 0;
    let totalSize = 0;

    for (const obj of objects) {
      const relativeKey = prefix ? obj.key.slice(prefix.length) : obj.key;
      const outputPath = join(baseDir, relativeKey);

      try {
        const dir = dirname(outputPath);
        mkdirSync(dir, { recursive: true });
        await this.client.getObject(bucket, obj.key, outputPath);
        downloaded++;
        totalSize += obj.size ?? 0;
      } catch (error) {
        console.error(`Failed to download ${obj.key}: ${(error as Error).message}`);
      }
    }

    console.log(`\nDownload complete: ${downloaded}/${objects.length} files (${formatBytes(totalSize)})`);
  }

  private printHelp(): void {
    console.log(`
Download files from an R2 bucket

Usage: r2-tools download [options]

Options:
  --bucket, -b <name>     Source bucket name (required)
  --key, -k <key>         Object key to download (required unless --recursive)
  --output, -o <path>     Local output path (default: current directory)
  --recursive, -r         Download all objects with given prefix
  --prefix, -p <prefix>   Prefix filter for recursive download
  --help, -h              Show this help

Examples:
  r2-tools download -b my-bucket -k image.png
  r2-tools download -b my-bucket -k data/file.zip -o ./file.zip
  r2-tools download -b my-bucket -r -p logs/ -o ./logs-backup
`);
  }
}
