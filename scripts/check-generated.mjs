import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_ROOT } from "./lib/contract.mjs";
import { buildGeneratedFiles } from "./lib/outputs.mjs";
import { parseJsonStrict } from "./lib/strict-json.mjs";
import { validateSourceRevisionProvenance } from "./lib/provenance.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function listFiles(root) {
  const files = [];
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(repoRoot, path));
    }
  };
  await visit(root);
  return files;
}

try {
  const manifestPath = resolve(repoRoot, "dist/manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = parseJsonStrict(manifestText, "dist/manifest.json");
  const sourceRevision = await validateSourceRevisionProvenance(repoRoot, manifest.sourceRevision);
  const expected = await buildGeneratedFiles(repoRoot, sourceRevision);
  const problems = [];
  for (const [relativePath, expectedContent] of expected) {
    try {
      const actual = await readFile(resolve(repoRoot, relativePath), "utf8");
      if (actual !== expectedContent) problems.push(`${relativePath}: content differs from generated output`);
    } catch (error) {
      if (error.code === "ENOENT") problems.push(`${relativePath}: missing`);
      else throw error;
    }
  }
  const generatedRoots = [
    resolve(repoRoot, "dist"),
    resolve(repoRoot, VENDOR_ROOT),
    resolve(repoRoot, "docs/reference"),
  ];
  const actualFiles = (await Promise.all(generatedRoots.map(listFiles))).flat();
  for (const actualFile of actualFiles) {
    if (!expected.has(actualFile)) problems.push(`${actualFile}: unexpected generated artifact`);
  }
  if (problems.length) throw new Error(`generated output is stale:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.stdout.write(`Verified ${expected.size} generated files at ${manifest.sourceRevision}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
