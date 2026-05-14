# Tint v1 — Product and Architecture Spec

Tint is a local-first Chrome extension that helps people sense the atmosphere of
attention systems without changing the web into a permanent warning surface.
Tint v1 is a reset around one clear rule: the default web page should still look
like the web page.

Tint maps nervous-system effect and intent pressure. It does not judge morality,
truth, ideology, or worth. It is not content moderation, a fact-checker, a scam
detector, or a heatmap. Tint should make pressure easier to notice while leaving
the user in charge of interpretation.

## Product philosophy

- **Map effect, not morality.** Green does not mean "good" and orange does not
  mean "bad." Tint describes likely felt pressure, pace, and density.
- **Do not moderate content.** Tint does not hide, rank, block, downrank, or
  rewrite posts, videos, comments, ads, or pages.
- **Do not create a heatmap.** Tint is not a page-wide diagnostic overlay where
  every region competes for attention.
- **Do not permanently recolor pages.** The normal website UI remains the default
  view. Atmosphere appears through hover, focused previews, or intentional
  ambient modes.
- **Keep the user oriented.** Effects should be local, subtle, reversible, and
  easy to ignore.
- **Prefer clarity over cleverness.** If an effect makes the product harder to
  explain or test, it does not belong in v1.

## Core interaction model

Tint v1 has a small interaction vocabulary. New behavior should fit one of these
modes before it is implemented.

| Mode | Where it applies | Expected behavior |
| --- | --- | --- |
| Default state | Normal browsing surfaces | The website appears untouched. No persistent tint on normal cards. |
| Card hover | Supported feed cards and content blocks | Hovering one eligible element reveals a local atmospheric overlay and, where appropriate, a micro-label. |
| Logo/page hover preview | Optional page-level preview entry point | Hovering the Tint control or logo may show a subtle temporary page preview. |
| Shorts/fullscreen feed | YouTube Shorts or similar immersive feeds | A restrained ambient weather mode may reflect the current item because the whole viewport is the card. |

Rules for all modes:

- No persistent tint on normal cards.
- No aggressive blur.
- No visual spam.
- No competing overlays on the same element.
- No page wash except for Shorts/fullscreen ambient mode or an explicit
  logo/page hover preview.
- Hover reveals atmosphere only for the hovered element unless the user is in an
  intentional ambient mode.

## Color meaning

Tint colors describe attention atmosphere, not moral value.

| Color | Meaning | v1 notes |
| --- | --- | --- |
| Green | Grounded, restorative, human-paced | Slower pacing, lower pressure, more reflective cues. |
| Blue | Neutral, informational, explanatory | Practical or context-forward material without strong pressure. |
| Orange | Attention-heavy, urgent, conversion-oriented | High activation, urgency, engagement hooks, promotional pressure. |
| Gray | Synthetic, templated, AI-slop rhythm | Generic cadence, low-density filler, SEO/listicle patterns, automated feel. |
| Red | Reserved for future explainability outside YouTube | Red is not used on YouTube in v1. It may be considered later for explicit non-YouTube explainability, not ambient card tinting. |

Opacity may express intensity, but intensity must remain subtle enough that the
underlying site stays usable and recognizable.

## Architecture overview

Tint v1 is organized as a local scoring engine, isolated platform adapters, and a
small set of visual layers.

```text
Page DOM
  ↓
Platform adapter
  ↓
Core scoring engine
  ↓
Atmosphere token: green | blue | orange | gray | reserved-red
  ↓
Visual layer: hover card overlay | micro-label | limited page wash
```

### Core scoring engine

The core scoring engine evaluates local, observable signals from visible page
content and metadata. It should be deterministic, local, inspectable, and easy to
adjust. It must not require a backend, telemetry, or remote model calls for v1.

The engine should return a compact atmosphere decision that adapters can apply
without knowing scoring internals.

### Platform adapters

Adapters own site-specific DOM discovery and must remain isolated from one
another.

- **YouTube adapter:** identifies YouTube video cards, search results, watch
  sidebar cards, and supported metadata without using generic web selectors as a
  fallback on YouTube.
