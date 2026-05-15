# Tint

> Your browser shows you information.  
> Tint reveals atmosphere.

Tint is a tiny browser layer that shows the atmosphere of the page you are reading.

It does not judge truth.  
It does not block content.  
It does not send extension browsing content anywhere.

It gives you a live local atmosphere mix:

- **Neutral info** — functional, informational, context-forward
- **Attention-heavy** — urgent, stimulating, engagement-oriented
- **Synthetic rhythm** — templated, generic, optimization residue
- **Grounded pace** — restorative, human-paced, low pressure

Percentages are **atmosphere mix**, not truth probability.

---

## Why Tint exists

The internet learned how to optimize attention.

Tint helps people notice the shape of that optimization without turning the web into a warning surface.

It maps nervous-system effect and intent pressure, not morality, ideology, or worth.

Green does not mean “good.”  
Orange does not mean “bad.”  
Gray does not mean “fake.”

Tint does not decide for you.  
It gives you a small perceptual signal.

---

## Current MVP

The current clean MVP is intentionally simple:

- small ambient orb
- one-click page atmosphere panel
- live page-level percentages while browsing
- local heuristics only
- no backend
- no AI calls
- no analytics
- no content upload from the extension

The web demo also includes a public URL scan preview:

- user pastes a public URL
- server fetches readable public HTML
- Tint returns an atmosphere mix
- scanned URLs are not stored

The extension and the website scan are separate:

- **Extension** = local live atmosphere while browsing
- **Website scan** = user-triggered preview of a public URL

---

## Local extension install

1. Clone or download the repository.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extension folder.

---

## Local web demo

```bash
cd web
npm install
npm run dev
```

Then open:

```txt
http://localhost:3000
```

The web app includes:

- landing page
- atmosphere orb demo
- paste-URL scan
- `POST /api/scan`

---

## Product principles

Tint should feel:

- ambient
- subtle
- local
- reversible
- calm
- non-invasive

Tint should not feel like:

- a fact-checker
- a misinformation detector
- a scam scanner
- a toxicity meter
- parental control software
- a heatmap
- a dashboard

The default web page should still look like the web page.

---

## Privacy baseline

Tint v1 is local-first:

- no page content leaves the browser in extension mode
- no telemetry by default
- no remote model calls
- no user accounts
- no database required for the extension
- persisted state should stay minimal and user-legible

For the website scan, the user explicitly submits a public URL for preview. The scan endpoint fetches public HTML, extracts readable text, returns the atmosphere mix, and does not store the URL.

---

## Architecture

```text
Visible page text
  ↓
Local heuristic scoring
  ↓
Atmosphere mix
  ↓
Ambient orb + small panel
```

The web scan uses the same product language but runs server-side because browsers cannot reliably read arbitrary third-party pages from a landing page due to CORS.

For deeper implementation notes, see:

- `docs/ARCHITECTURE.md`
- `signals.js`
- `web/lib/atmosphere.js`

---

## Status

Experimental MVP.

Built to test one question:

> Can a browser show the atmosphere of the internet without judging it?

---

## License

MIT
