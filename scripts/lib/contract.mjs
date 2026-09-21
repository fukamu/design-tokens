import { readFile } from "node:fs/promises";
import { parseJsonStrict } from "./strict-json.mjs";

export const ALLOWED_TYPES = new Set([
  "color",
  "dimension",
  "duration",
  "fontFamily",
  "fontWeight",
  "number",
]);

export const CONTRACT_VERSION = "0.1.0";
export const PACKAGE_NAME = "@fukamu/design-tokens";
export const TOKEN_SOURCE = "tokens/fukamu.tokens.json";
export const VENDOR_ROOT = `vendor/fukamu-design-tokens/${CONTRACT_VERSION}`;

export function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const TOKEN_KEYS = new Set(["$type", "$value", "$description"]);
const GROUP_KEYS = new Set(["$description"]);
const ALIAS_PATTERN = /^\{([a-z0-9-]+(?:\.[a-z0-9-]+)*)\}$/u;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertOnlyKeys(value, allowed, context) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${context}: unsupported property '${key}'`);
  }
}

function assertDescription(value, context) {
  if (typeof value.$description !== "string" || value.$description.trim() === "") {
    throw new Error(`${context}: $description must be a non-empty string`);
  }
}

function assertNumericObject(value, allowedUnits, context) {
  if (!isPlainObject(value)) throw new Error(`${context}: value must be an object`);
  assertOnlyKeys(value, new Set(["value", "unit"]), context);
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0) {
    throw new Error(`${context}: value.value must be a non-negative finite number`);
  }
  if (!allowedUnits.has(value.unit)) {
    throw new Error(`${context}: unit '${value.unit}' is not allowed`);
  }
}

function validateLiteral(type, value, context) {
  switch (type) {
    case "color": {
      if (!isPlainObject(value)) throw new Error(`${context}: color must be an object`);
      assertOnlyKeys(value, new Set(["colorSpace", "components", "alpha"]), context);
      if (value.colorSpace !== "srgb") throw new Error(`${context}: only sRGB colors are supported`);
      if (!Array.isArray(value.components) || value.components.length !== 3) {
        throw new Error(`${context}: color.components must contain three numbers`);
      }
      for (const component of value.components) {
        if (typeof component !== "number" || !Number.isFinite(component) || component < 0 || component > 1) {
          throw new Error(`${context}: color components must be finite numbers from 0 through 1`);
        }
      }
      if (typeof value.alpha !== "number" || !Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1) {
        throw new Error(`${context}: color alpha must be a finite number from 0 through 1`);
      }
      return;
    }
    case "dimension":
      assertNumericObject(value, new Set(["px", "rem"]), context);
      return;
    case "duration":
      assertNumericObject(value, new Set(["ms", "s"]), context);
      return;
    case "fontFamily": {
      const validString = (item) => typeof item === "string" && item.trim() !== "";
      if (validString(value)) return;
      if (!Array.isArray(value) || value.length === 0 || !value.every(validString)) {
        throw new Error(`${context}: fontFamily must be a non-empty string or string array`);
      }
      return;
    }
    case "fontWeight":
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000) {
        throw new Error(`${context}: fontWeight must be an integer from 1 through 1000`);
      }
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${context}: number must be finite`);
      }
      return;
    default:
      throw new Error(`${context}: unsupported token type '${type}'`);
  }
}

export function cssVariableForPath(path) {
  return `--fukamu-${path}`.replaceAll(".", "-");
}

