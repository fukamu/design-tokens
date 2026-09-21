import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKEN_SOURCE, loadContract, publicTokens } from "./lib/contract.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const { tokens } = await loadContract(resolve(repoRoot, TOKEN_SOURCE));
  process.stdout.write(`Validated ${tokens.length} tokens (${publicTokens(tokens).length} public)\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
