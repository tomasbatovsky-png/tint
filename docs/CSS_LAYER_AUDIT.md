# Tint CSS Layer Audit

This document audits the current `content.css` visual layers against the Tint v1 source of truth in `README.md`, `docs/ARCHITECTURE.md`, and `docs/CODE_AUDIT.md`.

This is a documentation-only audit.

It does not change runtime behavior.
It does not add or remove CSS effects.
It does not modify `content.css`, `content.js`, `manifest.json`, `signals.js`, or `signals.json`.

---

## A. Current CSS layer inventory

### Floating toggle

Selectors:

- `#__tint-toggle`
- `#__tint-toggle:hover`
- `#__tint-toggle .__tint-track`
- `#__tint-toggle .__tint-thumb`
- `#__tint-toggle.on .__tint-track`
- `#__tint-toggle.on .__tint-thumb`
- `#__tint-toggle .__tint-label`
- `#__tint-toggle.on .__tint-label`

Current purpose:

- Provides the fixed bottom-right Tint control.
- Owns toggle presentation only.
- Does not own page atmosphere or card atmosphere.

Current risk:

- Low. It is visually independent from the atmosphere layers.

### Page wash

Selectors:

- `#__tint-page-wash`
- `body.__tint-on.__tint-youtube-logo-preview #__tint-page-wash`
- `body.__tint-on.__tint-youtube-shorts #__tint-page-wash`

Current purpose:

- Provides a hidden global wash element.
- Becomes visible for YouTube logo preview and YouTube Shorts.
- Uses shared CSS variables for wash color, center, opacity, and edge behavior.

Current risk:

- Medium to high. The same element is shared by multiple modes, so state leakage is possible.

### `__tint-mark`

Selectors:

- `.__tint-mark`
- `.__tint-mark::before`
- `body.__tint-on .__tint-mark::before`
- `body.__tint-on .__tint-mark:hover::before`
- `.__tint-mark[data-tint-color="green"]`
- `.__tint-mark[data-tint-color="blue"]`
- `.__tint-mark[data-tint-color="orange"]`
- `.__tint-mark[data-tint-color="red"]`
- `.__tint-mark[data-tint-color="gray"]`
- `.__tint-mark > *`

Current purpose:

- General atmospheric overlay primitive.
- Creates a pseudo-element haze around marked text/content.
- Uses `data-tint-color` and `--tint-i` for atmosphere and intensity.

Current risk:

- Medium. It is a shared primitive that can overlap with platform-specific card overlays.
- The base selector makes tint visible whenever `body.__tint-on` is present, so it should not be used for normal cards that must remain visually untouched before hover.

### `__tint-youtube-card`

Selectors:

- `body.__tint-on .__tint-youtube-card`
- `body.__tint-on .__tint-youtube-card::before`
- `body.__tint-on .__tint-youtube-card:hover::before`
- `body.__tint-on .__tint-youtube-card::after`
- `body.__tint-on .__tint-youtube-card:hover::after`

Current purpose:

- YouTube card hover-only atmosphere model.
- Owns local haze around YouTube cards.
- Owns YouTube micro-label display via `data-tint-label`.

Current risk:

- Medium. It also uses pseudo-elements and may overlap conceptually with `__tint-mark`.
- It should remain the single YouTube normal-card visual layer.

### `__tint-card` reason card

Selectors:

- `#__tint-card`
- `#__tint-card.show`
- `#__tint-card .__tint-card-head`
- `#__tint-card .__tint-card-swatch`
- `#__tint-card .__tint-card-atm`
- `#__tint-card .__tint-card-name`
- `#__tint-card .__tint-card-desc`
- `#__tint-card .__tint-card-source`

Current purpose:

- Floating explanation card for selected marked elements.
- Explains detected atmosphere/signal details.

Current risk:

- Low to medium. It is not part of the hover atmosphere model, but its role should remain clear because v1 emphasizes subtle hover reveals over popup-like explanation surfaces.

### YouTube comment edge glow

Selectors:

- `body.__tint-on ytd-comment-thread-renderer .__tint-mark::before`
- `body.__tint-on ytd-comment-view-model .__tint-mark::before`
- `body.__tint-on ytd-comment-renderer .__tint-mark::before`
- `body.__tint-on ytd-comment-thread-renderer .__tint-mark:hover::before`
- `body.__tint-on ytd-comment-view-model .__tint-mark:hover::before`
- `body.__tint-on ytd-comment-renderer .__tint-mark:hover::before`
- `body.__tint-on ytd-comment-thread-renderer .__tint-mark::after`
- `body.__tint-on ytd-comment-view-model .__tint-mark::after`
- `body.__tint-on ytd-comment-renderer .__tint-mark::after`

