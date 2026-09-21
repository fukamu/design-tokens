import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  PACKAGE_NAME,
  TOKEN_SOURCE,
  VENDOR_ROOT,
  compareCodePoints,
  cssVariableForPath,
  loadContract,
  publicTokens,
  toCssValue,
} from "./contract.mjs";
import { parseJsonStrict } from "./strict-json.mjs";

export const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/u;

const GENERATED_HEADER = (sourceRevision, marker = "//") => [
  `${marker} Generated from ${TOKEN_SOURCE}. DO NOT EDIT.`,
  `${marker} Contract version: ${CONTRACT_VERSION}`,
  `${marker} Canonical source revision: ${sourceRevision}`,
].join("\n");

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (content) => createHash("sha256").update(content, "utf8").digest("hex");

function serializableToken(token) {
  return {
    type: token.type,
    value: token.value,
    cssValue: toCssValue(token),
    cssVariable: cssVariableForPath(token.path),
    description: token.description,
    sourcePath: token.sourcePath,
  };
}

function generateCss(allTokens, sourceRevision) {
  const primitiveDeclarations = allTokens
    .filter((token) => token.primitive)
    .map((token) => `  ${cssVariableForPath(token.path)}: ${toCssValue(token)};`)
    .join("\n");
  const publicDeclarations = publicTokens(allTokens)
    .map((token) => `  ${cssVariableForPath(token.path)}: var(${cssVariableForPath(token.sourcePath)});`)
    .join("\n");
  const header = [
    `/* Generated from ${TOKEN_SOURCE}. DO NOT EDIT. */`,
    `/* Contract version: ${CONTRACT_VERSION} */`,
    `/* Canonical source revision: ${sourceRevision} */`,
  ].join("\n");
  return `${header}\n:root {\n  /* Private implementation primitives. Use public aliases below. */\n${primitiveDeclarations}\n\n  /* Public contract. */\n${publicDeclarations}\n}\n`;
}

function generateJavaScript(tokens, sourceRevision, commonJs = false) {
  const tokenObject = Object.fromEntries(tokens.map((token) => [token.path, serializableToken(token)]));
  const serialized = JSON.stringify(tokenObject, null, 2);
  if (commonJs) {
    return `${GENERATED_HEADER(sourceRevision)}\n"use strict";\n\nconst contractVersion = ${JSON.stringify(CONTRACT_VERSION)};\nconst sourceRevision = ${JSON.stringify(sourceRevision)};\nconst tokens = Object.freeze(${serialized});\n\nmodule.exports = Object.freeze({ contractVersion, sourceRevision, tokens });\n`;
  }
  return `${GENERATED_HEADER(sourceRevision)}\nexport const contractVersion = ${JSON.stringify(CONTRACT_VERSION)};\nexport const sourceRevision = ${JSON.stringify(sourceRevision)};\nexport const tokens = Object.freeze(${serialized});\nexport default tokens;\n`;
}

