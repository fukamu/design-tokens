export class StrictJsonError extends Error {
  constructor(message, sourceName, offset) {
    super(`${sourceName}:${offset}: ${message}`);
    this.name = "StrictJsonError";
  }
}

export function parseJsonStrict(text, sourceName = "<json>") {
  let offset = 0;

  const fail = (message) => {
    throw new StrictJsonError(message, sourceName, offset);
  };

  const skipWhitespace = () => {
    while (/[\x20\t\r\n]/u.test(text[offset] ?? "")) offset += 1;
  };

  const parseString = () => {
    const start = offset;
    if (text[offset] !== '"') fail("expected a string");
    offset += 1;
    while (offset < text.length) {
      const character = text[offset];
      if (character === '"') {
        offset += 1;
        try {
          return JSON.parse(text.slice(start, offset));
        } catch {
          fail("invalid JSON string");
        }
      }
      if (character === "\\") {
        offset += 1;
        if (offset >= text.length) fail("unterminated escape sequence");
        if (text[offset] === "u") {
          const hex = text.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) fail("invalid unicode escape");
          offset += 5;
          continue;
        }
        if (!/["\\/bfnrt]/u.test(text[offset])) fail("invalid escape sequence");
        offset += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail("unescaped control character");
      offset += 1;
    }
    fail("unterminated string");
  };

  const parseNumber = () => {
    const match = text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) fail("invalid number");
    offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail("number must be finite");
    return value;
  };

  const parseArray = () => {
    const result = [];
    offset += 1;
    skipWhitespace();
    if (text[offset] === "]") {
      offset += 1;
      return result;
    }
    while (offset < text.length) {
      result.push(parseValue());
      skipWhitespace();
      if (text[offset] === "]") {
        offset += 1;
        return result;
      }
      if (text[offset] !== ",") fail("expected ',' or ']' in array");
      offset += 1;
      skipWhitespace();
    }
    fail("unterminated array");
  };

  const parseObject = () => {
    const result = Object.create(null);
    const keys = new Set();
    offset += 1;
    skipWhitespace();
    if (text[offset] === "}") {
      offset += 1;
      return result;
    }
    while (offset < text.length) {
      const key = parseString();
      if (keys.has(key)) fail(`duplicate object key '${key}'`);
      keys.add(key);
      skipWhitespace();
      if (text[offset] !== ":") fail("expected ':' after object key");
      offset += 1;
      skipWhitespace();
      Object.defineProperty(result, key, {
        value: parseValue(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      skipWhitespace();
      if (text[offset] === "}") {
        offset += 1;
        return result;
      }
      if (text[offset] !== ",") fail("expected ',' or '}' in object");
      offset += 1;
      skipWhitespace();
    }
    fail("unterminated object");
  };

  const parseValue = () => {
    skipWhitespace();
    const character = text[offset];
    if (character === '"') return parseString();
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();
    if (character === "-" || /\d/u.test(character ?? "")) return parseNumber();
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return value;
      }
    }
    fail("unexpected token");
  };

  const value = parseValue();
  skipWhitespace();
  if (offset !== text.length) fail("unexpected trailing content");
  return value;
}