Current purpose:

- Reduces generic mark haze for YouTube comments.
- Adds a quiet edge presence for comment-specific atmosphere.

Current risk:

- Medium. It overrides the shared `__tint-mark` pseudo-elements and adds its own `::after`, so it creates a platform-specific variant of the generic mark layer.

### YouTube Shorts atmosphere

Selectors:

- `body.__tint-on.__tint-youtube-shorts #__tint-page-wash`
- `body.__tint-on.__tint-youtube-shorts[data-tint-shorts-atmosphere="green"] #__tint-page-wash`
- `body.__tint-on.__tint-youtube-shorts[data-tint-shorts-atmosphere="blue"] #__tint-page-wash`
- `body.__tint-on.__tint-youtube-shorts[data-tint-shorts-atmosphere="orange"] #__tint-page-wash`
- `body.__tint-on.__tint-youtube-shorts[data-tint-shorts-atmosphere="gray"] #__tint-page-wash`
- `body.__tint-on.__tint-youtube-shorts .__tint-youtube-card::before`
- `body.__tint-on.__tint-youtube-shorts .__tint-youtube-card::after`

Current purpose:

- Provides fullscreen ambient weather for Shorts.
- Suppresses normal YouTube card pseudo-elements inside Shorts.

Current risk:

- Medium. It intentionally overrides normal card behavior and uses the globally shared page wash.

### Shorts fallback wash

Selectors:

- `body.__tint-on.__tint-youtube-shorts.__tint-youtube-shorts-fallback #__tint-page-wash`

Current purpose:

- Provides fallback ambient rendering when Shorts detection is uncertain.
- Disables animation for fallback state.

Current risk:

- Medium. It is another state on the same shared page wash element.

### Shorts animations

Selectors / keyframes:

- `@keyframes __tint-shorts-breathe`
- `@keyframes __tint-shorts-calm`
- `@keyframes __tint-shorts-pulse`
- `@keyframes __tint-shorts-haze`

Current purpose:

- Defines ambient motion by Shorts atmosphere token.

Current risk:

- Low to medium. Motion is scoped through Shorts body classes, but it depends on page-wash state being correctly cleaned up.

---

## B. Intended ownership per v1

| Layer | Intended owner | Intended surface | Mode | Shared or platform-specific |
| --- | --- | --- | --- | --- |
| Floating toggle | Core UI | All matched pages | Control UI | Shared |
| Page wash base | Visual layer core | Hidden by default | Ambient foundation | Shared primitive |
| Logo-preview wash | YouTube adapter / optional page preview | YouTube logo preview only | Temporary ambient preview | Platform-specific use of shared primitive |
| Shorts wash | Shorts adapter | YouTube Shorts / fullscreen contexts | Ambient-only | Platform-specific |
| `__tint-mark` | Core visual primitive | Generic text or non-card marked elements | Local overlay | Shared, but not for normal YouTube cards |
| `__tint-youtube-card` | YouTube adapter | YouTube homepage, search, watch sidebar cards | Hover-only card reveal | Platform-specific |
| YouTube micro-label | YouTube adapter | YouTube cards | Hover-only explanation | Platform-specific |
| `__tint-card` reason card | Core explanation UI | Non-YouTube marked elements where explanation is useful | Click/focus explanation | Shared |
| YouTube comment edge glow | YouTube adapter | YouTube comments | Quiet local hint | Platform-specific variant |
| Shorts animations | Shorts adapter | Shorts page wash | Ambient motion | Platform-specific |

---

## C. Overlap risks

### `__tint-mark` and `__tint-youtube-card` both own pseudo-elements

Both layers use pseudo-elements for local atmosphere.

Risk:

- A YouTube card that receives both classes could get competing overlays.
- Shared `::before` behavior can make ownership unclear.

Recommendation:

- Keep normal YouTube cards on `__tint-youtube-card` only.
- Reserve `__tint-mark` for generic text/comment contexts unless a future PR explicitly defines a shared variant.

### `__tint-page-wash` is shared by logo preview and Shorts

The same DOM element supports multiple states.

Risk:

- Logo preview state can leak into Shorts.
- Shorts state can leak into normal YouTube pages.
- Generic future adapters may accidentally reuse page wash.

Recommendation:

- Keep page wash hidden by default.
- Document every class that is allowed to make it visible.
- Add cleanup tests before touching runtime behavior.

