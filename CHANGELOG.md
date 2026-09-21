# Changelog

All notable contract changes are recorded here. Structural changes (rename, removal, type, or unit), additive changes, and value-only visual changes are identified separately.

## [0.1.0] - Unreleased

### Added

- Initial shared Light contract with 43 private primitives and 46 public aliases.
- Shared text, surface, border, accent, action, focus, danger, warning, and success colors.
- Japanese system-font-first body stack, text sizes, weights, and line heights.
- Spacing, radius, border width, minimum interaction target, and short motion duration.
- Deterministic CSS, JSON, ESM, CommonJS, declarations, reference, Figma mapping, and versioned text bundle generation, with private Figma primitives and explicit scope/binding policy.
- Figma Phase 1 component mapping for `Action/Button`, `Form/Text field`, and `Feedback/Status message`, including exact node IDs, component properties, variants, semantic token bindings, QA evidence, and rollback documentation. No token value, type, unit, name, or alias changed.

### Explicitly excluded

- Notes dark mode.
- Shared shadows.
- Product-owned layout, graph, interaction, and performance constants.
- Product-specific component variants and behavior, including Secondary/Danger/Disabled buttons, Disabled/textarea/select/search fields, product notification flows, and icons pending a shared icon API.
- npm publication and Figma Library Publish.
