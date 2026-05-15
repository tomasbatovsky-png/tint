# Tint Web

Minimal landing page and public URL atmosphere preview for Tint.

## Run locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## URL scan

The scan endpoint is:

```txt
POST /api/scan
```

Input:

```json
{ "url": "https://example.com" }
```

Output:

```json
{
  "summary": "Mostly neutral info. Slightly synthetic rhythm.",
  "mix": {
    "neutralInfo": 43,
    "attentionHeavy": 18,
    "syntheticRhythm": 30,
    "groundedPace": 9
  },
  "note": "Atmosphere mix, not truth probability."
}
```

## Notes

- No AI calls.
- No database.
- No accounts.
- No stored scanned URLs.
- Server-side scan is separate from the browser extension.
- Extension mode stays local while browsing.