### Comment-specific rules compete with generic mark rules

YouTube comment selectors override `__tint-mark::before` and add `__tint-mark::after`.

Risk:

- Comment behavior becomes a hidden special case of the generic mark layer.
- Future generic cleanup could accidentally break comment rendering.

Recommendation:

- Decide later whether comment glow remains platform-specific or becomes a named shared variant.

### Shorts page wash overrides base page wash

Shorts CSS redefines page wash position, background, filter, animation, and z-index.

Risk:

- Base page wash behavior is hard to reason about without reading Shorts overrides.
- Ordering matters.

Recommendation:

- Keep the base wash block minimal.
- Keep Shorts wash block clearly labeled as a platform override.

### Persistent opacity paths

Some selectors make overlays visible on `body.__tint-on` rather than hover.

Risk:

- Normal browsing surfaces can become permanently tinted.

Recommendation:

- Only intentional ambient modes should be visible without hover.
- Normal cards should remain hover-only.

### Z-index pressure

Tint uses high z-index values for toggle, page wash, and reason card.

Risk:

- New layers can accidentally cover host-page UI.
- Shorts wash and toggle need especially careful stacking.

Recommendation:

- Do not add new high-z-index layers without documenting ownership.

### Implicit platform boundaries

Some CSS selectors are platform-specific by tag name, while others are generic class selectors.

Risk:

- Class reuse can accidentally cross platform boundaries.

Recommendation:

- Prefer explicit ownership notes before future CSS refactors.

---

## D. Safe cleanup candidates

### 1. Add CSS section comments / ownership labels only

A future PR can add comments to `content.css` that mark each block as one of:

- core UI
- shared visual primitive
- YouTube adapter
- Shorts adapter
- explanation UI

This should not change selectors or declarations.

### 2. Split page wash comments into ownership blocks

A future PR can clarify the page wash sections:

- base hidden wash
- logo-preview activation
- Shorts activation
- Shorts fallback
- Shorts animation mapping

This should be comment-only first.

### 3. Verify `__tint-youtube-card` does not depend on `__tint-mark` side effects

Before refactoring CSS, confirm in the browser that YouTube cards receive the intended class and do not need generic mark styling.

Validation target:

- YouTube homepage
- YouTube watch sidebar
- YouTube search results

### 4. Decide whether comment glow stays platform-specific

A future architecture decision should determine whether YouTube comment edge glow is:

- a YouTube-only special case, or
- a named shared variant for comments/text blocks.

No code should be changed until the ownership decision is explicit.

### 5. Remove obsolete CSS only after local browser validation

Do not remove CSS solely because it appears duplicated.

Removal should happen only after checking:

- YouTube homepage
- YouTube watch sidebar
- YouTube search results
- YouTube Shorts
- Reddit comments/posts

### 6. Avoid CSS cleanup and runtime cleanup in the same PR

Runtime class assignment and CSS selector cleanup should stay separate.

This prevents small visual changes from hiding adapter behavior regressions.

---

## E. Manual validation checklist

Use this checklist before merging any future CSS behavior PR.

### YouTube homepage

Expected:

- page is visually normal before hover
- hovering a video card reveals only one local atmosphere layer
- micro-label appears only on hover
- no page wash is visible by default

### YouTube watch sidebar

Expected:

- sidebar recommendations are visually normal before hover
- hovering a recommendation reveals the shared YouTube card atmosphere
- no persistent sidebar haze
- no old watch-specific overlay appears

### YouTube search results

Expected:

- result cards are visually normal before hover
- search cards use the same hover model as other YouTube cards
- no page wash appears on search pages by default

### YouTube Shorts

Expected:

- fullscreen ambient wash appears only in Shorts context
- Shorts wash does not leave state behind after navigating away
- normal card pseudo-elements are suppressed inside Shorts if necessary
- fallback wash remains scoped to fallback Shorts state

### Reddit comments/posts

Expected:

- Reddit interactions remain clickable
- comment/post atmosphere does not block native controls
- generic adapter does not claim Reddit posts
- explanation card behavior remains controlled and non-intrusive

---

## F. Merge criteria for future CSS cleanup PRs

A future CSS cleanup PR should be mergeable only if:

- changed files match the PR scope
- runtime files are untouched unless the issue explicitly allows them
- default page UI remains visually normal
- hover-only surfaces remain hover-only
- Shorts ambient behavior is locally validated
- Reddit behavior is locally validated
- `git diff --check` passes
- Chrome extension behavior is manually checked for affected surfaces
