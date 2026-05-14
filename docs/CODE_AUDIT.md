# Tint v1 Implementation Audit

This document audits the current Tint implementation against the v1 architecture defined in `README.md` and `docs/ARCHITECTURE.md`.

This is an audit-only document.

No runtime behavior changes are included.
No CSS effects are added.
No adapter rebuilds are performed.

---

# A. Current implementation overview

## Current architecture shape

The current implementation is still largely organized as a single large content-script system inside `content.js` with CSS-driven rendering in `content.css`.

The code already contains the beginnings of a v1-style separation:

- YouTube-specific candidate collection.
- YouTube Shorts handling.
- Reddit-specific selectors.
- Generic article/content selectors.
- Shared atmosphere scoring.
- Shared visual overlay primitives.

However, most of the implementation still exists in one runtime surface rather than clearly isolated adapter modules.

## Core scoring-related areas

Current reusable scoring-related areas include:

- `ATM_COLORS`
- `ATM_RGB`
- `ATM_LABELS`
- `YOUTUBE_MICRO_LABELS`
- `scoreYouTubeCardAtmosphere`
- `scoreYouTubeRecommendationAtmosphere`
- signal heuristics in `signals.js`
- atmosphere token mapping logic

These appear structurally reusable for a v1 architecture.

## YouTube adapter areas

YouTube-specific logic currently includes:

- `YOUTUBE_THUMBNAIL_CLUSTER_SELECTORS`
- `YOUTUBE_WATCH_RECOMMENDATION_SELECTORS`
- `YOUTUBE_WATCH_RECOMMENDATION_CONTAINERS`
- `YOUTUBE_SHORTS_SELECTORS`
- `YOUTUBE_SHORTS_TITLE_SELECTORS`
- `collectVisibleYouTubeThumbnailClusters`
- `collectVisibleYouTubeWatchRecommendationCards`
- `isVisibleYouTubeThumbnailCluster`
- `isVisibleYouTubeWatchRecommendationCard`
- YouTube-specific hover labels
- YouTube-specific page wash behavior
- YouTube SPA navigation handling

The YouTube implementation is currently the most developed adapter.

## Shorts adapter areas

Shorts-specific behavior currently includes:

- `isYouTubeShortsPage`
- Shorts-only page wash CSS
- Shorts atmosphere animations
- Shorts fallback handling
- fullscreen ambient rendering behavior

The Shorts model already behaves differently from standard card hover behavior.

## Reddit adapter areas

Reddit-specific logic currently includes:

- `REDDIT_TITLE_SELECTORS`
- Reddit comment/title discovery
- Reddit-specific candidate collection
- Reddit comment edge glow CSS

Reddit behavior appears partially isolated but still shares large sections of common runtime flow.

## Generic or experimental areas

Potentially generic or experimental areas include:

- `CANDIDATE_SELECTORS`
- generic article/main selectors
- mixed shared candidate discovery
- generic text-bearing scanning
- page-level atmosphere primitives
- experimental watch-page logic
- debug counters and temporary diagnostic structures

These areas are the most likely source of future adapter conflicts.

---

# B. Keep

The following areas appear aligned with the Tint v1 architecture and should likely be preserved or refined rather than removed.

## Toggle and enabled state

The extension toggle system is simple and aligned with local-first behavior.

Keep:

- persistent enabled state
- local storage usage
- floating toggle model

## Core signal scoring

The reusable atmosphere scoring structure appears compatible with the v1 direction.

Keep:

- atmosphere token model
- local heuristic scoring
- signal mapping approach
- reusable atmosphere labels

## YouTube hover reveal model

The newer hover-only YouTube card atmosphere approach aligns with the v1 philosophy.

Keep:

- hover-only reveal behavior
- subtle local atmosphere overlays
- micro-label reveal on hover
- shared card hover model across homepage/search/sidebar where possible

## Shorts ambient mode

The Shorts fullscreen ambient weather concept is compatible with the documented v1 exception model.

Keep:

- fullscreen-only ambient behavior
- viewport-scoped page wash
- atmosphere animation model

## Reddit-specific handling

The Reddit adapter direction appears compatible with v1.

Keep:

- Reddit-specific candidate ownership
- lightweight overlays
- preservation of native interactions

---

# C. Remove or rewrite

The following areas appear stale, risky, duplicated, or inconsistent with the v1 architecture.

## Duplicate or overlapping overlay systems

The implementation currently mixes:

- `__tint-mark`
- `__tint-youtube-card`
- comment-specific overlays
- page wash systems
- hover overlays
- fullscreen ambient overlays

These layers overlap conceptually and need clearer ownership boundaries.

## Persistent tint paths

Some legacy behavior still appears oriented around persistent visible tinting rather than hover-only reveal.

This conflicts with the v1 rule that the page should remain visually normal by default.

