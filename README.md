# Tint — Chrome Extension (MVP v0.1)

> The internet learned how to optimize human attention.
> Tint lets humans see it.

Tint is a perceptual layer for the internet. It detects observable structural
and linguistic patterns on web pages and visualizes them as subtle atmospheric
overlays. It does **not** assert truth, intent, or ideology — it observes
patterns.

All analysis runs locally in your browser. No content is sent to any server.
No API calls. No AI.

---

## Install (developer mode)

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `tint-extension` folder
5. Open Reddit (or any matched site) in a new tab
6. Click the floating **Tint** toggle in the bottom-right corner of the page

The toggle state persists across page loads and tabs (via `chrome.storage.local`).

---

## What you'll see

When Tint is **on**, certain text blocks will gain a soft atmospheric overlay:

| Color  | Atmosphere               | Feeling                                |
|--------|--------------------------|----------------------------------------|
| Blue   | Calm · Human             | "This space feels human."              |
| Orange | Attention-optimized      | "This space wants my nervous system."  |
| Red    | Coercive pressure        | "Something here is trying to control me." |
| Gray   | Synthetic sludge         | "Nothing real exists here."            |

Hue tells you the atmosphere type. Opacity tells you intensity.

Click any tinted block to see a small reason card explaining which signal
fired and why.

---

## Signals (v0.1)

| Signal                   | Atmosphere | Detects                                          |
|--------------------------|------------|--------------------------------------------------|
| outrage amplification    | orange     | ALL-CAPS density, outrage keywords, share triggers |
| tribal signaling         | orange     | we/them framing, in-group markers                |
| attention acceleration   | orange     | engagement metrics, curiosity gap headlines      |
| urgency cascade          | red        | live countdowns, scarcity cues, urgency imperatives |
| synthetic cadence        | gray       | SEO templates, filler phrases, listicle titles   |

Each signal is a small JavaScript function in `signals.js`. The thresholds and
patterns are open and forkable.

---

## File structure

```
tint-extension/
├── manifest.json    Manifest V3 declaration
├── content.js       Content script: toggle, overlays, reason card, MutationObserver
├── signals.js       Local heuristics engine — five signal detectors
├── content.css      Atmospheric overlay styles (radial gradient haze + Apple-style switch)
├── signals.json     The constitution — public, forkable signal definitions
└── README.md        This file
```

---

## Site coverage (v0.1)

- `reddit.com`, `www.reddit.com`, `new.reddit.com`, `old.reddit.com`

Other sites can be added by editing `manifest.json` → `content_scripts.matches`.

---

## Known limitations

- **Heuristics are starting weights, not calibrated.** Expect tuning before public release.
- **No shadow DOM piercing.** Slotted content (Reddit web components) works.
  Sites that hide content in closed shadow trees won't be analyzed.
- **No backend means no LLM-level subtlety.** Tint v0.1 catches obvious
  patterns. Subtler manipulation requires Layer 2 (linguistic model), which is
  out of scope for this MVP.
- **False positives on highly stylized but legitimate copy** (Stripe, Apple
  landing pages, etc.). Threshold is conservative to minimize this, but it can
  still happen.

---

## Philosophy

Tint is not a truth engine. Tint is not a scam detector. Tint is not a
political filter.

Tint is a perceptual instrument. Browsers render HTML. Tint renders
atmosphere.

The user remains in charge. We show patterns. They decide what to do.

---

## Privacy

- No network requests.
- No content read from the page leaves the browser.
- The only persisted state is a single boolean (`tintEnabled`) in
  `chrome.storage.local`.
- No analytics, no telemetry.

You can verify all of the above by reading the source — it is ~400 lines.

---

## Development notes

- Built for Chrome Manifest V3.
- No build step. All files are plain `.js` / `.css` / `.json`.
- Content script runs at `document_idle` to avoid competing with page render.
- Re-analysis on dynamic content is debounced (1.2s) and incremental — already
  tinted elements are not re-processed.
- Click handler is non-intrusive: links, buttons, inputs always work normally.
  The reason card only opens on click of *plain text* inside a tinted block.

---

## License

MIT (planned). Open source. Fork the weights.
