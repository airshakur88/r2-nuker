import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { existsSync, statSync, readdirSync } from "fs";
import { resolve, basename, join, relative } from "path";

export class UploadCommand {
  private client: R2Client;

  constructor(config: Config) {
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);
    if (!parsed) return;

    const { bucket, source, key, contentType, metadata, recursive } = parsed;

    if (recursive) {
      await this.uploadDirectory(bucket, source, key, contentType);
    } else {
      await this.uploadSingle(bucket, source, key, contentType, metadata);
    }
  }

  private parseArgs(args: string[]): { bucket: string; source: string; key: string; contentType?: string; metadata?: Record<string, string>; recursive: boolean } | null {
    let bucket = "";
    let source = "";
    let key = "";
    let contentType: string | undefined;
    let metadata: Record<string, string> | undefined;
    let recursive = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--source":
        case "-s":
          source = args[++i] ?? "";
          break;
        case "--key":
        case "-k":
          key = args[++i] ?? "";
          break;
        case "--content-type":
        case "-t":
          contentType = args[++i];
          break;
        case "--metadata":
        case "-m":
          try {
            metadata = JSON.parse(args[++i] ?? "{}");
          } catch {
            console.error("Invalid metadata JSON");
            return null;
          }
          break;
        case "--recursive":
        case "-r":
          recursive = true;
          break;
        case "--help":
        case "-h":
          this.printHelp();
          return null;
      }
    }

    if (!bucket || !source) {
      console.error("Error: --bucket and --source are required");
      this.printHelp();
      return null;
    }

    const resolvedSource = resolve(source);
    if (!existsSync(resolvedSource)) {
      console.error(`Error: Source path does not exist: ${resolvedSource}`);
      return null;
    }

    if (!key) {
      const stat = statSync(resolvedSource);
      if (stat.isDirectory()) {
        key = "";
      } else {
        key = basename(resolvedSource);
      }
    }

    return { bucket, source: resolvedSource, key, contentType, metadata, recursive };
  }

  private async uploadSingle(bucket: string, source: string, key: string, contentType?: string, metadata?: Record<string, string>): Promise<void> {
    if (!existsSync(source)) {
      console.error(`File not found: ${source}`);
      return;
    }

    const stat = statSync(source);
    if (stat.isDirectory()) {
      console.error(`Path is a directory. Use --recursive to upload directories.`);
      return;
    }

    console.log(`Uploading: ${source} -> ${bucket}/${key}`);
    await this.client.uploadFile(bucket, key, source, contentType, metadata);
    console.log("Upload complete!");
  }

  private async uploadDirectory(bucket: string, source: string, prefix: string, contentType?: string): Promise<void> {
    const files = this.walkDirectory(source, source);

    if (files.length === 0) {
      console.log("No files found in directory.");
      return;
    }

    console.log(`Found ${files.length} files to upload`);

    let uploaded = 0;
    for (const file of files) {
      const relativePath = relative(source, file).replace(/\\/g, "/");
      const objectKey = prefix ? `${prefix.replace(/\/$/, "")}/${relativePath}` : relativePath;

      try {
        await this.client.uploadFile(bucket, objectKey, file, contentType);
        uploaded++;
      } catch (error) {
        console.error(`Failed to upload ${file}: ${(error as Error).message}`);
      }
    }

    console.log(`\nUpload complete: ${uploaded}/${files.length} files uploaded`);
  }

  private walkDirectory(dir: string, baseDir: string): string[] {
    const results: string[] = [];

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkDirectory(fullPath, baseDir));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }

    return results;
  }

  private printHelp(): void {
    console.log(`
Upload files to an R2 bucket

Usage: r2-tools upload [options]

Options:
  --bucket, -b <name>     Target bucket name (required)
  --source, -s <path>     Local file or directory to upload (required)
  --key, -k <key>         Object key in bucket (default: filename)
  --content-type, -t <t>  Content-Type header
  --metadata, -m <json>   Custom metadata as JSON string
  --recursive, -r         Upload directory recursively
  --help, -h              Show this help

Examples:
  r2-tools upload -b my-bucket -s ./image.png
  r2-tools upload -b my-bucket -s ./data.zip -k archives/data.zip
  r2-tools upload -b my-bucket -s ./dist -r
  r2-tools upload -b my-bucket -s ./file.pdf -t application/pdf -m '{"author":"xk244"}'
`);
  }
}
