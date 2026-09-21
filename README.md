# @fukamu/design-tokens

The versioned, framework-independent design-token contract shared by FUKAMU Cycle and FUKAMU Notes.

Contract `0.1.0` is a Git-distributed Light-mode contract. The npm package is intentionally `private` until registry ownership, authentication, licensing, and publication receive separate approval.

## Canonical source

[`tokens/fukamu.tokens.json`](tokens/fukamu.tokens.json) is the only value source. It contains 43 private literal primitives and 46 public aliases. The generated CSS contains both sets so Figma and CSS aliases refer to real values, but `primitive.*` remains an implementation detail.

The source uses a deliberately small DTCG 2025.10 subset:

- every token has `$type`, `$value`, and a non-empty `$description`;
- literal values exist only below `primitive.*`;
- every public alias chain ends at a primitive of the same type;
- supported types are `color`, `dimension`, `duration`, `fontFamily`, `fontWeight`, and `number`;
- colors use the DTCG Color Module object form with `colorSpace: "srgb"`, three normalized components, and alpha;
- dimensions use `{ value, unit }` with `px` or `rem`;
- durations use `{ value, unit }` with `ms` or `s`;
- font families are a string or non-empty string array;
- font weights are integer values from 1 through 1000;
- line heights are unitless numbers.

The validator rejects duplicate JSON keys, unsupported properties/types/units, public literals, primitive aliases, missing targets, type mismatches, alias cycles, invalid names, and flattened CSS-name collisions. Arbitrary modes, responsive expressions, shadows, and Notes dark values are not represented as DTCG features.

## Generated contract

Run Node.js 20 or later. There are no runtime or development dependencies.

```text
npm ci --ignore-scripts
npm run validate
npm run generate -- --source-revision <40-character-canonical-source-commit>
npm run check
```

Generation requires an explicit immutable source SHA. It never guesses `HEAD`: it verifies that canonical inputs are committed and clean, the supplied SHA is an available ancestor of `HEAD`, and that SHA has byte-identical canonical inputs (`tokens/`, `package.json`, and `scripts/`) to the worktree.

| Output | Purpose |
|---|---|
| `dist/css/tokens.css` | `:root` CSS custom properties only; no reset, body, or component selectors |
| `dist/json/tokens.json` | Resolved public JSON contract |
| `dist/js/index.mjs` | ESM public contract |
| `dist/js/index.cjs` | CommonJS public contract |
| `dist/types/index.d.ts` | TypeScript declarations |
| `dist/reference/tokens.md` | Generated human-readable reference |
| `dist/figma/mapping.json` | Revision-bound Figma construction mapping |
| `dist/manifest.json` | Source revision and SHA-256 for every payload file |
| `docs/reference/tokens.md` | Review copy of the generated reference |
| `vendor/fukamu-design-tokens/0.1.0/` | Byte-identical versioned text bundle for both products |

The manifest does not hash itself; that would be self-referential. It hashes every payload, while Git fixes the manifest bytes.

## CSS use

The generated stylesheet is unlayered and scoped only to `:root`. Load it before a product's legacy mappings and product-specific overrides:

```css
@import "@fukamu/design-tokens/css";

:root {
  --legacy-product-token: var(--fukamu-color-text-primary);
}
```

Public names are deterministic: join the full dot path with `-` under `--fukamu-`. For example, `color.text.primary` becomes `--fukamu-color-text-primary`. Private names retain the `primitive` segment. Consumers must not depend on private names.

This package does not set element appearance, add a reset, select a framework, activate a theme, or provide a web font. Reduced motion remains a consumer policy.

## JavaScript use

```js
import tokens, { contractVersion, sourceRevision } from "@fukamu/design-tokens";

console.log(contractVersion, sourceRevision);
console.log(tokens["color.text.primary"].cssValue);
```

The JSON and JavaScript outputs contain only the 46 public tokens. Each entry includes the structured resolved value, CSS serialization, public CSS name, description, and primitive source path.

## Versioned text vendoring

Until an exact registry package can be published, Cycle and Notes consume the same text bundle from `vendor/fukamu-design-tokens/0.1.0/`. The consumer-side update must:

1. use the source revision recorded by `manifest.json`;
2. copy the complete version directory without editing files;
3. verify every listed SHA-256;
4. record the contract version, source SHA, hashes, and update command;
5. keep product mappings after the shared CSS import.

Archive dependencies, sibling-directory `file:` dependencies, links, floating branches/tags, and CDN references are not part of this fallback.

## Figma

`dist/figma/mapping.json` maps the same source revision into eight collections and 89 Variables. Public Variables alias the corresponding primitive Variable. The Primitives collection is an internal alias source and is marked `hiddenFromPublishing`; Library consumers receive the seven public semantic collections. `1rem` maps to 16px and duration 160ms maps to Figma `TIMING` value 0.16 seconds.

Scopes are explicitly assigned on all 87 COLOR, FLOAT, and STRING Variables, including empty scopes for primitives and reference-only line-height Variables. The two TIMING Variables omit `scopes` and declare `scopePolicy: "figma-native"` because Figma does not expose a configurable TIMING scope. Unitless line-height values map to percent references (145, 170, and 175), but must not be bound to Text Styles: Figma interprets a bound FLOAT as pixels. Text Styles instead apply direct PERCENT line height and retain the source token path as provenance.

Figma uses Noto Sans JP only as the approved Windows/Android design representative; the Git system-font fallback stack remains the code contract and no web-font dependency is introduced. Two 600-weight Text Style candidates are explicitly unsupported because the connected Noto Sans JP family lacks an exact 600 style. Contract `0.1.0` creates no Effect Styles and records three shared component sets with ten variant components: `Action/Button`, `Form/Text field`, and `Feedback/Status message`. See [the Phase 1 component handoff](docs/figma/phase-1-components.md) for exact node IDs, properties, bindings, QA, exclusions, and rollback.

Git remains canonical. Do not create or publish Figma assets until the recorded source revision and separate Figma authorization are confirmed. Component examples and QA frames are documentation only and are not Library assets.

## Development

See [AGENTS.md](AGENTS.md), [the source/distribution decision](docs/decisions/0001-source-format-and-distribution.md), and [the versioned HANDOFF](handoff/0.1.0.md). Changes are coordinated through GitHub Issues and dedicated branches/worktrees; direct `main` updates are prohibited.
