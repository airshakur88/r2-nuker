export function createProgressBar(total: number, width: number = 30): (current: number) => string {
  return (current: number): string => {
    const ratio = Math.min(current / total, 1);
    const filled = Math.round(ratio * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);
    const percent = (ratio * 100).toFixed(1);
    return `[${bar}] ${percent}% (${current}/${total})`;
  };
}

export async function withProgress<T>(
  items: T[],
  handler: (item: T, index: number) => Promise<void>,
  label: string = "Processing"
): Promise<void> {
  const total = items.length;
  const progressBar = createProgressBar(total);
  let current = 0;

  process.stdout.write(`\r${label}: ${progressBar(current)}`);

  for (let i = 0; i < items.length; i++) {
    await handler(items[i]!, i);
    current++;
    process.stdout.write(`\r${label}: ${progressBar(current)}`);
  }

  process.stdout.write("\n");
}

export async function withBatchProgress<T>(
  items: T[],
  batchSize: number,
  handler: (batch: T[], batchIndex: number) => Promise<number>,
  label: string = "Processing"
): Promise<number> {
  const total = items.length;
  const progressBar = createProgressBar(total);
  let processed = 0;

  process.stdout.write(`\r${label}: ${progressBar(processed)}`);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const count = await handler(batch, Math.floor(i / batchSize));
    processed += count;
    process.stdout.write(`\r${label}: ${progressBar(processed)}`);
  }

  process.stdout.write("\n");
  return processed;
}
