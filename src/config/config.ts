import { z } from "zod";
import { readFileSync } from "fs";

export const BypassSchema = z.object({
  path: z.string(),
  isPrefix: z.boolean().default(true),
});

export type Bypass = z.infer<typeof BypassSchema>;

export const BucketConfigSchema = z.object({
  name: z.string(),
  bypass: z.array(BypassSchema).default([]),
});

export type BucketConfig = z.infer<typeof BucketConfigSchema>;

export const ConfigSchema = z.object({
  r2: z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    endpoint: z.string(),
    region: z.string().default("auto"),
  }),
  accountId: z.string().optional(),
  apiToken: z.string().optional(),
  buckets: z.array(BucketConfigSchema).min(1),
  globalBypass: z.array(BypassSchema).default([]),
  dryRun: z.boolean().default(true),
  concurrency: z.number().min(1).max(100).default(10),
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

export function loadConfig(path: string): Config {
  const fileContent = readFileSync(path, "utf-8");
  const data = JSON.parse(fileContent);
  return parseConfig(data);
}