function generateTypes(tokens, sourceRevision) {
  const tokenPaths = tokens.map((token) => JSON.stringify(token.path)).join(" |\n  ");
  const tokenTypes = [...new Set(tokens.map((token) => token.type))].sort().map(JSON.stringify).join(" | ");
  return `${GENERATED_HEADER(sourceRevision)}\nexport type TokenPath =\n  ${tokenPaths};\n\nexport type TokenType = ${tokenTypes};\n\nexport interface ColorValue {\n  readonly colorSpace: "srgb";\n  readonly components: readonly [number, number, number];\n  readonly alpha: number;\n}\n\nexport interface NumericValue {\n  readonly value: number;\n  readonly unit: "px" | "rem" | "ms" | "s";\n}\n\nexport interface ResolvedToken {\n  readonly type: TokenType;\n  readonly value: string | number | readonly string[] | ColorValue | NumericValue;\n  readonly cssValue: string;\n  readonly cssVariable: \`--fukamu-\${string}\`;\n  readonly description: string;\n  readonly sourcePath: string;\n}\n\nexport declare const contractVersion: ${JSON.stringify(CONTRACT_VERSION)};\nexport declare const sourceRevision: string;\nexport declare const tokens: Readonly<Record<TokenPath, Readonly<ResolvedToken>>>;\nexport default tokens;\n`;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function generateReference(allTokens, sourceRevision) {
  const publicRows = publicTokens(allTokens).map((token) =>
    `| \`${token.path}\` | \`${token.type}\` | \`${toCssValue(token)}\` | \`${cssVariableForPath(token.path)}\` | \`${token.sourcePath}\` | ${escapeMarkdown(token.description)} |`
  );
  const primitiveRows = allTokens.filter((token) => token.primitive).map((token) =>
    `| \`${token.path}\` | \`${token.type}\` | \`${toCssValue(token)}\` | ${escapeMarkdown(token.description)} |`
  );
  return `<!-- Generated from ${TOKEN_SOURCE}. DO NOT EDIT. -->\n# FUKAMU design tokens ${CONTRACT_VERSION}\n\n- Canonical source revision: \`${sourceRevision}\`\n- Mode: Light\n- CSS scope: \`:root\`\n\n## Public contract\n\n| Token path | Type | Resolved value | CSS custom property | Primitive source | Description |\n|---|---|---|---|---|---|\n${publicRows.join("\n")}\n\n## Private primitives\n\nPrimitives are implementation details. Consumers should use public paths.\n\n| Token path | Type | Value | Description |\n|---|---|---|---|\n${primitiveRows.join("\n")}\n`;
}

function figmaValue(token) {
  if (token.type === "dimension") {
    return token.value.unit === "rem" ? token.value.value * 16 : token.value.value;
  }
  if (token.type === "duration") return token.value.unit === "ms" ? token.value.value / 1000 : token.value.value;
  if (token.type === "color") return toCssValue(token);
  if (token.type === "fontFamily") return "Noto Sans JP";
  if (token.type === "number" && token.path.startsWith("primitive.line-height.")) return token.value * 100;
  return token.value;
}

function figmaUnit(token) {
  if (token.type === "dimension") return "px";
  if (token.type === "duration") return "seconds";
  if (token.path.includes("line-height")) return "percent";
  return null;
}

function figmaScopes(token) {
  if (token.type === "color") {
    if (token.path.startsWith("color.text.")) return ["TEXT_FILL"];
    if (token.path.startsWith("color.surface.")) return ["FRAME_FILL", "SHAPE_FILL"];
    if (token.path.startsWith("color.border.") || token.path.startsWith("color.focus.")) return ["STROKE_COLOR"];
    if (token.path === "color.accent") return ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"];
    if (token.path === "color.action.on-primary") return ["TEXT_FILL", "SHAPE_FILL"];
    if (token.path.startsWith("color.action.")) return ["FRAME_FILL", "SHAPE_FILL"];
    if (token.path.endsWith(".surface")) return ["FRAME_FILL", "SHAPE_FILL"];
    if (token.path.endsWith(".border")) return ["STROKE_COLOR"];
    if (token.path.endsWith(".foreground") || token.path.endsWith(".strong")) {
      return ["TEXT_FILL", "SHAPE_FILL", "STROKE_COLOR"];
    }
    throw new Error(`${token.path}: missing semantic Figma color scope`);
  }
  if (token.type === "fontFamily") return ["FONT_FAMILY"];
  if (token.type === "fontWeight") return ["FONT_WEIGHT"];
  if (token.type === "duration") return [];
  if (token.path.startsWith("font.size.")) return ["FONT_SIZE"];
  if (token.path.startsWith("font.line-height.")) return [];
  if (token.path.startsWith("spacing.")) return ["GAP"];
  if (token.path.startsWith("radius.")) return ["CORNER_RADIUS"];
  if (token.path.startsWith("border.width.")) return ["STROKE_FLOAT"];
  if (token.path.startsWith("interaction.target.")) return ["WIDTH_HEIGHT"];
  throw new Error(`${token.path}: missing Figma variable scope`);
}

function figmaScopeProjection(token, scopes) {
  if (token.type === "duration") {
    return { scopePolicy: "figma-native" };
  }
  const projection = { scopePolicy: "explicit", scopes };
  if (token.path.startsWith("primitive.line-height.") || token.path.startsWith("font.line-height.")) {
    projection.bindingPolicy = "reference-only";
  }
  return projection;
}

function figmaType(token) {
  if (token.type === "color") return "COLOR";
  if (token.type === "fontFamily") return "STRING";
  if (token.type === "duration") return "TIMING";
  return "FLOAT";
}

function figmaCollection(token) {
  if (token.primitive) return { name: "Primitives", mode: "Value" };
  if (token.path.startsWith("color.")) return { name: "Color", mode: "Light" };
  if (token.path.startsWith("font.")) return { name: "Typography", mode: "Value" };
  if (token.path.startsWith("spacing.")) return { name: "Spacing", mode: "Value" };
  if (token.path.startsWith("radius.")) return { name: "Radius", mode: "Value" };
  if (token.path.startsWith("border.")) return { name: "Border", mode: "Value" };
  if (token.path.startsWith("interaction.")) return { name: "Interaction", mode: "Value" };
  if (token.path.startsWith("motion.")) return { name: "Motion", mode: "Value" };
  throw new Error(`${token.path}: no Figma collection mapping`);
}

function generateFigmaMapping(allTokens, sourceRevision) {
  const tokens = publicTokens(allTokens);
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  const primitiveVariables = allTokens
    .filter((token) => token.primitive)
    .map((token) => {
      const target = figmaCollection(token);
      return {
        tokenPath: token.path,
        figmaName: token.path.replaceAll(".", "/"),
        collection: target.name,
        mode: target.mode,
        figmaType: figmaType(token),
        ...figmaScopeProjection(token, []),
        codeSyntax: { WEB: `var(${cssVariableForPath(token.path)})` },
        value: figmaValue(token),
        sourceValue: token.value,
        unit: figmaUnit(token),
        description: token.description,
      };
    });
  const primitiveByPath = new Map(primitiveVariables.map((token) => [token.tokenPath, token]));
  const publicVariables = tokens.map((token) => {
    const target = figmaCollection(token);
    const primitiveTarget = primitiveByPath.get(token.sourcePath);
    if (!primitiveTarget) throw new Error(`${token.path}: missing Figma primitive alias target '${token.sourcePath}'`);
    return {
      tokenPath: token.path,
      figmaName: token.path.replaceAll(".", "/"),
      collection: target.name,
      mode: target.mode,
      figmaType: figmaType(token),
      ...figmaScopeProjection(token, figmaScopes(token)),
      codeSyntax: { WEB: `var(${cssVariableForPath(token.path)})` },
      value: {
        kind: "VARIABLE_ALIAS",
        tokenPath: token.sourcePath,
        figmaName: primitiveTarget.figmaName,
      },
      unit: figmaUnit(token),
      description: token.description,
    };
  });
  const variables = [...primitiveVariables, ...publicVariables];
  const px = (dimensionPath) => {
    const token = byPath.get(dimensionPath);
    return token.value.unit === "rem" ? token.value.value * 16 : token.value.value;
  };
  const supportedTextStyles = [
    {
      name: "Text/UI Small/Regular",
      status: "supported",
      fontFamily: "Noto Sans JP",
      fontStyle: "Regular",
      requestedWeight: 400,
      fontSizePx: px("font.size.small"),
      lineHeight: { unit: "PERCENT", value: byPath.get("font.line-height.ui").value * 100 },
      lineHeightApplication: "DIRECT_PERCENT",
      tokenPaths: ["font.family.body.ja", "font.size.small", "font.weight.regular", "font.line-height.ui"],
    },
    {
      name: "Text/UI Small/Medium",
      status: "supported",
      fontFamily: "Noto Sans JP",
      fontStyle: "Medium",
      requestedWeight: 500,
      fontSizePx: px("font.size.small"),
      lineHeight: { unit: "PERCENT", value: byPath.get("font.line-height.ui").value * 100 },
      lineHeightApplication: "DIRECT_PERCENT",
      tokenPaths: ["font.family.body.ja", "font.size.small", "font.weight.medium", "font.line-height.ui"],
    },
    {
      name: "Text/Body/Regular",
      status: "supported",
      fontFamily: "Noto Sans JP",
      fontStyle: "Regular",
      requestedWeight: 400,
      fontSizePx: px("font.size.body"),
      lineHeight: { unit: "PERCENT", value: byPath.get("font.line-height.body.ja").value * 100 },
      lineHeightApplication: "DIRECT_PERCENT",
      tokenPaths: ["font.family.body.ja", "font.size.body", "font.weight.regular", "font.line-height.body.ja"],
    },
    {
      name: "Text/Body/Bold",
      status: "supported",
      fontFamily: "Noto Sans JP",
      fontStyle: "Bold",
      requestedWeight: 700,
      fontSizePx: px("font.size.body"),
      lineHeight: { unit: "PERCENT", value: byPath.get("font.line-height.body.ja").value * 100 },
      lineHeightApplication: "DIRECT_PERCENT",
      tokenPaths: ["font.family.body.ja", "font.size.body", "font.weight.bold", "font.line-height.body.ja"],
    },
    {
      name: "Text/Editor/Regular",
      status: "supported",
      fontFamily: "Noto Sans JP",
      fontStyle: "Regular",
      requestedWeight: 400,
      fontSizePx: px("font.size.editor"),
      lineHeight: { unit: "PERCENT", value: byPath.get("font.line-height.editor").value * 100 },
      lineHeightApplication: "DIRECT_PERCENT",
      tokenPaths: ["font.family.body.ja", "font.size.editor", "font.weight.regular", "font.line-height.editor"],
    },
  ];
  const unsupportedTextStyles = [
    {
      name: "Text/UI Small/Semibold",
      status: "unsupported",
      requestedWeight: 600,
      reason: "Noto Sans JP 600 style is unavailable in the connected Figma environment.",
      options: ["Do not create this Text Style", "Approve a different representative font with an exact 600 style"],
      tokenPaths: ["font.family.body.ja", "font.size.small", "font.weight.semibold", "font.line-height.ui"],
    },
    {
      name: "Text/Body/Semibold",
      status: "unsupported",
      requestedWeight: 600,
      reason: "Noto Sans JP 600 style is unavailable in the connected Figma environment.",
      options: ["Do not create this Text Style", "Approve a different representative font with an exact 600 style"],
      tokenPaths: ["font.family.body.ja", "font.size.body", "font.weight.semibold", "font.line-height.body.ja"],
    },
  ];
  const collections = [
    { name: "Primitives", mode: "Value", variableCount: 43, hiddenFromPublishing: true },
    { name: "Color", mode: "Light", variableCount: 20, hiddenFromPublishing: false },
    { name: "Typography", mode: "Value", variableCount: 11, hiddenFromPublishing: false },
    { name: "Spacing", mode: "Value", variableCount: 7, hiddenFromPublishing: false },
    { name: "Radius", mode: "Value", variableCount: 5, hiddenFromPublishing: false },
    { name: "Border", mode: "Value", variableCount: 1, hiddenFromPublishing: false },
    { name: "Interaction", mode: "Value", variableCount: 1, hiddenFromPublishing: false },
    { name: "Motion", mode: "Value", variableCount: 1, hiddenFromPublishing: false },
  ];
  for (const expected of collections) {
    const actual = variables.filter((variable) => variable.collection === expected.name && variable.mode === expected.mode).length;
    if (actual !== expected.variableCount) {
      throw new Error(`${expected.name}/${expected.mode}: expected ${expected.variableCount} Figma variables, got ${actual}`);
    }
  }
  return json({
    contractVersion: CONTRACT_VERSION,
    sourceRevision,
    file: "FUKAMU Foundations",
    collections,
    remBasePx: 16,
    counts: {
      primitiveVariables: primitiveVariables.length,
      primitiveColors: primitiveVariables.filter((variable) => variable.figmaType === "COLOR").length,
      publicVariables: publicVariables.length,
      totalVariables: variables.length,
      explicitScopeVariables: variables.filter((variable) => variable.scopePolicy === "explicit").length,
      figmaNativeScopeVariables: variables.filter((variable) => variable.scopePolicy === "figma-native").length,
      referenceOnlyVariables: variables.filter((variable) => variable.bindingPolicy === "reference-only").length,
      textStyleCandidates: supportedTextStyles.length + unsupportedTextStyles.length,
      creatableTextStyles: supportedTextStyles.length,
      effectStyles: 0,
      components: 0,
    },
    notes: [
      "Git is canonical; Figma must not become an independent value source.",
      "The Primitives collection is hidden from Library publishing; published semantic Variables remain aliases to these same-file sources.",
      "Scopes are explicit for COLOR, FLOAT, and STRING Variables. TIMING scope is Figma-native and is not assigned by the projection.",
      "Unitless line-height Variables are percent references only; Text Styles apply direct PERCENT line height and must not bind these Variables.",
      `Noto Sans JP represents the Git fallback stack in Figma only: ${byPath.get("font.family.body.ja").value.join(", ")}.`,
      "Notes dark mode and shadows are outside contract 0.1.0.",
    ],
    lossyTypographyConversions: [
      "The Git font fallback stack is represented by Noto Sans JP in Figma.",
      "rem dimensions are converted with 1rem = 16px.",
      "Unitless line heights are represented as PERCENT at value × 100.",
      "Noto Sans JP has no 600 style in the connected environment; Semibold Text Style candidates are unsupported and must not be approximated.",
    ],
    variables,
    textStyleCandidates: [...supportedTextStyles, ...unsupportedTextStyles],
    textStyles: supportedTextStyles,
    effectStyles: [],
    components: [],
  });
}

export async function buildGeneratedFiles(repoRoot, sourceRevision) {
  const normalizedRevision = sourceRevision.toLowerCase();
  if (!SOURCE_REVISION_PATTERN.test(normalizedRevision)) {
    throw new Error("source revision must be an explicit 40-character hexadecimal Git commit SHA");
  }
  const packageText = await readFile(join(repoRoot, "package.json"), "utf8");
  const packageJson = parseJsonStrict(packageText, "package.json");
  if (packageJson.name !== PACKAGE_NAME || packageJson.version !== CONTRACT_VERSION) {
    throw new Error(`package identity must be ${PACKAGE_NAME}@${CONTRACT_VERSION}`);
  }
  const { tokens: allTokens } = await loadContract(join(repoRoot, TOKEN_SOURCE));
  const tokens = publicTokens(allTokens);
  const resolvedPayload = {
    packageName: PACKAGE_NAME,
    contractVersion: CONTRACT_VERSION,
    sourceRevision: normalizedRevision,
    mode: "light",
    tokens: Object.fromEntries(tokens.map((token) => [token.path, serializableToken(token)])),
  };
  const payloads = new Map([
    ["css/tokens.css", generateCss(allTokens, normalizedRevision)],
    ["json/tokens.json", json(resolvedPayload)],
    ["js/index.mjs", generateJavaScript(tokens, normalizedRevision)],
    ["js/index.cjs", generateJavaScript(tokens, normalizedRevision, true)],
    ["types/index.d.ts", generateTypes(tokens, normalizedRevision)],
    ["reference/tokens.md", generateReference(allTokens, normalizedRevision)],
    ["figma/mapping.json", generateFigmaMapping(allTokens, normalizedRevision)],
  ]);
  const manifest = json({
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    contractVersion: CONTRACT_VERSION,
    sourceRevision: normalizedRevision,
    mode: "light",
    generatedBy: "scripts/generate.mjs",
    updateCommand: "npm run generate -- --source-revision <40-character-canonical-source-commit>",
    handEdited: false,
    artifacts: [...payloads.entries()]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([path, content]) => ({ path, sha256: hash(content) })),
  });
  const files = new Map();
  for (const [path, content] of payloads) {
    files.set(`dist/${path}`, content);
    files.set(`${VENDOR_ROOT}/${path}`, content);
  }
  files.set("dist/manifest.json", manifest);
  files.set(`${VENDOR_ROOT}/manifest.json`, manifest);
  files.set("docs/reference/tokens.md", payloads.get("reference/tokens.md"));
  return files;
}

export function manifestPayloadPaths() {
  return [
    "css/tokens.css",
    "figma/mapping.json",
    "js/index.cjs",
    "js/index.mjs",
    "json/tokens.json",
    "reference/tokens.md",
    "types/index.d.ts",
  ];
}
