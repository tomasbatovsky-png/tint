/*
 * Tint Clean MVP
 *
 * A text-first perceptual layer for the web.
 * Local rules first. Optional API later.
 */

(() => {
  const API_ENDPOINT = "";
  const TOGGLE_ID = "__tint_clean_toggle";
  const OWNED_CLASS = "__tint_clean_text";
  const SCANNED_ATTR = "data-tint-clean-scanned";

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
    toggle.innerHTML = '<span class="tint-clean-dot"></span><span class="tint-clean-word">Tint</span>';
    toggle.setAttribute("aria-pressed", "false");

    toggle.addEventListener("click", () => {
      enabled = !enabled;
      chrome.storage.local.set({ tintCleanEnabled: enabled });
      syncToggle();

      if (enabled) {
        cleanup();
        scan();
        startObserver();
      } else {
        stopObserver();
        cleanup();
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
    if (rect.bottom < 0 || rect.top > innerHeight) return false;
    return true;
  }

  function isBlocked(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "path", "img", "video", "canvas", "input", "textarea", "select"].includes(tag)) return true;
    if (el.closest(`#${TOGGLE_ID}`)) return true;
    if (el.closest("[contenteditable='true']")) return true;
    if (el.closest("pre, code")) return true;
    return false;
  }

  function isUseful(text) {
    if (!text) return false;
    if (text.length < 12) return false;
    if (text.length > 360) return false;
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
        const key = item.text.slice(0, 120);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 80);
  }

  function has(text, words) {
    const lower = text.toLowerCase();
    return words.some(word => lower.includes(word));
  }

  function add(scores, atmosphere, amount) {
    scores[atmosphere] += amount;
  }

  function localAnalyze(text) {
    const scores = { green: 0, blue: 0, orange: 0, gray: 0, violet: 0 };

    if (has(text, ["urgent", "breaking", "shocking", "secret", "exposed", "warning", "danger", "must see", "you won't believe", "insane", "crazy", "viral", "panic", "scam", "hidden truth", "destroyed", "collapse", "last chance"])) add(scores, "orange", 3);
    if (has(text, ["how to", "guide", "tutorial", "explained", "analysis", "review", "overview", "documentation", "manual", "case study", "comparison", "learn", "what is", "why", "step by step", "course", "lesson"])) add(scores, "blue", 2.4);
    if (has(text, ["calm", "slow", "nature", "garden", "community", "local", "human", "honest", "family", "care", "repair", "forest", "home", "simple", "peaceful", "grounded", "natural", "rest", "craft"])) add(scores, "green", 2.6);
    if (has(text, ["ai generated", "automated", "template", "generic", "spam", "copy paste", "faceless", "mass produced", "bot", "synthetic", "auto-generated"])) add(scores, "gray", 2.7);
    if (has(text, ["premium", "exclusive", "luxury", "elite", "status", "success", "dream", "transform", "become", "unlock", "level up", "high performance", "limited offer", "join now", "masterclass", "personal brand"])) add(scores, "violet", 2.5);

    if (/[!?]{2,}/.test(text)) add(scores, "orange", 0.8);
    if (/\b(buy now|subscribe|sign up|get started|claim|download|try free)\b/i.test(text)) add(scores, "violet", 1.2);
    if (/\b(data|report|study|research|price|features|specification)\b/i.test(text)) add(scores, "blue", 1.1);

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [atmosphere, score] = ranked[0];

    if (!score) {
      return { atmosphere: "blue", confidence: 0.18, label: "low signal" };
    }

    return {
      atmosphere,
      confidence: Math.min(0.95, 0.32 + score * 0.13),
      label: LABELS[atmosphere]
    };
  }

  async function analyzeBatch(blocks) {
    if (!API_ENDPOINT) {
      return blocks.map(block => ({ id: block.id, ...localAnalyze(block.text) }));
    }

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocks: blocks.map(({ id, text }) => ({ id, text })) })
      });
      if (!response.ok) throw new Error(`Tint API ${response.status}`);
      const json = await response.json();
      return Array.isArray(json.results) ? json.results : [];
    } catch (error) {
      console.warn("[Tint] API failed, falling back to local rules", error);
      return blocks.map(block => ({ id: block.id, ...localAnalyze(block.text) }));
    }
  }

  function applyTint(el, result) {
    if (!enabled || !el || !result) return;

    const atmosphere = result.atmosphere || "blue";
    const confidence = Math.max(0.08, Math.min(1, Number(result.confidence || 0.2)));

    el.classList.add(OWNED_CLASS);
    el.dataset.tintAtmosphere = atmosphere;
    el.dataset.tintLabel = result.label || LABELS[atmosphere] || "signal";
    el.style.setProperty("--tint-clean-rgb", COLORS[atmosphere] || COLORS.blue);
    el.style.setProperty("--tint-clean-i", confidence.toFixed(2));
  }

  async function scan() {
    if (!enabled) return;

    const candidates = collectTextBlocks().filter(({ el }) => el.getAttribute(SCANNED_ATTR) !== "1");
    if (!candidates.length) return;

    const blocks = candidates.map((item, index) => ({
      id: `b${Date.now()}_${index}`,
      text: item.text,
      el: item.el
    }));

    blocks.forEach(block => block.el.setAttribute(SCANNED_ATTR, "1"));

    const results = await analyzeBatch(blocks);
    const byId = new Map(results.map(result => [result.id, result]));

    for (const block of blocks) {
      if (!enabled) return;
      applyTint(block.el, byId.get(block.id));
    }
  }

  function cleanup() {
    clearTimeout(scanTimer);
    scanTimer = null;

    document.querySelectorAll(`.${OWNED_CLASS}`).forEach(el => {
      el.classList.remove(OWNED_CLASS);
      delete el.dataset.tintAtmosphere;
      delete el.dataset.tintLabel;
      el.style.removeProperty("--tint-clean-rgb");
      el.style.removeProperty("--tint-clean-i");
    });

    document.querySelectorAll(`[${SCANNED_ATTR}]`).forEach(el => el.removeAttribute(SCANNED_ATTR));
  }

  function scheduleScan(delay = 400) {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, delay);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scheduleScan(700));
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
        cleanup();
        scan();
        startObserver();
      } else {
        cleanup();
        stopObserver();
      }
    });

    window.addEventListener("scroll", () => scheduleScan(500), { passive: true });
    window.addEventListener("resize", () => scheduleScan(500), { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
