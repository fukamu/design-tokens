import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TOKEN_SOURCE,
  compareCodePoints,
  cssVariableForPath,
  loadContract,
  publicTokens,
  toCssValue,
} from "../scripts/lib/contract.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("canonical contract has one literal primitive source for every public token", async () => {
  const { tokens } = await loadContract(resolve(repoRoot, TOKEN_SOURCE));
  const primitives = tokens.filter((token) => token.primitive);
  const publicContract = publicTokens(tokens);
  assert.equal(primitives.length, 43);
  assert.equal(publicContract.length, 46);
  for (const token of publicContract) {
    assert.ok(token.alias, `${token.path} must be an alias`);
    assert.match(token.sourcePath, /^primitive\./u, `${token.path} must resolve to a primitive`);
  }
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  assert.equal(toCssValue(byPath.get("color.text.primary")), "#10233F");
  assert.equal(toCssValue(byPath.get("color.action.primary")), "#0D3B8E");
  assert.equal(toCssValue(byPath.get("font.size.small")), "0.875rem");
  assert.equal(toCssValue(byPath.get("spacing.8")), "2rem");
  assert.equal(toCssValue(byPath.get("radius.pill")), "9999px");
  assert.equal(toCssValue(byPath.get("motion.duration.short")), "160ms");
  assert.deepEqual(byPath.get("font.family.body.ja").value.slice(-2), ["system-ui", "sans-serif"]);
  assert.equal(cssVariableForPath("color.text.primary"), "--fukamu-color-text-primary");
  assert.equal(cssVariableForPath("primitive.color.slate-900"), "--fukamu-primitive-color-slate-900");
  assert.equal(tokens.some((token) => token.path.includes("shadow") || token.path.includes("dark")), false);
  assert.deepEqual(Object.fromEntries(publicContract.map((token) => [token.path, toCssValue(token)])), {
    "border.width.default": "1px",
    "color.accent": "#4A90E2",
    "color.action.on-primary": "#FFFFFF",
    "color.action.primary": "#0D3B8E",
    "color.action.primary-hover": "#082B69",
    "color.border.default": "#CCDAEC",
    "color.border.strong": "#9EBCE1",
    "color.focus.ring": "#4A90E2",
    "color.status.danger.border": "#F2BAC4",
    "color.status.danger.foreground": "#B4233A",
    "color.status.danger.strong": "#85172A",
    "color.status.danger.surface": "#FFF0F3",
    "color.status.success.foreground": "#075D55",
    "color.status.success.surface": "#D9F3EF",
    "color.status.warning.border": "#EAD99E",
    "color.status.warning.foreground": "#71510A",
    "color.status.warning.surface": "#FFF7DB",
    "color.surface.default": "#FFFFFF",
    "color.surface.subtle": "#EDF6FF",
    "color.text.primary": "#10233F",
    "color.text.secondary": "#52657F",
    "font.family.body.ja": '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", "Noto Sans CJK JP", system-ui, sans-serif',
    "font.line-height.body.ja": "1.7",
    "font.line-height.editor": "1.75",
    "font.line-height.ui": "1.45",
    "font.size.body": "1rem",
    "font.size.editor": "1rem",
    "font.size.small": "0.875rem",
    "font.weight.bold": "700",
    "font.weight.medium": "500",
    "font.weight.regular": "400",
    "font.weight.semibold": "600",
    "interaction.target.min": "2.75rem",
    "motion.duration.short": "160ms",
    "radius.lg": "0.75rem",
    "radius.md": "0.625rem",
    "radius.pill": "9999px",
    "radius.sm": "0.5rem",
    "radius.xl": "1rem",
    "spacing.1": "0.25rem",
    "spacing.2": "0.5rem",
    "spacing.3": "0.75rem",
    "spacing.4": "1rem",
    "spacing.5": "1.25rem",
    "spacing.6": "1.5rem",
    "spacing.8": "2rem",
  });
});

const invalidExpectations = new Map([
  ["alias-cycle.tokens.json", /alias cycle detected/u],
  ["css-name-collision.tokens.json", /CSS name .* collides/u],
  ["duplicate-key.tokens.json", /duplicate object key/u],
  ["invalid-color.tokens.json", /color components/u],
  ["invalid-group-description.tokens.json", /\$description must be a non-empty string/u],
  ["invalid-unit.tokens.json", /unit 'em' is not allowed/u],
  ["non-json-whitespace.tokens.json", /expected a string/u],
  ["primitive-public-css-collision.tokens.json", /CSS name .* collides/u],
  ["prototype-description.tokens.json", /\$description must be a non-empty string/u],
  ["public-literal.tokens.json", /public tokens must be aliases/u],
  ["type-mismatch.tokens.json", /alias type .* does not match/u],
  ["unresolved-alias.tokens.json", /unresolved alias target/u],
]);

test("negative fixtures are rejected with their intended invariant", async (context) => {
  const fixtureRoot = resolve(repoRoot, "tests/fixtures/invalid");
  const files = (await readdir(fixtureRoot)).sort();
  assert.deepEqual(files, [...invalidExpectations.keys()].sort());
  for (const file of files) {
    await context.test(file, async () => {
      await assert.rejects(loadContract(resolve(fixtureRoot, file)), invalidExpectations.get(file));
    });
  }
});

test("a public alias chain is accepted only when it terminates at a primitive", async () => {
  const fixture = resolve(repoRoot, "tests/fixtures/valid/public-alias-chain.tokens.json");
  const { tokens } = await loadContract(fixture);
  const derived = tokens.find((token) => token.path === "derived");
  assert.equal(derived.sourcePath, "primitive.value");
  assert.equal(derived.value, 1);
});

test("font-family output safely escapes backslashes, quotes, and controls", async () => {
  const fixture = resolve(repoRoot, "tests/fixtures/valid/font-family-escaping.tokens.json");
  const { tokens } = await loadContract(fixture);
  const family = tokens.find((token) => token.path === "family");
  const css = toCssValue(family);
  assert.equal(css.includes("\n"), false);
  assert.match(css, /"Evil\\\\\\"; color: red; \/\*"/u);
  assert.match(css, /"Line\\A Break"/u);
});

test("token ordering is code-point based and independent of process locale", () => {
  assert.deepEqual(["ab", "aa", "z"].sort(compareCodePoints), ["aa", "ab", "z"]);
  const values = ["aa", "ab"];
  assert.deepEqual([...values].sort(new Intl.Collator("en-US").compare), ["aa", "ab"]);
  assert.deepEqual([...values].sort(new Intl.Collator("da-DK").compare), ["ab", "aa"]);
  assert.deepEqual([...values].sort(compareCodePoints), ["aa", "ab"]);
});
