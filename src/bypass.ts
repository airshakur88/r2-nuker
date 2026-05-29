import { Bypass, BucketConfig } from "./config.js";

export class BypassChecker {
  private globalBypass: Bypass[];
  private bucketBypass: Bypass[];

  constructor(globalBypass: Bypass[], bucketBypass: Bypass[]) {
    this.globalBypass = globalBypass;
    this.bucketBypass = bucketBypass;
  }

  shouldBypass(key: string): boolean {
    const allBypass = [...this.bucketBypass, ...this.globalBypass];

    for (const bypass of allBypass) {
      if (bypass.isPrefix) {
        if (key.startsWith(bypass.path)) {
          return true;
        }
      } else {
        if (key === bypass.path) {
          return true;
        }
      }
    }

    return false;
  }

  filterBypassed<T extends { key: string }>(items: T[]): {
    bypassed: T[];
    toDelete: T[];
  } {
    const bypassed: T[] = [];
    const toDelete: T[] = [];

    for (const item of items) {
      if (this.shouldBypass(item.key)) {
        bypassed.push(item);
      } else {
        toDelete.push(item);
      }
    }

    return { bypassed, toDelete };
  }
}