export function validateContract(document) {
  if (!isPlainObject(document)) throw new Error("token document root must be an object");
  const tokens = new Map();

  const walk = (group, path = []) => {
    if (!isPlainObject(group)) throw new Error(`${path.join(".") || "root"}: group must be an object`);
    if (Object.hasOwn(group, "$description")) assertDescription(group, path.join(".") || "root");
    for (const key of Object.keys(group)) {
      if (key.startsWith("$")) {
        if (!GROUP_KEYS.has(key)) throw new Error(`${path.join(".") || "root"}: unsupported group property '${key}'`);
        continue;
      }
      if (!NAME_PATTERN.test(key)) throw new Error(`${[...path, key].join(".")}: invalid token or group name`);
      const child = group[key];
      if (!isPlainObject(child)) throw new Error(`${[...path, key].join(".")}: entry must be an object`);
      const childPath = [...path, key];
      if (Object.hasOwn(child, "$value")) {
        assertOnlyKeys(child, TOKEN_KEYS, childPath.join("."));
        assertDescription(child, childPath.join("."));
        if (!ALLOWED_TYPES.has(child.$type)) {
          throw new Error(`${childPath.join(".")}: unsupported or missing $type '${child.$type}'`);
        }
        const tokenPath = childPath.join(".");
        const aliasMatch = typeof child.$value === "string" ? child.$value.match(ALIAS_PATTERN) : null;
        const isPrimitive = childPath[0] === "primitive";
        if (isPrimitive && aliasMatch) throw new Error(`${tokenPath}: primitive tokens cannot be aliases`);
        if (!isPrimitive && !aliasMatch) throw new Error(`${tokenPath}: public tokens must be aliases`);
        if (!aliasMatch) validateLiteral(child.$type, child.$value, tokenPath);
        tokens.set(tokenPath, {
          path: tokenPath,
          type: child.$type,
          description: child.$description,
          rawValue: clone(child.$value),
          alias: aliasMatch?.[1] ?? null,
          primitive: isPrimitive,
        });
      } else {
        walk(child, childPath);
      }
    }
  };

  assertDescription(document, "root");
  walk(document);
  if (!tokens.size) throw new Error("token document contains no tokens");

  const cssNames = new Map();
  for (const token of tokens.values()) {
    const cssName = cssVariableForPath(token.path);
    const previous = cssNames.get(cssName);
    if (previous) throw new Error(`${token.path}: CSS name '${cssName}' collides with '${previous}'`);
    cssNames.set(cssName, token.path);
  }

  const resolving = new Set();
  const resolved = new Map();
  const resolve = (path) => {
    if (resolved.has(path)) return resolved.get(path);
    const token = tokens.get(path);
    if (!token) throw new Error(`${path}: unresolved alias target`);
    if (resolving.has(path)) throw new Error(`${path}: alias cycle detected`);
    resolving.add(path);
    let value = token.rawValue;
    let sourcePath = path;
    if (token.alias) {
      const target = tokens.get(token.alias);
      if (!target) throw new Error(`${path}: unresolved alias target '${token.alias}'`);
      if (target.type !== token.type) {
        throw new Error(`${path}: alias type '${token.type}' does not match '${target.type}' at '${token.alias}'`);
      }
      const targetResolution = resolve(token.alias);
      value = targetResolution.value;
      sourcePath = targetResolution.sourcePath;
    }
    resolving.delete(path);
    const result = { value: clone(value), sourcePath };
    resolved.set(path, result);
    return result;
  };

  for (const path of tokens.keys()) resolve(path);
  for (const token of tokens.values()) {
    if (!token.primitive && !resolved.get(token.path).sourcePath.startsWith("primitive.")) {
      throw new Error(`${token.path}: public alias chain must resolve to a primitive token`);
    }
  }

  return [...tokens.values()]
    .map((token) => ({ ...token, ...resolved.get(token.path) }))
    .sort((left, right) => compareCodePoints(left.path, right.path));
}

export async function loadContract(sourcePath) {
  const text = await readFile(sourcePath, "utf8");
  const document = parseJsonStrict(text, sourcePath);
  return { document, tokens: validateContract(document) };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function quoteCssString(value) {
  let result = '"';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (character === '"' || character === "\\") {
      result += `\\${character}`;
    } else if (codePoint === 0) {
      result += "\\FFFD ";
    } else if (codePoint <= 0x1f || codePoint === 0x7f) {
      result += `\\${codePoint.toString(16).toUpperCase()} `;
    } else {
      result += character;
    }
  }
  return `${result}"`;
}

export function colorToHex(value) {
  const channels = value.components.map((component) => Math.round(component * 255));
  if (value.alpha < 1) channels.push(Math.round(value.alpha * 255));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function toCssValue(token) {
  switch (token.type) {
    case "color":
      return colorToHex(token.value);
    case "dimension":
    case "duration":
      return `${formatNumber(token.value.value)}${token.value.unit}`;
    case "fontFamily": {
      const families = Array.isArray(token.value) ? token.value : [token.value];
      return families
        .map((family) => (/^[a-zA-Z][a-zA-Z0-9-]*$/u.test(family) ? family : quoteCssString(family)))
        .join(", ");
    }
    case "fontWeight":
    case "number":
      return formatNumber(token.value);
    default:
      throw new Error(`${token.path}: cannot format type '${token.type}' as CSS`);
  }
}

export function publicTokens(tokens) {
  return tokens.filter((token) => !token.primitive);
}
