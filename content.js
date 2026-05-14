/*
 * Tint v2 alpha — text-first universal runtime
 *
 * Goal:
 * - classify visible text/context blocks
 * - apply subtle hover-only text hints
 * - avoid thumbnail/card/page-wide effects
 * - keep boot, toggle, cleanup simple
 */

(() => {
  const ROOT_ID = "__tint-v2-toggle";
  const SCANNED_ATTR = "data-tint-v2-scanned";
  const OWNED_SELECTOR = ".__tint-v2-text";

  const ATM_RGB = {
    green: "82, 146, 105",
    blue: "118, 162, 196",
    orange: "224, 148, 86",
    gray: "162, 166, 170"
  };

  const ATM_LABELS = {
    green: "grounded",
    blue: "neutral",
    orange: "attention-heavy",
    gray: "synthetic"
  };

  let enabled = false;
  let toggleEl = null;
  let scanTimer = null;
  let observer = null;

  function getSignals() {
    return window.__Tint?.Signals || {};
  }

  function createToggle() {
    document.getElementById(ROOT_ID)?.remove();

    toggleEl = document.createElement("button");
    toggleEl.id = ROOT_ID;
    toggleEl.type = "button";
    toggleEl.setAttribute("aria-pressed", "false");
    toggleEl.innerHTML = `
      <span class="__tint-v2-switch"><span></span></span>
      <span class="__tint-v2-label">Tint</span>
    `;

    toggleEl.addEventListener("click", () => {
      enabled = !enabled;
      syncToggle();
      chrome.storage.local.set({ tintEnabled: enabled });

      if (enabled) {
        scanVisibleText();
        startObserver();
      } else {
        cleanupAll();
        stopObserver();
      }
    });

    document.documentElement.appendChild(toggleEl);
    syncToggle();
  }

  function syncToggle() {
    if (!toggleEl) return;
    toggleEl.classList.toggle("on", enabled);
    toggleEl.setAttribute("aria-pressed", String(enabled));
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 10) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;

    return true;
  }

  function isBadCandidate(el) {
    if (!el || !el.tagName) return true;

    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "path", "img", "video", "canvas", "input", "textarea", "select"].includes(tag)) {
      return true;
    }

    if (el.closest(`#${ROOT_ID}`)) return true;
    if (el.closest("[contenteditable='true']")) return true;
    if (el.closest("nav, header, footer")) return true;

    return false;
  }

  function getText(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isUsefulText(text) {
    if (!text) return false;
    if (text.length < 18) return false;
    if (text.length > 420) return false;
    if (/^[\d\s.,:;|/\\\-–—+]+$/.test(text)) return false;
    return true;
  }

  function isTextBlock(el) {
    const tag = el.tagName.toLowerCase();

    if (["h1", "h2", "h3", "h4", "p", "li", "blockquote", "figcaption", "button"].includes(tag)) {
      return true;
    }

    if (tag === "a") return true;

    if (el.matches?.(
      [
        "#video-title",
        "yt-formatted-string",
        "ytd-comment-view-model #content-text",
        "ytd-comment-renderer #content-text",
        "[class*='title']",
        "[class*='headline']",
        "[class*='description']",
        "[class*='comment']",
        "[class*='cta']"
      ].join(",")
    )) {
      return true;
    }

    return false;
  }

  function collectCandidates() {
    const selector = [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "li",
      "blockquote",
      "figcaption",
      "a",
      "button",
      "#video-title",
      "yt-formatted-string",
      "ytd-comment-view-model #content-text",
      "ytd-comment-renderer #content-text",
      "[class*='title']",
      "[class*='headline']",
      "[class*='description']",
      "[class*='comment']",
      "[class*='cta']"
    ].join(",");

    return [...document.querySelectorAll(selector)]
      .filter(el => !isBadCandidate(el))
      .filter(isVisible)
      .filter(isTextBlock)
      .filter(el => isUsefulText(getText(el)))
      .slice(0, 160);
  }

  function countTerms(text, terms) {
    const lower = text.toLowerCase();
    let count = 0;
    for (const term of terms) {
      if (lower.includes(String(term).toLowerCase())) count += 1;
    }
    return count;
  }

  function scoreText(text) {
    const signals = getSignals();

    const scores = {
      green: 0,
      blue: 0,
      orange: 0,
      gray: 0
    };

    for (const signal of Object.values(signals)) {
      if (!signal || !signal.atm) continue;

      const atm = signal.atm === "red" ? "orange" : signal.atm;
      if (!scores.hasOwnProperty(atm)) continue;

      const terms = [
        ...(signal.terms || []),
        ...(signal.positive || []),
        ...(signal.negative || []),
        ...(signal.patterns || [])
      ];

      const hits = countTerms(text, terms);
      if (hits > 0) {
        scores[atm] += hits * Number(signal.weight || 1);
      }
    }

    if (/\b(shocking|secret|truth|you won't believe|urgent|breaking|exposed|must see)\b/i.test(text)) scores.orange += 2;
    if (/\b(guide|how to|learn|explained|review|overview|tutorial)\b/i.test(text)) scores.blue += 1.2;
    if (/\b(calm|slow|nature|garden|human|local|community|rest|simple)\b/i.test(text)) scores.green += 1.4;
    if (/\b(ai generated|template|automated|generic|spam|copy paste)\b/i.test(text)) scores.gray += 1.8;

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [atm, score] = ranked[0];

    if (!score || score < 1) return null;

    return {
      atm,
      intensity: Math.min(1, 0.22 + score * 0.08),
      label: ATM_LABELS[atm]
    };
  }

  function applyTint(el, result) {
    if (!enabled || !el || !result) return;

    el.classList.add("__tint-v2-text");
    el.dataset.tintV2Atm = result.atm;
    el.dataset.tintV2Label = result.label;
    el.style.setProperty("--tint-v2-c", ATM_RGB[result.atm] || ATM_RGB.blue);
    el.style.setProperty("--tint-v2-i", result.intensity.toFixed(2));
  }

  function scanVisibleText() {
    if (!enabled) return;

    const candidates = collectCandidates();

    for (const el of candidates) {
      if (!enabled) return;
      if (el.getAttribute(SCANNED_ATTR) === "1") continue;

      el.setAttribute(SCANNED_ATTR, "1");

      const result = scoreText(getText(el));
      if (!result) continue;

      applyTint(el, result);
    }
  }

  function cleanupAll() {
    clearTimeout(scanTimer);
    scanTimer = null;

    document.querySelectorAll(OWNED_SELECTOR).forEach(el => {
      el.classList.remove("__tint-v2-text");
      delete el.dataset.tintV2Atm;
      delete el.dataset.tintV2Label;
      el.style.removeProperty("--tint-v2-c");
      el.style.removeProperty("--tint-v2-i");
    });

    document.querySelectorAll(`[${SCANNED_ATTR}]`).forEach(el => {
      el.removeAttribute(SCANNED_ATTR);
    });
  }

  function scheduleScan(delay = 350) {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanVisibleText();
    }, delay);
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      scheduleScan(600);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function boot() {
    createToggle();

    chrome.storage.local.get(["tintEnabled"], result => {
      enabled = Boolean(result.tintEnabled);
      syncToggle();

      if (enabled) {
        cleanupAll();
        scanVisibleText();
        startObserver();
      } else {
        cleanupAll();
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