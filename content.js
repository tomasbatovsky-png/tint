/*
 * Tint — Content Script v0.1
 *
 * Responsibilities:
 *   1. Inject floating toggle (bottom-right)
 *   2. Read persisted toggle state from chrome.storage.local
 *   3. On enable: collect text-bearing elements, score them via Signals,
 *      apply atmospheric overlays with staggered reveal
 *   4. On click of a tinted element: show floating reason card
 *   5. On dynamic content: re-analyze new elements (debounced)
 *
 * No network. No DOM mutation outside our own UI + a few data attributes.
 */
(() => {
  if (window.__tintInjected) return;
  window.__tintInjected = true;

  const ATM_COLORS = {
    blue:   "rgb(118,162,196)",
    orange: "rgb(224,148,86)",
    red:    "rgb(178,80,76)",
    gray:   "rgb(162,166,170)"
  };
  const ATM_LABELS = {
    blue:   "Blue · Calm",
    orange: "Orange · Attention-optimized",
    red:    "Red · Coercive",
    gray:   "Gray · Synthetic"
  };

  let enabled = false;
  const marked = new Map(); // element -> { key, intensity }
  let toggleEl = null;
  let cardEl = null;

  /* ===== Toggle ===== */
  function createToggle() {
    toggleEl = document.createElement("button");
    toggleEl.id = "__tint-toggle";
    toggleEl.className = "__tint-switch";
    toggleEl.setAttribute("aria-pressed", "false");
    toggleEl.innerHTML = `
      <span class="__tint-track"><span class="__tint-thumb"></span></span>
      <span class="__tint-label">Tint</span>
    `;
    toggleEl.addEventListener("click", () => {
      enabled = !enabled;
      toggleEl.classList.toggle("on", enabled);
      toggleEl.setAttribute("aria-pressed", String(enabled));
      chrome.storage.local.set({ tintEnabled: enabled });
      if (enabled) enableTint();
      else disableTint();
    });
    document.body.appendChild(toggleEl);
  }

  /* ===== Reason card ===== */
  function createCard() {
    cardEl = document.createElement("div");
    cardEl.id = "__tint-card";
    cardEl.innerHTML = `
      <div class="__tint-card-head">
        <span class="__tint-card-swatch"></span>
        <span class="__tint-card-atm"></span>
      </div>
      <div class="__tint-card-name"></div>
      <div class="__tint-card-desc"></div>
      <div class="__tint-card-source">Tint detects observable patterns, not intent.</div>
    `;
    document.body.appendChild(cardEl);
  }

  function showCard(el) {
    const info = marked.get(el);
    if (!info) return;
    const signal = window.__Tint.Signals[info.key];
    if (!signal) return;

    cardEl.querySelector(".__tint-card-swatch").style.background = ATM_COLORS[signal.atm];
    cardEl.querySelector(".__tint-card-atm").textContent = ATM_LABELS[signal.atm];
    cardEl.querySelector(".__tint-card-name").textContent = signal.name;
    cardEl.querySelector(".__tint-card-desc").textContent = signal.desc;

    // Position relative to clicked element
    const rect = el.getBoundingClientRect();
    const cardWidth = 280;
    const margin = 16;

    let left = rect.right + 16;
    let top = rect.top + window.scrollY;

    if (left + cardWidth + margin > window.innerWidth) {
      left = rect.left - cardWidth - 16;
    }
    if (left < margin) {
      left = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, rect.left));
      top = rect.bottom + window.scrollY + 12;
    }

    cardEl.style.left = left + "px";
    cardEl.style.top = top + "px";
    cardEl.classList.add("show");
  }

  function hideCard() {
    if (cardEl) cardEl.classList.remove("show");
  }

  /* ===== Candidate selection =====
   * Strategy: pick text-bearing leaf-ish containers.
   * Reddit-specific selectors first, generic fallback after.
   */
  const CANDIDATE_SELECTORS = [
    // Reddit (new, web components emit content into slotted light DOM)
    'shreddit-post [slot="title"]',
    'shreddit-post [slot="text-body"]',
    'shreddit-comment [slot="comment"]',
    'shreddit-comment [slot="commentMeta"]',
    // Reddit (old)
    '.thing .title a.title',
    '.thing .usertext-body .md',
    '.commentarea .usertext-body .md',
    // Generic
    'article h1', 'article h2', 'article h3',
    'article p',
    'main h1', 'main h2',
    'main p',
    'blockquote',
    '[role="article"] p'
  ];

  function collectCandidates() {
    const set = new Set();
    for (const sel of CANDIDATE_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (el.closest("#__tint-toggle, #__tint-card")) return;
          if (el.classList.contains("__tint-mark")) return;
          const rect = el.getBoundingClientRect();
          if (rect.width < 60 || rect.height < 12) return;
          set.add(el);
        });
      } catch (e) { /* selector may not match on this site */ }
    }
    // Prefer leaves: drop elements that contain other collected elements
    const arr = [...set];
    const leaves = arr.filter(el => !arr.some(other => other !== el && el.contains(other)));
    return leaves;
  }

  /* ===== Analyze + apply ===== */
  function analyzeAndApply(stagger = true) {
    const candidates = collectCandidates();
    const fresh = [];

    for (const el of candidates) {
      const text = (el.innerText || el.textContent || "").trim();
      if (text.length < 20 || text.length > 6000) continue;

      const result = window.__Tint.detectStrongest(text);
      if (!result) continue;

      fresh.push({ el, ...result });
    }

    // Sort by document position for top-to-bottom reveal wave
    fresh.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    fresh.forEach((r, i) => applyMark(r, i, stagger));
  }

  function applyMark({ el, key, intensity }, idx, stagger) {
    const atm = window.__Tint.Signals[key].atm;
    el.classList.add("__tint-mark");
    el.dataset.tintColor = atm;
    el.style.setProperty("--tint-i", intensity.toFixed(2));
    if (stagger) {
      el.style.setProperty("--tint-reveal-delay", `${Math.min(idx * 60, 700)}ms`);
    } else {
      el.style.setProperty("--tint-reveal-delay", "0ms");
    }
    marked.set(el, { key, intensity });
  }

  function clearMarks() {
    marked.forEach((_, el) => {
      el.classList.remove("__tint-mark");
      delete el.dataset.tintColor;
      el.style.removeProperty("--tint-i");
      el.style.removeProperty("--tint-reveal-delay");
    });
    marked.clear();
  }

  /* ===== Enable / disable ===== */
  function enableTint() {
    document.body.classList.add("__tint-on");
    // Slight delay to let CSS pick up the class transition
    requestAnimationFrame(() => analyzeAndApply(true));
  }

  function disableTint() {
    document.body.classList.remove("__tint-on");
    hideCard();
    // Defer clearing marks so opacity transition can complete
    setTimeout(() => clearMarks(), 600);
  }

  /* ===== Click handling — non-intrusive =====
   * Links, buttons, inputs always work normally.
   * Plain-text click on a tinted element opens the reason card.
   */
  document.addEventListener("click", (e) => {
    if (!enabled) return;
    if (!cardEl) return;
    if (e.target.closest("#__tint-toggle") || e.target.closest("#__tint-card")) return;

    // Let interactive elements work normally
    if (e.target.closest('a, button, input, textarea, select, label, [role="button"], [role="link"], [role="textbox"]')) {
      hideCard();
      return;
    }

    const tinted = e.target.closest(".__tint-mark");
    if (!tinted) { hideCard(); return; }

    e.preventDefault();
    e.stopPropagation();
    showCard(tinted);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCard();
  });
  window.addEventListener("scroll", hideCard, { passive: true });
  window.addEventListener("resize", hideCard);

  /* ===== Dynamic content (infinite scroll, etc.) ===== */
  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      // Apply marks to newly-added candidates only; no stagger for incremental adds
      analyzeAndApply(false);
    }, 1200);
  });

  /* ===== Boot ===== */
  function boot() {
    createToggle();
    createCard();
    chrome.storage.local.get(["tintEnabled"], (result) => {
      if (result.tintEnabled) {
        enabled = true;
        toggleEl.classList.add("on");
        toggleEl.setAttribute("aria-pressed", "true");
        enableTint();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
