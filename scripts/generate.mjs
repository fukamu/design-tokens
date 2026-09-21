import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceRevisionFromArgs } from "./lib/cli.mjs";
import { buildGeneratedFiles } from "./lib/outputs.mjs";
import { validateSourceRevisionProvenance } from "./lib/provenance.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const sourceRevision = sourceRevisionFromArgs();
  const validatedRevision = await validateSourceRevisionProvenance(repoRoot, sourceRevision);
  const files = await buildGeneratedFiles(repoRoot, validatedRevision);
  for (const [relativePath, content] of files) {
    const absolutePath = resolve(repoRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  process.stdout.write(`Generated ${files.size} files for source revision ${validatedRevision}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
