# Figma Phase 1 shared components

Git remains the canonical source for all token names, values, aliases, scopes, and component-to-token mappings. This document records the Phase 1 projection in the existing [FUKAMU Foundations](https://www.figma.com/design/glU4Dt6AMRQoTUOsPaDTc3/FUKAMU-Foundations) file; it does not create a second value source.

## Change record

- Coordination: [Issue #6](https://github.com/fukamu/design-tokens/issues/6)
- Owner: `@matoruru`
- Base `main`: `eeb074c531aa984b63d373b65c0aa9213fd6a3bd`
- Affected products: Cycle and Notes
- Consumer baselines inspected: Cycle `7f4bf1198690145f35b2b335c5841b08149933d4`; Notes `c23248ce25ef2d2464611bf59b777f5362f06781`
- Figma page: Components (`21:5`)
- Sections: Overview `42:2`, Actions `42:3`, Forms `42:4`, Feedback `42:5`, QA `42:6`

The Overview section states the boundary explicitly: shared components do not replace product-specific UI. Timeline, P/D/C/A and domain states, editor and graph UI, decorative Notes surfaces, and product notification flows remain product-owned.

## Component sets

### `Action/Button`

- Component set: `45:2`; representative instance: `46:4`
- Variants: `State=Default` `44:2`, `State=Hover` `44:4`, `State=Pressed` `44:6`, `State=Focus` `44:8`
- Properties: `Label#45:0` (TEXT), `State` (VARIANT: Default, Hover, Pressed, Focus)
- Shared bindings: `interaction.target.min`, `spacing.2`, `spacing.4`, `radius.md`, `Text/UI Small/Medium`
- State bindings: `color.action.primary`, `color.action.primary-hover`, `color.action.on-primary`, `color.focus.ring`, and `border.width.default`
- Decisions: Hover and Pressed intentionally share `color.action.primary-hover`; Focus has a visible semantic stroke; the minimum height is token-bound.
- Excluded: Secondary and Danger retain product semantics; Disabled behavior is not aligned; icons wait for a shared icon library and icon-tone API.

### `Form/Text field`

- Component set: `49:3`; representative instance: `50:5`
- Variants: `State=Default` `48:3`, `State=Focus` `48:10`, `State=Error` `48:17`
- Properties: `Label#49:0`, `Value#49:4`, `Helper text#49:8` (TEXT); `Show label#49:12`, `Show helper#49:16` (BOOLEAN); `State` (VARIANT: Default, Focus, Error)
- Shared bindings: `color.surface.default`, `color.text.primary`, `border.width.default`, `interaction.target.min`, `spacing.1`, `spacing.2`, `spacing.3`, `radius.md`, `Text/UI Small/Regular`, and `Text/UI Small/Medium`
- State bindings: `color.border.default`, `color.focus.ring`, `color.status.danger.border`, `color.status.danger.foreground`, and `color.text.secondary`
- Decisions: Focus and Error include both a semantic stroke and an explicit state hint, so state is not conveyed by color alone.
- Excluded: Disabled behavior is not aligned. Textarea, Select, Search, and icon affordances require distinct interaction contracts.

### `Feedback/Status message`

- Component set: `52:18`; representative instance: `53:11`
- Variants: `Tone=Danger` `52:9`, `Tone=Warning` `52:12`, `Tone=Success` `52:15`
- Properties: `Title#52:0`, `Message#52:4` (TEXT); `Show title#52:8` (BOOLEAN); `Tone` (VARIANT: Danger, Warning, Success)
- Shared bindings: `border.width.default`, `spacing.2`, `spacing.4`, `radius.lg`, `Text/UI Small/Regular`, and `Text/UI Small/Medium`
- Tone bindings: matching semantic surface and foreground tokens for all tones; matching border tokens for Danger and Warning.
- Decision: Success has no border because the contract has no success-border token. No color was invented and no unrelated border token was substituted.
- Excluded: product notification flows, card/paper treatments, and icons remain product-owned or require an agreed shared API.

## QA evidence

- Responsive/property QA frame: `56:3`, fixed at 412px; QA instances: `56:5`, `56:7`, `56:14`, `56:21`, `56:24`.
- Long Japanese button, label, helper, and message strings render without clipping. The long helper and message wrap inside Fill instances.
- Boolean properties were exercised both on and off. All three variant axes were inspected.
- A temporary change to main Button label `44:3` propagated to a new instance and was reverted (`続ける` → `伝播確認` → `続ける`).
- Audit result: 41 tokenized solid-paint checks, 30 distinct public bindings, zero direct Primitive bindings, zero effects, and no missing fonts.
- Layout result: all component variants use Auto Layout and Hug content vertically; QA instances use Fill horizontally; Button and Text field bind `interaction.target.min`.
- Regression result: 7 pages, 8 collections, 89 Variables, 46 public aliases, 5 Text Styles, and zero Effect Styles remain intact. Primitives remains the only hidden collection.
- Final Components-page count: 3 component sets, 10 variant components, 8 instances, and 5 sections.

## Publishing boundary

The publishable scope is the seven semantic Variable collections, five Text Styles, and these three component sets. Exclude Primitives, documentation/QA frames, and product-specific examples. Library Publish is a separate Figma UI operation and must not be reported as complete until the UI confirms it.

## Rollback

If Phase 1 must be rolled back before Library Publish, remove the three component sets, their eight recorded instances, and the five new Components-page sections; then restore the previous Components-page content. Do not alter Variables, aliases, scopes, Text Styles, or other pages. Revert the related Git commits and regenerate the revision-bound artifacts from the restored canonical source commit. If a Library version has already been published, publish a corrective version and communicate the removed component keys to Cycle and Notes rather than silently deleting consumer-visible assets.
