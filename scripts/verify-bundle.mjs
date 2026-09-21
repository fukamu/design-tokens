import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_VERSION, PACKAGE_NAME, VENDOR_ROOT } from "./lib/contract.mjs";
import { SOURCE_REVISION_PATTERN, manifestPayloadPaths } from "./lib/outputs.mjs";
import { parseJsonStrict } from "./lib/strict-json.mjs";
import { validateSourceRevisionProvenance } from "./lib/provenance.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (content) => createHash("sha256").update(content).digest("hex");

try {
  const distManifestText = await readFile(resolve(repoRoot, "dist/manifest.json"), "utf8");
  const vendorManifestText = await readFile(resolve(repoRoot, VENDOR_ROOT, "manifest.json"), "utf8");
  if (distManifestText !== vendorManifestText) throw new Error("dist and vendor manifests differ");
  const manifest = parseJsonStrict(distManifestText, "dist/manifest.json");
  if (manifest.packageName !== PACKAGE_NAME || manifest.contractVersion !== CONTRACT_VERSION) {
    throw new Error("bundle manifest package identity is invalid");
  }
  if (!SOURCE_REVISION_PATTERN.test(manifest.sourceRevision)) throw new Error("bundle source revision is not a full Git SHA");
  await validateSourceRevisionProvenance(repoRoot, manifest.sourceRevision);
  const expectedPaths = manifestPayloadPaths();
  const actualPaths = manifest.artifacts.map((artifact) => artifact.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("bundle manifest artifact list is incomplete or out of order");
  }
  for (const artifact of manifest.artifacts) {
    if (artifact.path.startsWith("/") || artifact.path.split("/").includes("..")) {
      throw new Error(`unsafe artifact path '${artifact.path}'`);
    }
    const dist = await readFile(resolve(repoRoot, "dist", artifact.path));
    const vendor = await readFile(resolve(repoRoot, VENDOR_ROOT, artifact.path));
    if (!dist.equals(vendor)) throw new Error(`${artifact.path}: dist and vendor bytes differ`);
    if (sha256(dist) !== artifact.sha256) throw new Error(`${artifact.path}: SHA-256 mismatch`);
  }
  process.stdout.write(`Verified ${manifest.artifacts.length} bundle artifacts for ${manifest.sourceRevision}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
