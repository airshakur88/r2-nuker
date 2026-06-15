export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDate(date: Date | string | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]!);
  const unit = (match[2] || "B").toUpperCase();
  const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
  return value * (multipliers[unit] ?? 1);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function parseOlderThan(value: string): number {
  const match = value.match(/^(\d+)(d|h|m)?$/i);
  if (!match) return 0;
  const num = parseInt(match[1]!, 10);
  const unit = (match[2] || "d").toLowerCase();
  switch (unit) {
    case "d": return num * 24 * 60 * 60 * 1000;
    case "h": return num * 60 * 60 * 1000;
    case "m": return num * 60 * 1000;
    default: return num * 24 * 60 * 60 * 1000;
  }
}
