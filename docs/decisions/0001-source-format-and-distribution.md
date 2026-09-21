# ADR 0001: Git token source, deterministic outputs, and text-bundle distribution

- Status: Accepted for contract 0.1.0
- Decision date: 2026-09-21
- Related Issues: `fukamu/design-tokens#1`, `fukamu/design-tokens#2`

## Context

Cycle and Notes must resolve the same token meaning, name, type, unit, value, and history without maintaining separate hand-written sources. Registry ownership and publication are not ready. Cycle also rejects non-registry package sources and committed archive dependencies.

## Decision

Git is canonical. `tokens/fukamu.tokens.json` uses a strict subset of DTCG 2025.10 with structured sRGB colors, typed numeric values, private primitives, and public aliases. A dependency-free Node generator produces every consumer format.

Contract 0.1.0 has one common Light mode. Notes warm canvas and decorative surfaces remain product-owned. Notes headings remain product-owned Mincho. Notes dark and all shadows are excluded.

Every token path maps to CSS by replacing dots with hyphens and prefixing `--fukamu-`. CSS contains private primitive declarations and public `var()` aliases in one `:root` block, with no reset or element/component selectors. JSON and JavaScript export only the public contract.

Until registry publication is separately approved, both products receive byte-identical generated text under `vendor/fukamu-design-tokens/0.1.0/`. Its manifest records the contract version, canonical source SHA, and SHA-256 for every payload. Consumers record and verify those values and never hand-edit the bundle.

The source revision is supplied externally to generation. Canonical inputs are committed first; artifacts generated with that commit's SHA are committed second. The artifact commit is not presented as its own source revision.

Figma is a projection of the same revision, not another source. The generated mapping defines eight collections, primitive-to-public aliases, WEB code syntax, scopes, conversions, and exact unsupported typography cases.

## Consequences

- Generated files are reviewable and usable without a registry or sibling checkout.
- Reproduction needs only a supported Node/npm installation and the fixed Git revision.
- Primitive CSS Variables exist to keep CSS and Figma aliases real, but are not public compatibility promises.
- Value changes can affect both products without changing token shape; structural changes require explicit migration and deprecation.
- The private package guard must be deliberately removed only when registry and publication approval exist.