## Watch-sidebar-specific atmospheric behavior

The codebase contains multiple watch-page and recommendation-specific branches.

These should eventually converge into one shared card-hover model unless platform constraints require otherwise.

## Page wash leakage risk

The page wash system is powerful and globally scoped.

There is elevated risk that:

- Shorts behavior leaks into standard YouTube pages.
- logo-preview wash leaks into unrelated states.
- future generic adapters accidentally activate page-level atmosphere.

## Generic adapter conflicts

The current generic candidate discovery path is mixed directly into shared runtime logic.

This risks:

- generic adapter claiming YouTube nodes
- generic adapter claiming Reddit nodes
- duplicate overlays
- repeated candidate scanning

## Debug and diagnostic code

The implementation includes temporary debugging infrastructure and diagnostics.

These should eventually be:

- gated behind explicit debug mode
- isolated into development tooling
- removed if unused

## Overlapping selector systems

There are many overlapping selectors across:

- YouTube card systems
- recommendation systems
- generic candidate systems
- text discovery systems

This increases maintenance complexity and makes ownership unclear.

---

# D. Adapter boundary problems

The current implementation still mixes multiple adapter responsibilities inside one large runtime surface.

## YouTube and generic logic coexist in shared candidate flow

`CANDIDATE_SELECTORS` mixes:

- Reddit selectors
- YouTube selectors
- generic article selectors

This weakens adapter isolation.

## Shared DOM scanning

The runtime performs broad DOM discovery and filtering rather than strict adapter-owned pipelines.

This increases the likelihood of:

- duplicate node ownership
- accidental generic fallback behavior
- selector drift

## Shared visual primitives with mixed ownership

The same CSS primitives are reused across:

- comments
- cards
- Shorts
- generic content
- page wash

This is efficient, but ownership boundaries are currently under-documented.

## Shorts still depends on shared global page-wash infrastructure

Shorts behavior currently modifies globally shared page-wash state.

This works technically but increases leakage risk.

---

# E. CSS source-of-truth problems

## `__tint-mark`

Purpose:

- generic atmospheric overlay primitive
- reusable base overlay behavior
- hover reveal infrastructure

Problem:

- acts as both a generic overlay layer and a platform-specific layer foundation
- overlaps conceptually with YouTube card rendering

## `__tint-youtube-card`

Purpose:

- YouTube-specific hover reveal model
- micro-label rendering
- local card atmosphere

Problem:

- partially duplicates responsibilities already present in `__tint-mark`

## `__tint-page-wash`

Purpose:

- fullscreen ambient weather
- logo-preview atmosphere

Problem:

- globally scoped
- multiple systems can potentially control it
- high leakage risk

## `__tint-card`

Purpose:

- floating explainability card
- click-based detail UI

Problem:

- current v1 direction is more hover-first and less explanation-card-heavy
- future role should be clarified

## Comment-specific overlay selectors

Purpose:

- lightweight Reddit/YouTube comment atmosphere

Problem:

- introduces additional visual-layer specialization
- may duplicate shared hover primitives

## Shorts animation layers

Purpose:

- fullscreen atmospheric weather

Problem:

- currently tightly coupled to the shared page-wash implementation

---

# F. Recommended refactor plan

Cleanup should proceed through small isolated PRs.

## 1. CSS deduplication only

Goal:

- identify overlapping overlay rules
- consolidate duplicate hover behavior
- remove obsolete competing selectors

No runtime behavior changes.

## 2. Adapter boundary cleanup

Goal:

- separate YouTube/Reddit/generic discovery paths
- reduce shared selector ownership
- isolate generic adapter behavior

## 3. YouTube hover model stabilization

Goal:

- ensure homepage/search/sidebar share one hover model
- eliminate stale watch-page-specific layering
- prevent persistent tint

## 4. Shorts isolation verification

Goal:

- verify Shorts page wash cannot leak into standard YouTube pages
- isolate fullscreen ambient ownership

## 5. Reddit isolation verification

Goal:

- ensure Reddit behavior remains self-contained
- prevent generic adapter overlap

## 6. Generic web adapter rebuild later

Goal:

- rebuild generic adapter conservatively from the v1 spec
- avoid aggressive DOM scanning
- ensure hover-only behavior

## 7. No runtime changes in this audit PR

This PR intentionally avoids:

- CSS behavior changes
- scoring changes
- selector rewrites
- architecture rewrites
- feature additions

## 8. Do not remove code yet

The current implementation still contains reusable work.

This audit should guide cleanup PRs rather than aggressively deleting behavior immediately.

## 9. Future PR discipline

Future PRs should:

- stay small
- isolate one architectural concern
- avoid stacked fixes
- avoid mixing cleanup with feature expansion
- validate behavior locally in Chrome before merge