- **Shorts adapter:** treats Shorts/fullscreen feeds as ambient viewport contexts
  rather than normal cards.
- **Reddit adapter:** identifies Reddit posts and supported text regions while
  preserving native Reddit interactions.
- **Generic web adapter:** handles ordinary articles, landing pages, ecommerce
  pages, and other non-specialized surfaces. It must not override YouTube or
  Reddit behavior.

Adapter rules:

- One adapter should own a given element.
- Generic matching must exit early on supported first-party adapters such as
  YouTube and Reddit.
- Adapter-specific selectors should be grouped and documented.
- SPA navigation should trigger re-evaluation without duplicating classes or
  layers.

### Visual layers

Tint v1 has three visual layer types:

1. **Hover card overlay** — the primary local reveal for cards and content
   blocks.
2. **Micro-label** — a small label that names the atmosphere when a hover reveal
   needs explanation.
3. **Page wash** — a limited ambient layer used only for Shorts/fullscreen feed
   weather or an explicit logo/page hover preview.

Each visual layer needs one source of truth in CSS and one ownership path in the
content script. Avoid stacking multiple historical implementations of the same
idea.

For a deeper implementation map, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## CSS rules

CSS cleanup is part of the v1 reset. The stylesheet should make it obvious which
rule owns each visual layer.

- Keep one source of truth per visual layer.
- Do not keep duplicate or competing selectors for the same element state.
- Remove old watch-card-specific haze layers instead of patching around them.
- Do not add persistent watch/sidebar tint.
- Do not add persistent normal-card tint.
- Do not add new CSS blocks without removing obsolete ones for the same job.
- Share one hover-only card model where possible.
- Keep page wash styles isolated to Shorts/fullscreen ambient mode and optional
  logo/page hover preview.
- Prefer class names that describe the layer and state rather than a specific
  experiment.

## Testing checklist

Static checks are not enough for Tint. Every visual change needs local extension
validation in Chrome.

### Manual browser surfaces

- YouTube homepage.
- YouTube watch sidebar.
- YouTube search results.
- YouTube Shorts.
- Reddit.
- Generic article page.
- Generic ecommerce or landing page.

### Console and DOM checks

- YouTube cards receive the expected Tint class.
- Generic web candidates receive the expected Tint class.
- YouTube and Reddit elements are not claimed by the generic adapter.
- Default UI remains visually normal before hover.
- Hover reveals atmosphere only on the hovered element.
- Shorts/fullscreen ambient mode does not leak page wash into normal YouTube
  pages.
- SPA navigation does not duplicate overlays, labels, or classes.

## Development workflow

- New product ideas start as issues before implementation.
- Codex opens focused PRs that match the issue scope.
- Do not continue feature work in cleanup PRs.
- Do not add new product behavior while rewriting docs or architecture notes.
- Do not add new CSS effects while cleaning up old CSS.
- Static checks are useful but insufficient.
- The Chrome extension must be tested locally before merge.
- Do not merge without local browser validation.
- Avoid stacking fixes on top of unclear behavior.
- Prefer cleanup or refactor when the same bug repeats.
- If an adapter conflict appears, isolate ownership instead of broadening generic
  selectors.

## Audit: known cleanup risks

Tint v1 cleanup should explicitly look for these risks before product work
continues:

- Overlapping CSS layers.
- Stale watch sidebar selectors.
- Generic adapter conflicts.
- Page wash overuse.
- Duplicate class names.
- YouTube SPA navigation edge cases.
- Manifest permission changes.
- Temporary debug styles or console output.
- Competing hover and ambient models on the same surface.

## Privacy baseline

Tint v1 remains local-first:

- No page content should leave the browser.
- No analytics or telemetry should be added by default.
- No remote model calls are part of v1.
- Persisted state should stay minimal and user-legible.

## Current implementation status

This repository is being reset around the v1 spec above. Existing code may still
contain experimental layers, duplicate selectors, or adapter overlap. Treat this
README and the architecture note as the source of truth for cleanup decisions
before adding new behavior.
