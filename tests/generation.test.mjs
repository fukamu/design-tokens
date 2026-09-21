import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildGeneratedFiles } from "../scripts/lib/outputs.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRevision = "d7d7055c3fa5b1c2ca5639d2e1233510cc8954aa";

const sha256 = (content) => createHash("sha256").update(content, "utf8").digest("hex");

test("generation is deterministic and embeds only the explicit source revision", async () => {
  const first = await buildGeneratedFiles(repoRoot, sourceRevision);
  const second = await buildGeneratedFiles(repoRoot, sourceRevision);
  assert.deepEqual([...first], [...second]);
  assert.equal(first.size, 17);
  for (const content of first.values()) assert.match(content, new RegExp(sourceRevision, "u"));
  await assert.rejects(buildGeneratedFiles(repoRoot, "HEAD"), /40-character hexadecimal Git commit SHA/u);
});

test("CSS exposes private primitives and public aliases without global styling", async () => {
  const files = await buildGeneratedFiles(repoRoot, sourceRevision);
  const css = files.get("dist/css/tokens.css");
  assert.ok(css.startsWith(`/* Generated from tokens/fukamu.tokens.json. DO NOT EDIT. */\n/* Contract version: 0.1.0 */\n/* Canonical source revision: ${sourceRevision} */\n`));
  assert.doesNotMatch(css, /\/\*\/\*/u);
  assert.match(css, /--fukamu-primitive-color-slate-900: #10233F;/u);
  assert.match(css, /--fukamu-color-text-primary: var\(--fukamu-primitive-color-slate-900\);/u);
  assert.match(css, /--fukamu-motion-duration-short: var\(--fukamu-primitive-duration-short\);/u);
  assert.equal([...css.matchAll(/^\s+--fukamu-/gmu)].length, 89);
  assert.equal([...css.matchAll(/^:root \{/gmu)].length, 1);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|html|\*)\s*\{/u);
  assert.doesNotMatch(css, /--fukamu-(?:shadow|dark)/u);
});

test("resolved JSON, manifest hashes, and public JavaScript contract agree", async () => {
  const files = await buildGeneratedFiles(repoRoot, sourceRevision);
  const resolved = JSON.parse(files.get("dist/json/tokens.json"));
  assert.equal(Object.keys(resolved.tokens).length, 46);
  assert.equal(resolved.tokens["color.text.primary"].cssValue, "#10233F");
  assert.equal(resolved.tokens["color.text.primary"].sourcePath, "primitive.color.slate-900");
  const manifest = JSON.parse(files.get("dist/manifest.json"));
  assert.equal(manifest.sourceRevision, sourceRevision);
  assert.equal(manifest.artifacts.length, 7);
  for (const artifact of manifest.artifacts) {
    assert.equal(artifact.sha256, sha256(files.get(`dist/${artifact.path}`)), artifact.path);
    assert.equal(files.get(`dist/${artifact.path}`), files.get(`vendor/fukamu-design-tokens/0.1.0/${artifact.path}`));
  }
  assert.equal(files.get("dist/manifest.json"), files.get("vendor/fukamu-design-tokens/0.1.0/manifest.json"));
});

test("Figma mapping preserves all aliases and approved lossy boundaries", async () => {
  const files = await buildGeneratedFiles(repoRoot, sourceRevision);
  const mapping = JSON.parse(files.get("dist/figma/mapping.json"));
  assert.deepEqual(mapping.collections.map(({ name, mode, variableCount }) => [name, mode, variableCount]), [
    ["Primitives", "Value", 43],
    ["Color", "Light", 20],
    ["Typography", "Value", 11],
    ["Spacing", "Value", 7],
    ["Radius", "Value", 5],
    ["Border", "Value", 1],
    ["Interaction", "Value", 1],
    ["Motion", "Value", 1],
  ]);
  assert.equal(mapping.variables.length, 89);
  assert.equal(mapping.counts.primitiveColors, 18);
  assert.equal(mapping.counts.publicVariables, 46);
  assert.ok(mapping.variables.every((variable) => variable.codeSyntax.WEB === `var(--fukamu-${variable.tokenPath.replaceAll(".", "-")})`));
  const byPath = new Map(mapping.variables.map((variable) => [variable.tokenPath, variable]));
  assert.equal(byPath.get("primitive.font-family.ja-sans").value, "Noto Sans JP");
  assert.equal(byPath.get("primitive.line-height.ui").value, 145);
  assert.equal(byPath.get("primitive.line-height.body-ja").value, 170);
  assert.equal(byPath.get("primitive.duration.short").figmaType, "TIMING");
  assert.equal(byPath.get("primitive.duration.short").value, 0.16);
  assert.deepEqual(byPath.get("motion.duration.short").scopes, []);
  assert.equal(byPath.get("motion.duration.short").value.tokenPath, "primitive.duration.short");
  assert.deepEqual(byPath.get("color.text.primary").scopes, ["TEXT_FILL"]);
  assert.deepEqual(byPath.get("color.surface.default").scopes, ["FRAME_FILL", "SHAPE_FILL"]);
  assert.deepEqual(byPath.get("color.focus.ring").scopes, ["STROKE_COLOR"]);
  assert.equal(mapping.variables.some((variable) => variable.scopes.includes("EFFECT_COLOR")), false);
  assert.equal(mapping.textStyleCandidates.length, 7);
  assert.equal(mapping.textStyles.length, 5);
  assert.deepEqual(mapping.textStyleCandidates.filter((style) => style.status === "unsupported").map((style) => style.name), [
    "Text/UI Small/Semibold",
    "Text/Body/Semibold",
  ]);
  assert.equal(mapping.effectStyles.length, 0);
  assert.equal(mapping.components.length, 0);
});
