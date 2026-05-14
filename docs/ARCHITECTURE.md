# Tint v1 Architecture

This document expands the README into implementation boundaries for the Tint v1
cleanup. It is not a request to add new behavior. Use it to decide what to keep,
remove, or isolate when refactoring existing code.

## Goals

- Keep the default website UI visually normal.
- Reveal atmosphere through hover or explicit ambient modes.
- Isolate platform adapters so one site's fixes do not affect another site.
- Maintain one CSS source of truth for each visual layer.
- Keep scoring local, deterministic, and inspectable.

## Non-goals

- No content moderation.
- No page-wide heatmap.
- No permanent recoloring of normal cards.
- No new CSS effects during documentation-first cleanup.
- No YouTube or Reddit behavior changes unless required to remove clearly broken
  conflict markers or dead experimental code.

## Data flow

```text
DOM candidate discovery
  -> adapter-owned extraction
  -> core scoring
  -> atmosphere token
  -> adapter class assignment
  -> visual layer rendering
```

The scoring engine should not know which platform provided the text. The visual
layer should not rediscover platform semantics. Adapters are the boundary between
site DOM and Tint semantics.

## Ownership boundaries

### Core scoring

The core scoring layer owns signal weights, thresholds, and atmosphere mapping.
It should accept normalized text or metadata and return an atmosphere token plus
minimal explainability metadata when needed.

Expected outputs:

- `green` for grounded, restorative, human-paced material.
- `blue` for neutral, informational, explanatory material.
- `orange` for attention-heavy, urgent, conversion-oriented material.
- `gray` for synthetic, templated, AI-slop rhythm.
- `red` only as a reserved future token outside YouTube ambient use.

### YouTube adapter

The YouTube adapter owns YouTube-specific card discovery and must not depend on
the generic adapter for normal YouTube surfaces.

Covered surfaces:

- Homepage video cards.
- Watch sidebar cards.
- Search result cards.
- Other normal video-card clusters that share the supported YouTube model.

Constraints:

- No persistent tint on normal video cards.
- Red is not used for YouTube atmosphere.
- Watch sidebar cards should use the same hover model as other cards unless a
  documented platform constraint requires otherwise.
- SPA navigation should not duplicate overlays or labels.

### Shorts adapter

The Shorts adapter owns fullscreen or near-fullscreen feed weather. Shorts is an
exception to card-hover-first behavior because the active viewport item is the
interaction unit.

Constraints:

- Ambient weather stays scoped to Shorts/fullscreen contexts.
- Page wash must not leak into the YouTube homepage, watch pages, or search
  results.
- Shorts behavior should not create a second card overlay model for normal
  YouTube cards.

### Reddit adapter

The Reddit adapter owns Reddit post and text-region discovery.

Constraints:

- Preserve native Reddit links, buttons, voting, menus, and comment controls.
- Do not let the generic adapter claim Reddit posts.
- Keep explanations lightweight and local.

### Generic web adapter

The generic adapter owns non-specialized pages such as articles, documentation,
ecommerce pages, and landing pages.

Constraints:

- Exit early on YouTube and Reddit.
- Prefer conservative candidate selection.
- Do not compete with platform adapters for the same node.
- Do not create page-wide tint by collecting too many candidates.

## Visual layer boundaries

### Hover card overlay

Primary v1 reveal. It should be applied to one hovered candidate at a time and
removed or hidden when hover ends.

### Micro-label

Small explanatory text for the current hover reveal. It should not become a
persistent badge grid or compete with native page labels.

### Page wash

Reserved for Shorts/fullscreen ambient mode and optional logo/page hover preview.
It is not a general browsing state.

## CSS cleanup checklist

Before adding any selector, verify:

- Which visual layer owns this rule?
- Is there an existing selector for the same state?
- Does this create persistent tint on a normal card?
- Does this apply to YouTube or Reddit through the generic path?
- Does this affect watch sidebar cards differently from the shared card model?
- Can an obsolete rule be removed instead of adding a new override?

## Manual validation matrix

| Surface | Expected result |
| --- | --- |
| YouTube homepage | Normal before hover; one hovered card reveals atmosphere. |
| YouTube watch sidebar | Normal before hover; sidebar cards do not keep persistent haze. |
| YouTube search results | Normal before hover; result hover uses shared card model. |
| YouTube Shorts | Ambient weather stays scoped to Shorts. |
| Reddit | Reddit interactions still work; generic adapter does not claim posts. |
| Generic article | Conservative candidates reveal only on hover. |
| Generic ecommerce/landing page | Promotional pressure can be indicated without page-wide wash. |

## PR discipline

Documentation cleanup PRs should only update source-of-truth docs and remove
obviously broken conflict markers if necessary. Product behavior, CSS effects,
and adapter rebuilds should happen in later focused PRs.
