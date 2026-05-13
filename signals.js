/*
 * Tint — Local Signal Engine v0.1
 *
 * Each signal exposes a detect(text) function that returns a score in [0, 1].
 * Heuristics are intentionally conservative. Below 0.25 = no overlay.
 *
 * All detection is structural / linguistic pattern matching.
 * No AI. No external calls. No content leaves the browser.
 *
 * Signals are starting heuristics, not truth. Fork the weights and disagree.
 */
(() => {
  // Helper: count regex matches without capturing
  function count(text, regex) {
    return (text.match(regex) || []).length;
  }

  const Signals = {
    /* ============================================================
     * OUTRAGE AMPLIFICATION  (orange)
     * Stacks emotional intensifiers, capitalization, share triggers.
     * ============================================================ */
    outrage_amplification: {
      name: "outrage amplification",
      atm: "orange",
      desc: "Dense emotional intensifiers. Designed to activate.",
      detect(text) {
        const tokens = text.split(/\s+/).filter(Boolean);
        const n = tokens.length;
        if (n < 6) return 0;

        let score = 0;

        // ALL-CAPS words longer than 3 chars (avoid acronyms like USA, NBA)
        const capsWords = tokens.filter(w => /^[A-Z]{4,}[!.?]?$/.test(w)).length;
        score += Math.min((capsWords / n) * 6, 0.45);

        // Outrage / activation keywords
        const outrageRe = /\b(disgusting|outrageous|shocking|horrible|unbelievable|unacceptable|insane|absurd|terrifying|infuriating|despicable|appalling)\b/gi;
        score += Math.min(count(text, outrageRe) * 0.12, 0.35);

        // Share-triggering imperatives
        const shareRe = /\b(share this|spread the word|don't let this get buried|everyone needs to see|wake up)\b/gi;
        score += Math.min(count(text, shareRe) * 0.18, 0.3);

        // Exclamation density (normalized per ~20 words)
        const exclaims = count(text, /!/g);
        score += Math.min((exclaims / Math.max(n / 20, 1)) * 0.12, 0.18);

        return Math.min(score, 1);
      }
    },

    /* ============================================================
     * TRIBAL SIGNALING  (orange)
     * Group identification cues, in/out framing.
     * ============================================================ */
    tribal_signaling: {
      name: "tribal signaling",
      atm: "orange",
      desc: "We/them framing. In-group identification cue.",
      detect(text) {
        const tokens = text.split(/\s+/).filter(Boolean);
        if (tokens.length < 6) return 0;

        let score = 0;

        // We/us + they/them in close proximity
        if (/\b(we|us|our)\b[^.!?]{0,80}\b(they|them|their|those people)\b/i.test(text)) score += 0.3;
        if (/\b(they|them|their)\b[^.!?]{0,80}\b(we|us|our)\b/i.test(text)) score += 0.2;

        // Tribal markers
        const markers = /\b(sheep|sheeple|normies|the mainstream|the elites?|wake up people|they're laughing at us|don't even get me started)\b/gi;
        score += Math.min(count(text, markers) * 0.22, 0.45);

        // "Real / true X" identity claims
        if (/\b(real|true)\s+(americans?|patriots?|believers?|fans?|men|women|christians?|conservatives?|liberals?)\b/i.test(text)) score += 0.2;

        // Pre-emptive attacks on dissenters
        if (/\b(everyone|every single person)\s+(defending|supporting|agreeing with)\b/i.test(text)) score += 0.22;

        return Math.min(score, 1);
      }
    },

    /* ============================================================
     * URGENCY CASCADE  (red)
     * Time-pressure mechanisms designed to disrupt deliberation.
     * ============================================================ */
    urgency_cascade: {
      name: "urgency cascade",
      atm: "red",
      desc: "Stacked time-pressure cues. Panic-induction mechanism.",
      detect(text) {
        let score = 0;

        // Live countdown with seconds (HH:MM:SS or MM:SS)
        if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(text) && /expir|ends?|left|remain|hurr|until/i.test(text)) score += 0.4;

        // Expiration framing
        if (/\b(expires?|ends?|deadline)\b[^.!?]{0,40}\b(in|today|tonight|soon|midnight)\b/i.test(text)) score += 0.25;

        // Scarcity cues
        if (/\bonly\s+\d+\s+(left|spots?|seats?|remaining|available)\b/i.test(text)) score += 0.3;
        if (/\b(limited time|while supplies last|going fast|selling out)\b/i.test(text)) score += 0.2;

        // Imperative urgency
        if (/\b(act now|buy now|hurry|don'?t (miss|wait)|before it'?s gone|last chance)\b/i.test(text)) score += 0.22;

        // Live viewer count manipulation
        if (/\b\d+\s+(people|users?|customers?)\s+(viewing|watching|looking at)\s+(this|right now)/i.test(text)) score += 0.25;

        return Math.min(score, 1);
      }
    },

    /* ============================================================
     * SYNTHETIC CADENCE  (gray)
     * Template-driven prose. Hallmark of generated / SEO content.
     * ============================================================ */
    synthetic_cadence: {
      name: "synthetic cadence",
      atm: "gray",
      desc: "Filler-dense prose. Template-driven structure.",
      detect(text) {
        const tokens = text.split(/\s+/).filter(Boolean);
        if (tokens.length < 12) return 0;

        let score = 0;
        let hits = 0;

        const fillers = [
          /\bin today'?s (fast-paced|digital|modern|ever-changing) world\b/i,
          /\bmore important than ever\b/i,
          /\bgame[- ]?changer\b/i,
          /\bwhether you'?re an? [^.]{0,40}, [^.]{0,40}, or\b/i,
          /\blet'?s dive (in|into)\b/i,
          /\bwithout further ado\b/i,
          /\bcomprehensive guide\b/i,
          /\bproven (methodologies|strategies|methods|techniques)\b/i,
          /\bunlock (the )?(secret|potential|power)\b/i,
          /\b(based on|backed by) extensive research\b/i,
          /\bswear by\b/i,
          /\bat the end of the day\b/i,
          /\btake (your|it) to the next level\b/i,
          /\bthe ultimate (guide|list|breakdown)\b/i,
          /\bin this article,?\s*we'?ll\b/i
        ];

        for (const re of fillers) if (re.test(text)) hits++;
        score += Math.min(hits * 0.15, 0.65);

        // SEO listicle title pattern
        if (/^\s*\d+\s+\w+.{0,60}(20\d{2})\s*$/i.test(text)) score += 0.25;

        // Generic authority cue
        if (/\bsuccessful (people|leaders|ce[oa]s|entrepreneurs)\b/i.test(text)) score += 0.1;

        return Math.min(score, 1);
      }
    },

    /* ============================================================
     * ATTENTION ACCELERATION  (orange)
     * Engagement metrics, reaction-as-content, fragmentation cues.
     * ============================================================ */
    attention_acceleration: {
      name: "attention acceleration",
      atm: "orange",
      desc: "Engagement cues compete for focus. Reaction becomes content.",
      detect(text) {
        let score = 0;

        // Numeric engagement signals
        if (/\b\d+[kKmM]?\s*(upvotes?|likes?|points?|shares?|reactions?)\b/i.test(text)) score += 0.2;
        if (/\b\d+[kKmM]?\s*comments?\b/i.test(text)) score += 0.15;
        if (/\b\d+[kKmM]?\s*(viewing|watching)\b/i.test(text)) score += 0.25;

        // Trending / virality cues
        if (/\b(trending now|going viral|blowing up|hot take|breaking)\b/i.test(text)) score += 0.2;

        // Curiosity-gap headline shape
        if (/\byou\s+won'?t\s+believe\b/i.test(text)) score += 0.25;
        if (/\bthis\s+(one\s+)?(trick|thing|reason)\b/i.test(text)) score += 0.15;
        if (/\bwhat\s+happened\s+next\b/i.test(text)) score += 0.2;

        // Reaction shaping
        if (/\b(internet|twitter|reddit)\s+is\s+(losing|going|on fire)\b/i.test(text)) score += 0.18;

        return Math.min(score, 1);
      }
    }
  };

  /**
   * Detect strongest signal for a given text block.
   * Returns { key, intensity } or null.
   */
  function detectStrongest(text) {
    let best = null;
    let bestScore = 0;
    for (const [key, signal] of Object.entries(Signals)) {
      const score = signal.detect(text);
      if (score > bestScore) {
        bestScore = score;
        best = { key, intensity: score };
      }
    }
    if (bestScore < 0.25) return null;
    return best;
  }

  // Expose to content script
  window.__Tint = { Signals, detectStrongest };
})();
