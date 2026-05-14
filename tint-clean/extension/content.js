/*
 * Tint Clean MVP
 *
 * Page-level perceptual signal dot.
 * The text is used for analysis, but the page itself is not tinted.
 */

(() => {
  const API_ENDPOINT = "";
  const TOGGLE_ID = "__tint_clean_toggle";
  const DOT_ID = "__tint_clean_signal";
  const PANEL_ID = "__tint_clean_panel";

  const COLORS = {
    green: "82, 146, 105",
    blue: "118, 162, 196",
    orange: "224, 148, 86",
    gray: "150, 154, 160",
    violet: "142, 105, 185"
  };

  const LABELS = {
    green: "grounded",
    blue: "informational",
    orange: "attention pressure",
    gray: "synthetic",
    violet: "aspiration"
  };

  let enabled = false;
  let toggle = null;
  let dot = null;
  let panel = null;
  let scanTimer = null;
  let observer = null;

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function createToggle() {
    document.getElementById(TOGGLE_ID)?.remove();

    toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.type = "button";
    toggle.innerHTML = '<span class="tint-clean-toggle-dot"></span><span class="tint-clean-word">Tint</span>';
    toggle.setAttribute("aria-pressed", "false");

    toggle.addEventListener("click", () => {
      enabled = !enabled;
      chrome.storage.local.set({ tintCleanEnabled: enabled });
      syncToggle();

      if (enabled) {
        analyzePage();
        startObserver();
      } else {
        stopObserver();
        clearSignal();
      }
    });

    document.documentElement.appendChild(toggle);
    syncToggle();
  }

  function syncToggle() {
    if (!toggle) return;
    toggle.classList.toggle("on", enabled);
    toggle.setAttribute("aria-pressed", String(enabled));
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 10) return false;
    if (rect.bottom < -400 || rect.top > innerHeight + 900) return false;
    return true;
  }

  function isBlocked(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "path", "img", "video", "canvas", "input", "textarea", "select"].includes(tag)) return true;
    if (el.closest(`#${TOGGLE_ID}, #${DOT_ID}, #${PANEL_ID}`)) return true;
    if (el.closest("[contenteditable='true'], pre, code")) return true;
    return false;
  }

  function isUseful(text) {
    if (!text) return false;
    if (text.length < 12) return false;
    if (text.length > 700) return false;
    if (/^[\d\s.,:;|/\\\-–—+%€$£()]+$/.test(text)) return false;
    return true;
  }

  function collectTextBlocks() {
    const selector = [
      "h1", "h2", "h3", "h4",
      "p", "li", "blockquote", "figcaption",
      "a", "button", "[role='button']",
      "[class*='title']", "[class*='headline']", "[class*='description']",
      "[class*='comment']", "[class*='review']", "[class*='cta']",
      "[id*='title']", "[id*='description']",
      "#video-title", "yt-formatted-string",
      "ytd-comment-view-model #content-text", "ytd-comment-renderer #content-text"
    ].join(",");

    const seen = new Set();

    return [...document.querySelectorAll(selector)]
      .filter(el => !isBlocked(el))
      .filter(isVisible)
      .map(el => ({ el, text: normalize(el.innerText || el.textContent) }))
      .filter(item => isUseful(item.text))
      .filter(item => {
        const key = item.text.slice(0, 160);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 120);
  }

  function has(text, words) {
    const lower = text.toLowerCase();
    return words.some(word => lower.includes(word));
  }

  function add(scores, atmosphere, amount) {
    scores[atmosphere] += amount;
  }

  function scoreText(text) {
    const scores = { green: 0, blue: 0, orange: 0, gray: 0, violet: 0 };

    if (has(text, ["urgent", "breaking", "shocking", "secret", "exposed", "warning", "danger", "must see", "you won't believe", "insane", "crazy", "viral", "panic", "scam", "hidden truth", "destroyed", "collapse", "last chance", "forbidden", "banned", "revealed", "brutal", "risk", "threat", "crisis", "war", "attack", "controversy", "outrage", "drama", "worst", "never do this"])) add(scores, "orange", 3.2);
    if (has(text, ["how to", "guide", "tutorial", "explained", "analysis", "review", "overview", "documentation", "manual", "case study", "comparison", "learn", "what is", "why", "step by step", "course", "lesson", "report", "study", "data", "research", "statistics", "market", "price", "features", "details"])) add(scores, "blue", 2.0);
    if (has(text, ["calm", "slow", "nature", "garden", "community", "local", "human", "honest", "family", "care", "repair", "forest", "home", "simple", "peaceful", "grounded", "natural", "rest", "craft", "traditional", "healthy", "sustainable", "trust", "personal story"])) add(scores, "green", 2.7);
    if (has(text, ["ai generated", "automated", "template", "generic", "spam", "copy paste", "faceless", "mass produced", "bot", "synthetic", "auto-generated", "generated", "placeholder", "stock photo", "fake", "affiliate", "programmatic"])) add(scores, "gray", 2.8);
    if (has(text, ["premium", "exclusive", "luxury", "elite", "status", "success", "dream", "transform", "become", "unlock", "level up", "high performance", "limited offer", "join now", "masterclass", "personal brand", "best", "profit", "rare", "collection", "upgrade", "pro", "winning", "growth", "freedom", "lifestyle"])) add(scores, "violet", 2.7);

    if (/[!?]{2,}/.test(text)) add(scores, "orange", 0.8);
    if (/\b(buy now|subscribe|sign up|get started|claim|download|try free)\b/i.test(text)) add(scores, "violet", 1.2);
    if (/\b(data|report|study|research|price|features|specification)\b/i.test(text)) add(scores, "blue", 1.1);

    return scores;
  }

  function summarize(scores, blockCount) {
    const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [primary, primaryScore] = ranked[0];
    const [secondary, secondaryScore] = ranked[1];

    if (!blockCount || !total || primaryScore < 1) {
      return {
        primary: "blue",
        secondary: null,
        confidence: 0.14,
        label: "low signal",
        summary: "weak visible pressure",
        scores
      };
    }

    const confidence = Math.min(0.96, Math.max(0.25, primaryScore / Math.max(total, 1)));
    const includeSecondary = secondaryScore > 0 && secondaryScore >= primaryScore * 0.45;
    const mix = includeSecondary ? `${LABELS[primary]} + ${LABELS[secondary]}` : LABELS[primary];

    return {
      primary,
      secondary: includeSecondary ? secondary : null,
      confidence,
      label: mix,
      summary: includeSecondary ? `Mostly ${LABELS[primary]}, with ${LABELS[secondary]}.` : `Mostly ${LABELS[primary]}.`,
      scores
    };
  }

  function combineScores(blocks) {
    const totals = { green: 0, blue: 0, orange: 0, gray: 0, violet: 0 };

    for (const block of blocks) {
      const scores = scoreText(block.text);
      const weight = Math.min(2.2, Math.max(0.7, block.text.length / 90));
      for (const key of Object.keys(totals)) {
        totals[key] += scores[key] * weight;
      }
    }

    return summarize(totals, blocks.length);
  }

  function clearSignal() {
    clearTimeout(scanTimer);
    scanTimer = null;
    dot?.remove();
    panel?.remove();
    dot = null;
    panel = null;
  }

  function createSignal(result) {
    clearSignal();
    if (!enabled || !result) return;

    dot = document.createElement("button");
    dot.id = DOT_ID;
    dot.type = "button";
    dot.setAttribute("aria-label", "Tint page signal");
    dot.style.setProperty("--tint-primary", COLORS[result.primary] || COLORS.blue);
    dot.style.setProperty("--tint-secondary", COLORS[result.secondary] || COLORS[result.primary] || COLORS.blue);
    dot.classList.toggle("mixed", Boolean(result.secondary));

    dot.addEventListener("click", () => {
      panel?.classList.toggle("show");
    });

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="tint-clean-panel-title">${escapeHtml(result.label)}</div>
      <div class="tint-clean-panel-copy">${escapeHtml(result.summary)}</div>
    `;

    document.documentElement.appendChild(dot);
    document.documentElement.appendChild(panel);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;"
    }[char]));
  }

  async function analyzePage() {
    if (!enabled) return;
    const blocks = collectTextBlocks();
    const result = combineScores(blocks);
    createSignal(result);
  }

  function scheduleAnalyze(delay = 500) {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      analyzePage();
    }, delay);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scheduleAnalyze(900));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function boot() {
    createToggle();

    chrome.storage.local.get(["tintCleanEnabled"], result => {
      enabled = Boolean(result.tintCleanEnabled);
      syncToggle();
      if (enabled) {
        analyzePage();
        startObserver();
      } else {
        stopObserver();
        clearSignal();
      }
    });

    window.addEventListener("scroll", () => scheduleAnalyze(700), { passive: true });
    window.addEventListener("resize", () => scheduleAnalyze(700), { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
