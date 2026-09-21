import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_cache: join(temporaryRoot, "npm-cache"),
        npm_config_fund: "false",
        npm_config_update_notifier: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stdout}${stderr}`));
    });
  });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "fukamu-design-tokens-smoke-"));
try {
  const packDirectory = join(temporaryRoot, "pack");
  const consumerDirectory = join(temporaryRoot, "consumer");
  await mkdir(packDirectory, { recursive: true });
  await mkdir(consumerDirectory, { recursive: true });
  await run("npm", ["pack", "--ignore-scripts", "--pack-destination", packDirectory], repoRoot);
  const tarballs = (await readdir(packDirectory)).filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1) throw new Error(`npm pack produced ${tarballs.length} tarballs instead of one`);
  const requiredFiles = [
    "dist/css/tokens.css",
    "dist/figma/mapping.json",
    "dist/js/index.cjs",
    "dist/js/index.mjs",
    "dist/json/tokens.json",
    "dist/manifest.json",
    "dist/reference/tokens.md",
    "dist/types/index.d.ts",
    "tokens/fukamu.tokens.json",
  ];
  await writeFile(join(consumerDirectory, "package.json"), JSON.stringify({ name: "design-token-smoke-consumer", private: true, type: "module" }, null, 2));
  const tarball = join(packDirectory, tarballs[0]);
  await run("npm", ["install", "--ignore-scripts", "--no-package-lock", tarball], consumerDirectory);
  const installedRoot = join(consumerDirectory, "node_modules/@fukamu/design-tokens");
  for (const required of requiredFiles) await readFile(join(installedRoot, required));
  const probe = `
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import { dirname, join } from "node:path";
    import { createRequire } from "node:module";
    import tokensDefault, { contractVersion, sourceRevision, tokens } from "@fukamu/design-tokens";
    const require = createRequire(import.meta.url);
    const commonJs = require("@fukamu/design-tokens");
    assert.equal(contractVersion, "0.1.0");
    assert.match(sourceRevision, /^[0-9a-f]{40}$/);
    assert.equal(tokensDefault, tokens);
    assert.equal(tokens["color.text.primary"].cssValue, "#10233F");
    assert.equal(commonJs.tokens["spacing.4"].cssValue, "1rem");
    const css = await readFile(require.resolve("@fukamu/design-tokens/css"), "utf8");
    assert.match(css, /--fukamu-primitive-color-slate-900: #10233F;/);
    assert.match(css, /--fukamu-color-text-primary: var\\(--fukamu-primitive-color-slate-900\\);/);
    const resolved = JSON.parse(await readFile(require.resolve("@fukamu/design-tokens/tokens.json"), "utf8"));
    assert.equal(resolved.sourceRevision, sourceRevision);
    const manifest = JSON.parse(await readFile(require.resolve("@fukamu/design-tokens/manifest.json"), "utf8"));
    assert.equal(manifest.sourceRevision, sourceRevision);
    const figma = JSON.parse(await readFile(require.resolve("@fukamu/design-tokens/figma-mapping.json"), "utf8"));
    assert.equal(figma.remBasePx, 16);
    const reference = await readFile(require.resolve("@fukamu/design-tokens/reference"), "utf8");
    assert.match(reference, /# FUKAMU design tokens 0\.1\.0/);
    const packagePath = require.resolve("@fukamu/design-tokens/package.json");
    const declaration = await readFile(join(dirname(packagePath), "dist/types/index.d.ts"), "utf8");
    assert.match(declaration, /export type TokenPath/);
    assert.match(declaration, /--fukamu-/);
  `;
  await writeFile(join(consumerDirectory, "probe.mjs"), probe, "utf8");
  await run("node", ["probe.mjs"], consumerDirectory);
  const packageManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  if (packageManifest.types !== "./dist/types/index.d.ts") throw new Error("package types entry is not consumable");
  process.stdout.write(`Packed and consumed ${tarballs[0]} (${requiredFiles.length} required files checked)\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
