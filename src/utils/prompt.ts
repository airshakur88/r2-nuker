import * as readline from "readline";

export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export async function confirmDestructive(action: string, target: string): Promise<boolean> {
  console.log(`\n⚠️  WARNING: You are about to ${action}: ${target}`);
  console.log("This action cannot be undone!");
  return confirm("Are you sure?");
}
