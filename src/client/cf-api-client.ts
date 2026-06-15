import type { Config } from "../config/config.js";
import type { CustomDomain, BucketToken } from "../types.js";

export class CfApiClient {
  private accountId?: string;
  private apiToken?: string;
  private baseUrl: string;

  constructor(config: Config) {
    this.accountId = config.accountId;
    this.apiToken = config.apiToken;
    this.baseUrl = "https://api.cloudflare.com/client/v4";
  }

  isAvailable(): boolean {
    return !!(this.accountId && this.apiToken);
  }

  requireAvailable(): void {
    if (!this.isAvailable()) {
      console.error("This command requires accountId and apiToken in your config.");
      console.error("Add them to your config.json:");
      console.error(JSON.stringify({ accountId: "your-account-id", apiToken: "your-cloudflare-api-token" }, null, 2));
      process.exit(1);
    }
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const data = await response.json() as any;

    if (!data.success) {
      const errors = data.errors?.map((e: any) => e.message).join(", ") ?? "Unknown error";
      throw new Error(`Cloudflare API error: ${errors}`);
    }

    return data.result;
  }

  async listCustomDomains(bucket: string): Promise<CustomDomain[]> {
    this.requireAvailable();
    const result = await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/domains/custom`);
    return (result.domains ?? []).map((d: any) => ({
      domain: d.domain,
      enabled: d.enabled,
      zoneId: d.zoneId,
      zoneName: d.zoneName,
      status: d.status,
    }));
  }

  async addCustomDomain(bucket: string, domain: string, zoneId?: string, minTls?: string): Promise<CustomDomain> {
    this.requireAvailable();
    const body: any = { domain, zoneId, minTls };
    const result = await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/domains/custom`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return result;
  }

  async removeCustomDomain(bucket: string, domain: string): Promise<void> {
    this.requireAvailable();
    await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/domains/custom/${domain}`, {
      method: "DELETE",
    });
  }

  async enableDevUrl(bucket: string): Promise<any> {
    this.requireAvailable();
    const result = await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/domains/managed`, {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    return result;
  }

  async disableDevUrl(bucket: string): Promise<void> {
    this.requireAvailable();
    await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/domains/managed`, {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
    });
  }

  async getDevUrl(bucket: string): Promise<any> {
    this.requireAvailable();
    return this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/domains/managed`);
  }

  async listBucketTokens(bucket: string): Promise<BucketToken[]> {
    this.requireAvailable();
    const result = await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/tokens`);
    return result ?? [];
  }

  async createBucketToken(bucket: string, name: string, permissions: string[], ttl?: number): Promise<BucketToken> {
    this.requireAvailable();
    const body: any = { name, permissions, ttl };
    const result = await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/tokens`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return result;
  }

  async deleteBucketToken(bucket: string, tokenId: string): Promise<void> {
    this.requireAvailable();
    await this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}/tokens/${tokenId}`, {
      method: "DELETE",
    });
  }

  async getBucketAnalytics(bucket: string, since: string = "-24h"): Promise<any> {
    this.requireAvailable();
    const query = `{
      viewer {
        accounts(filter: {accountTag: "${this.accountId}"}) {
          r2StorageAdaptiveGroups(filter: {bucketName: "${bucket}", date_ge: "${since}"}, limit: 10) {
            sum {
              objectCount
              payloadSize
              uploadCount
              deleteCount
            }
            dimensions {
              bucketName
              date
            }
          }
        }
      }
    }`;

    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json() as any;
    return data.data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups ?? [];
  }

  async getBucketInfo(bucket: string): Promise<any> {
    this.requireAvailable();
    return this.request(`/accounts/${this.accountId}/r2/buckets/${bucket}`);
  }
}
