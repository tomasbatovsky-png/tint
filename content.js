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
    green:  "rgb(82,146,105)",
    blue:   "rgb(118,162,196)",
    orange: "rgb(224,148,86)",
    gray:   "rgb(162,166,170)"
  };
  const ATM_RGB = {
    green:  "82, 146, 105",
    blue:   "118, 162, 196",
    orange: "224, 148, 86",
    gray:   "162, 166, 170"
  };
  const ATM_LABELS = {
    green:  "Green · Grounded / restorative / human-paced",
    blue:   "Blue · Neutral / informational / functional",
    orange: "Orange · Attention-active / stimulation-heavy",
    gray:   "Gray · Synthetic / templated"
  };
  const YOUTUBE_MICRO_LABELS = {
    green: "grounded pace",
    blue: "neutral info",
    orange: "attention-heavy",
    gray: "synthetic rhythm"
  };
  const TINT_DEBUG = false;

  function debugTint(...args) {
    if (TINT_DEBUG) console.log("[Tint]", ...args);
  }

  let enabled = false;
  const marked = new Map(); // element -> { key, intensity }
  let toggleEl = null;
  let cardEl = null;
  let pageWashEl = null;

  /* ============================================================
   * CORE UI / TOGGLE LIFECYCLE
   * Owns the floating Tint switch, persisted enabled state, and enable/disable entrypoint.
   * ============================================================ */
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

  /* ============================================================
   * EXPLANATION UI / REASON CARD
   * Owns the optional floating explanation card for eligible marked elements.
   * ============================================================ */
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

  /* ============================================================
   * PAGE WASH LIFECYCLE
   * Shared visual primitive used only by explicit ambient owners such as
   * YouTube logo preview and Shorts. Keep activation/cleanup isolated.
   * ============================================================ */
  function ensurePageWash() {
    if (pageWashEl && pageWashEl.isConnected) return pageWashEl;

    pageWashEl = document.getElementById("__tint-page-wash");
    if (!pageWashEl) {
      pageWashEl = document.createElement("div");
      pageWashEl.id = "__tint-page-wash";
      pageWashEl.setAttribute("aria-hidden", "true");
    }
    if (pageWashEl.parentNode !== document.body) document.body.appendChild(pageWashEl);
    return pageWashEl;
  }

  function createPageWash() {
    ensurePageWash();
  }

  function showCard(el) {
    const info = marked.get(el);
    if (!info || !info.cardEligible) return;
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

  /* ============================================================
   * CANDIDATE DISCOVERY / ADAPTER ENTRYPOINTS
   * Collects text-bearing candidates. Platform-specific ownership should
   * stay explicit so generic scanning does not override YouTube or Reddit.
   * ============================================================ */

  /* ===== Candidate selection =====
   * Strategy: pick text-bearing leaf-ish containers.
   * Reddit-specific selectors first, generic fallback after.
   */
  const CANDIDATE_SELECTORS = [
    // Reddit (current)
    'shreddit-post a[slot="title"]',
    'shreddit-post [slot="title"]',
    'shreddit-post [id^="post-title"]',
    'shreddit-post h1, shreddit-post h2, shreddit-post h3',
    'shreddit-post [slot="text-body"]',
    'shreddit-post [data-post-click-location="title"]',
    'shreddit-post [data-testid="post-title"]',
    'shreddit-comment [slot="comment"]',
    'shreddit-comment [slot="commentMeta"]',
    'shreddit-comment div[id$="-comment-rtjson-content"]',
    // Reddit (recent React views)
    '[data-testid="post-container"] h1',
    '[data-testid="post-container"] h2',
    '[data-testid="post-container"] h3',
    '[data-testid="post-container"] p',
    '[data-testid="comment"] p',
    '[data-click-id="body"]',
    '[data-adclicklocation="title"]',
    'a[data-click-id="body"]',
    'a[data-testid="post-title"]',
    // Reddit (old)
    '.thing.link a.title',
    '.thing .title a.title',
    '.thing .usertext-body .md',
    '.commentarea .usertext-body .md',
    '.sitetable .thing .entry > .title',
    // YouTube
    'ytd-comment-thread-renderer #content-text',
    'ytd-comment-view-model #content-text',
    'ytd-comment-renderer #content-text',
    '#content-text',
    'yt-formatted-string#content-text',
    'ytd-video-primary-info-renderer h1',
    'h1.title',
    'ytd-watch-metadata h1',
    // Generic
    'article h1', 'article h2', 'article h3',
    'article p',
    'main h1', 'main h2',
    'main p',
    'blockquote',
    '[role="article"] h1', '[role="article"] h2', '[role="article"] h3',
    '[role="article"] p'
  ];

  const YOUTUBE_COMMENT_SELECTORS = [
    'ytd-comment-thread-renderer #content-text',
    'ytd-comment-view-model #content-text',
    'ytd-comment-renderer #content-text',
    'yt-formatted-string#content-text',
    '#content-text'
  ];

  const YOUTUBE_THUMBNAIL_CLUSTER_SELECTORS = [
    "ytd-rich-grid-media",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-playlist-renderer",
    "ytd-radio-renderer",
    "ytd-channel-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model"
  ];

  const YOUTUBE_WATCH_RECOMMENDATION_SELECTORS = [
    "ytd-compact-video-renderer",
    "ytd-compact-radio-renderer",
    "ytd-compact-playlist-renderer"
  ];

  const YOUTUBE_WATCH_RECOMMENDATION_CONTAINERS = [
    "ytd-compact-video-renderer",
    "ytd-compact-radio-renderer",
    "ytd-compact-playlist-renderer"
  ];

  const YOUTUBE_CARD_SELECTOR = [
    ...YOUTUBE_THUMBNAIL_CLUSTER_SELECTORS,
    ...YOUTUBE_WATCH_RECOMMENDATION_CONTAINERS
  ].join(",");

  const YOUTUBE_SHORTS_SELECTORS = [
    "ytd-reel-video-renderer",
    "ytd-shorts",
    "ytd-reel-item-renderer"
  ];

  const YOUTUBE_SHORTS_TITLE_SELECTORS = [
    "ytd-reel-player-overlay-renderer #video-title",
    "ytd-reel-player-overlay-renderer h1",
    "ytd-reel-player-overlay-renderer h2",
    "ytd-reel-player-overlay-renderer [id*=title i]",
    "ytd-shorts-video-title-view-model",
    "yt-formatted-string#video-title",
    "yt-formatted-string[title]",
    "[aria-label][role=heading]",
    "[title]"
  ];

  const YOUTUBE_SHORTS_METADATA_SELECTORS = [
    "ytd-reel-player-overlay-renderer",
    "ytd-reel-player-header-renderer",
    "ytd-reel-video-description-renderer",
    "ytd-video-owner-renderer",
    "ytd-channel-name",
    "#metadata",
    "#description",
    "[id*=metadata i]",
    "[class*=metadata i]",
    "[class*=metapanel i]",
    "[aria-label]"
  ];

  const REDDIT_TITLE_SELECTORS = [
    'shreddit-post a[slot="title"]',
    'shreddit-post [slot="title"]',
    'shreddit-post [id^="post-title"]',
    'shreddit-post h1, shreddit-post h2, shreddit-post h3',
    'shreddit-post [data-post-click-location="title"]',
    'shreddit-post [data-testid="post-title"]',
    '[data-testid="post-container"] h1',
    '[data-testid="post-container"] h2',
    '[data-testid="post-container"] h3',
    '[data-adclicklocation="title"]',
    'a[data-click-id="body"]',
    'a[data-testid="post-title"]',
    '.thing.link a.title',
    '.thing .title a.title',
    '.sitetable .thing .entry > .title'
  ];

  /* ============================================================
   * PLATFORM DETECTION
   * Routes behavior into Reddit, YouTube, Shorts, watch, and search surfaces.
   * ============================================================ */
  function isRedditPage() {
    return /(^|\.)reddit\.com$/i.test(window.location.hostname);
  }

  function isYouTubePage() {
    return /(^|\.)youtube\.com$/i.test(window.location.hostname);
  }

  function isYouTubeShortsPage() {
    return isYouTubePage() && /(^|\/)shorts(\/|$)/i.test(window.location.pathname);
  }

  function isYouTubeWatchPage() {
    return isYouTubePage() && window.location.pathname === "/watch";
  }

  function isYouTubeSearchPage() {
    return isYouTubePage() && window.location.pathname === "/results";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hasUsableText(el, minLength = 8) {
    const text = (el.innerText || el.textContent || "").trim();
    return text.length >= minLength && text.length <= 6000;
  }

  function isVisibleCandidate(el) {
    if (el.closest("#__tint-toggle, #__tint-card")) return false;
    if (el.classList.contains("__tint-mark")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 12) return false;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight + 2400) return false;
    return hasUsableText(el);
  }

  function addSelectorMatches(selectors, set) {
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (isVisibleCandidate(el)) set.add(el);
        });
      } catch (e) { /* selector may not match on this site */ }
    }
  }

  function collectCandidates() {
    const set = new Set();
    addSelectorMatches(CANDIDATE_SELECTORS, set);
    // Prefer leaves: drop elements that contain other collected elements
    const arr = [...set];
    const leaves = arr.filter(el => !arr.some(other => other !== el && el.contains(other)));
    return leaves;
  }

  function collectTopVisibleRedditTitles(limit = 8) {
    const set = new Set();
    addSelectorMatches(REDDIT_TITLE_SELECTORS, set);
    return collectTopVisible(set, limit);
  }

  function collectTopVisibleYouTubeComments(limit = 8) {
    const set = new Set();
    addSelectorMatches(YOUTUBE_COMMENT_SELECTORS, set);
    const comments = new Set(
      [...set].filter(el => el.closest("ytd-comment-thread-renderer, ytd-comment-view-model, ytd-comment-renderer"))
    );
    return collectTopVisible(comments, limit);
  }

  function collectVisibleYouTubeThumbnailClusters(limit = 24) {
    const clusters = new Set();

    for (const sel of YOUTUBE_THUMBNAIL_CLUSTER_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => {
        if (isVisibleYouTubeThumbnailCluster(el)) clusters.add(el);
      });
    }

    return sortYouTubeCardsByScreenPosition(
      dedupeNestedYouTubeCards([...clusters]).filter(isVisibleYouTubeThumbnailCluster)
    ).slice(0, limit);
  }

  function collectVisibleYouTubeWatchRecommendationCards(limit = 36) {
    const cards = new Set();

    for (const sel of YOUTUBE_WATCH_RECOMMENDATION_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const card = findNearestVisibleYouTubeWatchRecommendationContainer(el);
          if (card) cards.add(card);
        });
      } catch (e) { /* selector may not match on this YouTube surface */ }
    }

    return sortYouTubeCardsByScreenPosition(
      dedupeNestedYouTubeWatchRecommendationCards([...cards])
        .filter(isVisibleYouTubeWatchRecommendationCard)
    ).slice(0, limit);
  }

  function isVisibleYouTubeThumbnailCluster(el) {
    const thumb = el.querySelector("#thumbnail, a#thumbnail, ytd-thumbnail, yt-thumbnail-view-model, .yt-thumbnail-view-model, #avatar, yt-img-shadow#avatar");
    if (!thumb) return false;

    const rect = el.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight && rect.width >= 160 && rect.height >= 80;
    const minThumbWidth = el.matches("ytd-channel-renderer") ? 40 : 80;
    const minThumbHeight = el.matches("ytd-channel-renderer") ? 40 : 45;
    const thumbVisible = thumbRect.width >= minThumbWidth && thumbRect.height >= minThumbHeight;
    return isVisible && thumbVisible;
  }

  function findNearestVisibleYouTubeWatchRecommendationContainer(el) {
    if (!el || !isVisibleYouTubeWatchRecommendationNode(el)) return null;
    if (!el.closest("ytd-watch-next-secondary-results-renderer, #secondary-inner, #secondary, #related")) return null;

    const containerSelector = YOUTUBE_WATCH_RECOMMENDATION_CONTAINERS.join(",");
    let card = el.closest(containerSelector);

    if (card && card.matches("ytd-item-section-renderer")) {
      const childCard = [...card.querySelectorAll(containerSelector)]
        .find(child => child !== card && isVisibleYouTubeWatchRecommendationCard(child));
      if (childCard) card = childCard;
    }

    if (card && isVisibleYouTubeWatchRecommendationCard(card)) return card;
    return null;
  }

  function dedupeNestedYouTubeWatchRecommendationCards(cards) {
    return cards.filter(card => {
      return !cards.some(other => {
        if (other === card || !card.contains(other)) return false;
        return getYouTubeRecommendationContainerRank(other) <= getYouTubeRecommendationContainerRank(card);
      });
    });
  }

  function getYouTubeRecommendationContainerRank(el) {
    if (!el) return 99;
    if (el.matches("ytd-compact-video-renderer, ytd-compact-radio-renderer, ytd-compact-playlist-renderer")) return 1;
    return 3;
  }

  function dedupeNestedYouTubeCards(cards) {
    return cards.filter(card => {
      return !cards.some(other => {
        if (other === card || !card.contains(other)) return false;
        return getYouTubeCardRank(other) <= getYouTubeCardRank(card);
      });
    });
  }

  function getYouTubeCardRank(el) {
    if (!el) return 99;
    if (el.matches("ytd-video-renderer, ytd-playlist-renderer, ytd-radio-renderer, ytd-channel-renderer")) return 1;
    if (el.matches("ytd-rich-grid-media, ytd-grid-video-renderer")) return 1;
    if (el.matches("ytd-rich-item-renderer")) return 2;
    if (el.matches("yt-lockup-view-model")) return 3;
    return 4;
  }

  function isVisibleYouTubeWatchRecommendationNode(el) {
    if (!el || el.closest("template, script, style, noscript, #__tint-toggle, #__tint-card, #__tint-page-wash")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight + 1200 || rect.right <= 0 || rect.left >= window.innerWidth) return false;

    for (let node = el; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      if (node.tagName === "TEMPLATE") return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (node.matches("ytd-watch-next-secondary-results-renderer, #secondary-inner, #secondary, #related, body")) break;
    }

    return true;
  }

  function isVisibleYouTubeWatchRecommendationCard(el) {
    if (!el || !el.matches(YOUTUBE_WATCH_RECOMMENDATION_CONTAINERS.join(","))) return false;
    if (!el.closest("ytd-watch-next-secondary-results-renderer, #secondary-inner, #secondary, #related")) return false;
    if (!isVisibleYouTubeWatchRecommendationNode(el)) return false;

    const thumb = el.querySelector("#thumbnail, a#thumbnail, ytd-thumbnail, yt-thumbnail-view-model, .yt-thumbnail-view-model");
    const title = el.querySelector("#video-title, yt-formatted-string#video-title, [aria-label], [title]");
    const rect = el.getBoundingClientRect();
    const thumbRect = thumb ? thumb.getBoundingClientRect() : null;
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight + 1200 && rect.right > 0 && rect.left < window.innerWidth;
    const cardSized = rect.width >= 140 && rect.height >= 40;
    const thumbVisible = thumbRect ? thumbRect.width >= 48 && thumbRect.height >= 27 && isVisibleYouTubeWatchRecommendationNode(thumb) : true;

    return isVisible && cardSized && thumbVisible && (hasUsableText(el, 4) || Boolean(title));
  }

  function sortYouTubeCardsByScreenPosition(cards) {
    return cards.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return (aRect.top - bRect.top) || (aRect.left - bRect.left);
    });
  }

  function getYouTubeClusterText(el) {
    const parts = [el.innerText || el.textContent || ""];
    el.querySelectorAll("[aria-label], [title], [alt]").forEach(node => {
      parts.push(node.getAttribute("aria-label") || "");
      parts.push(node.getAttribute("title") || "");
      parts.push(node.getAttribute("alt") || "");
    });
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function getElementOwnMetadataText(el) {
    if (!el) return "";
    const parts = [
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.getAttribute("alt") || ""
    ];
    const text = (el.innerText || el.textContent || "").trim();
    if (text) parts.push(text);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function getVisibleTextFromNode(root, maxNodes = 36) {
    if (!root) return "";
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (parts.length >= maxNodes) return NodeFilter.FILTER_REJECT;
        if (node.closest("#__tint-toggle, #__tint-card, #__tint-page-wash")) return NodeFilter.FILTER_REJECT;
        const tag = node.tagName;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH"].includes(tag)) return NodeFilter.FILTER_REJECT;
        const rect = node.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= window.innerHeight) return NodeFilter.FILTER_SKIP;
        const style = window.getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return NodeFilter.FILTER_REJECT;
        const text = getElementOwnMetadataText(node);
        if (text.length < 2) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode() && parts.length < maxNodes) {
      const text = getElementOwnMetadataText(walker.currentNode);
      if (text) parts.push(text);
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function countYouTubeTerms(text, patterns) {
    return patterns.reduce((sum, item) => {
      const re = Array.isArray(item) ? item[0] : item;
      const weight = Array.isArray(item) ? item[1] : 1;
      return sum + (re.test(text) ? weight : 0);
    }, 0);
  }

  function getYouTubeAtmosphereResult(scores, { grayMinimum = 0.01, minimum = 0.01 } = {}) {
    const adjusted = { ...scores };
    if (adjusted.gray > 0 && adjusted.gray < grayMinimum) adjusted.gray = 0;

    const ranked = Object.entries(adjusted).sort((a, b) => b[1] - a[1]);
    const [atm, dominant] = ranked[0];
    const support = ranked.slice(1).reduce((sum, [, score]) => sum + score, 0);

    if (dominant < minimum) return null;

    const intensity = clamp(0.42 + dominant * 0.07 + Math.min(support, 2) * 0.015, 0.42, 0.78);
    return { atm, intensity, label: YOUTUBE_MICRO_LABELS[atm], scores };
  }

  /* ============================================================
   * YOUTUBE SCORING
   * Local heuristic scoring for YouTube cards and recommendations.
   * Do not mix cleanup/refactor work with scoring changes.
   * ============================================================ */
  function scoreYouTubeCardAtmosphere(text) {
    const scores = {
      green: countYouTubeTerms(text, [
        [/\b(grounded|calm|calming|relaxing|restorative|peaceful|quiet|gentle|slow|slow[- ]?living|sleep|study|focus|meditation|mindful|breathing|ambient|nature|forest|rain|ocean|orchestra|classical|documentary)\b/i, 1],
        [/\b(music for sleep|sleep music|nature sounds|ambient music|walking tour|slow documentary|calm conversation|long[- ]?form thoughtful|soft spoken)\b/i, 1.25]
      ]),
      blue: countYouTubeTerms(text, [
        [/\b(tutorial|how to|how-to|guide|review|lecture|explanation|explained|technical|informational|educational|course|lesson|walkthrough|analysis|demo|documentation|setup|install|repair|learn|beginner'?s guide)\b/i, 1],
        [/\b(what is|why does|history of|introduction to|step by step|for beginners)\b/i, 1]
      ]),
      orange: countYouTubeTerms(text, [
        [/\b(shocking|insane|viral|urgency|urgent|breaking|reaction|reacts?|drama|challenge|prank|extreme|exposed|must watch|you won'?t believe|goes wrong|grindset|dopamine|live trading|day trading|trading live|money hype|make money fast|millionaire|before it'?s gone)\b/i, 1],
        [/\b(LIVE|premiere|sponsored|ad)\b/, 0.75],
        [/\b\d+[kKmM]?\s*(watching|views?|likes?)\b/i, 0.5]
      ]),
      gray: countYouTubeTerms(text, [
        [/\b(ultimate guide|best tips|productivity hacks?|life hacks?|top \d+|secrets? to|faceless|automation|passive income|cash cow|copy and paste|generated by ai|ai generated|chatgpt|content farm)\b/i, 1],
        [/\b(in today'?s (fast-paced|digital|modern|ever-changing) world|game[- ]?changer|unlock (the )?(secret|potential|power)|take (your|it) to the next level|without further ado|let'?s dive in|emotionally flat)\b/i, 1]
      ])
    };

    return getYouTubeAtmosphereResult(scores);
  }

  function scoreYouTubeRecommendationAtmosphere(text) {
    const scores = {
      green: countYouTubeTerms(text, [
        [/\b(grounded|calm|calming|relaxing|restorative|peaceful|quiet|gentle|slow|slow[- ]?living|sleep|study|focus|meditation|mindful|breathing|ambient|nature|forest|rain|ocean|orchestra|classical|documentary|conversation|podcast|interview|talk|discussion)\b/i, 1],
        [/\b(music for sleep|sleep music|nature sounds|ambient music|walking tour|slow documentary|calm conversation|long[- ]?form thoughtful|soft spoken|fireside chat|oral history|field notes|studio visit)\b/i, 1.25],
        [/\b(full conversation|in conversation with|talks with|quiet vlog|day in the life|behind the scenes)\b/i, 0.75]
      ]),
      blue: countYouTubeTerms(text, [
        [/\b(tutorial|how to|how-to|guide|review|lecture|explanation|explained|explainer|technical|informational|educational|course|lesson|walkthrough|analysis|demo|documentation|setup|install|repair|learn|beginner'?s guide|documentary)\b/i, 1],
        [/\b(what is|what are|why does|why do|how does|how do|history of|introduction to|intro to|step by step|for beginners|basics|101|deep dive|case study|breakdown)\b/i, 1],
        [/\b(build|make|fix|restore|cook|bake|draw|paint|photograph|edit|code|program|sew|knit|garden|woodwork|welding|3d print|diy)\b/i, 0.55],
        [/\b(camera|guitar|piano|bicycle|bike|car repair|home lab|linux|python|javascript|excel|photoshop|blender|obsidian|notion|fitness form|recipe)\b/i, 0.45]
      ]),
      orange: countYouTubeTerms(text, [
        [/\b(shocking|insane|viral|urgency|urgent|breaking|reaction|reacts?|drama|challenge|prank|extreme|exposed|must watch|you won'?t believe|goes wrong|grindset|dopamine|live trading|day trading|trading live|money hype|make money fast|millionaire|before it'?s gone)\b/i, 1],
        [/\b(LIVE|premiere|sponsored|ad)\b/, 0.75],
        [/\b\d+[kKmM]?\s*(watching|views?|likes?)\b/i, 0.35]
      ]),
      gray: countYouTubeTerms(text, [
        [/\b(faceless|automation|passive income|cash cow|copy and paste|generated by ai|ai generated|chatgpt|content farm|ai voice|text to speech)\b/i, 1],
        [/\b(ultimate guide|best tips|productivity hacks?|life hacks?|top \d+|secrets? to)\b/i, 0.65],
        [/\b(in today'?s (fast-paced|digital|modern|ever-changing) world|game[- ]?changer|unlock (the )?(secret|potential|power)|take (your|it) to the next level|without further ado|let'?s dive in|emotionally flat)\b/i, 0.75]
      ])
    };

    const result = getYouTubeAtmosphereResult(scores, { grayMinimum: 1.35, minimum: 0.45 });
    if (result) return result;

    const informationalFallback = countYouTubeTerms(text, [
      [/\b(how|why|what|when|where)\b.{0,80}\b(works?|happens?|means?|made|built|started|changed|explained)\b/i, 1],
      [/\b(learn|understand|explaining|explained|history|documentary|lesson|course|tutorial|beginner|beginners|walkthrough|repair|setup|install)\b/i, 1],
      [/\b(the story of|a history of|guide to|intro to|introduction to|step by step|from scratch)\b/i, 1],
      [/\b(diy|woodworking|gardening|cooking|recipe|photography|drawing|painting|music theory|language learning|home lab|coding|programming)\b/i, 0.8]
    ]);

    if (informationalFallback >= 1) {
      return {
        atm: "blue",
        intensity: 0.42,
        label: YOUTUBE_MICRO_LABELS.blue,
        scores: { ...scores, blue: Math.max(scores.blue, 0.45) }
      };
    }

    return null;
  }

  function countMatches(text, regex) {
    return (text.match(regex) || []).length;
  }

  function scoreFinanceDensity(text) {
    const hits = countMatches(text, /\b(stocks?|shares?|market|nasdaq|s&p|dow|crypto|bitcoin|btc|ethereum|eth|altcoin|trading|trader|trade|options?|calls?|puts?|short squeeze|bullish|bearish|portfolio|dividend|earnings|forex|futures|yield|inflation|recession|fed|rate cuts?)\b/gi);
    if (!hits) return 0;
    const words = Math.max(8, text.split(/\s+/).filter(Boolean).length);
    return clamp((hits / words) * 2.4 + Math.min(hits * 0.08, 0.32), 0, 1);
  }

  function updateYouTubePageAtmosphere() {
    if (!enabled || !isYouTubePage()) return;
    ensurePageWash();

    const shorts = getVisibleYouTubeShortsAtmosphere();
    if (shorts) {
      applyYouTubeShortsAtmosphere(shorts);
      return;
    }

    clearYouTubePageAtmosphere();
  }

  function getVisibleYouTubeShortsAtmosphere({ debug = false } = {}) {
    if (!isYouTubeShortsPage() && !document.querySelector("ytd-reel-video-renderer[is-active], ytd-reel-video-renderer, ytd-shorts")) return null;

    const renderers = collectVisibleYouTubeShortsRenderers();
    if (debug) debugTint("shorts renderers", renderers.length);

    if (!renderers.length) {
      if (isYouTubeShortsPage()) {
        if (debug) {
          debugTint('shorts active title ""');
          debugTint('shorts active metadata "fallback fullscreen atmosphere"');
          debugTint("shorts atmosphere orange");
        }
        return { atm: "orange", intensity: 0.42, opacity: 0.035, fallback: true, scores: { green: 0, blue: 0, orange: 1, gray: 0 } };
      }
      return null;
    }

    const active = renderers[0];
    const title = getYouTubeShortsTitle(active);
    const metadata = getYouTubeShortsMetadata(active);
    const visibleText = getVisibleTextFromNode(active);
    const text = [title, metadata, visibleText, getYouTubeClusterText(active)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const result = scoreYouTubeCardAtmosphere(text) || {
      atm: "orange",
      intensity: 0.42,
      scores: { green: 0, blue: 0, orange: 0, gray: 0 }
    };

    if (debug) {
      debugTint(`shorts active title "${title.slice(0, 160)}"`);
      debugTint(`shorts active metadata "${metadata.slice(0, 220)}"`);
      debugTint("shorts atmosphere", result.atm);
    }

    return { ...result, el: active, title, metadata, text };
  }

  function collectVisibleYouTubeShortsRenderers() {
    const seen = new Set();
    return [...document.querySelectorAll(YOUTUBE_SHORTS_SELECTORS.join(","))]
      .filter(el => {
        if (seen.has(el)) return false;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        const intersects = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
        const activeAttr = el.hasAttribute("is-active") || el.getAttribute("aria-hidden") === "false" || el.matches("[active], .active, [selected]");
        return intersects && (activeAttr || area >= 32000 || el.matches("ytd-shorts"));
      })
      .sort((a, b) => getYouTubeShortsRendererScore(b) - getYouTubeShortsRendererScore(a));
  }

  function getYouTubeShortsRendererScore(el) {
    const rect = el.getBoundingClientRect();
    const centerDistance = Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2);
    const activeBoost = (el.hasAttribute("is-active") || el.matches("[active], .active, [selected]")) ? 100000 : 0;
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return activeBoost + visibleHeight + Math.min(rect.width * rect.height / 1000, 2000) - centerDistance;
  }

  function getYouTubeShortsTitle(renderer) {
    return getFirstShortsSelectorText(renderer, YOUTUBE_SHORTS_TITLE_SELECTORS, 160);
  }

  function getYouTubeShortsMetadata(renderer) {
    return getFirstShortsSelectorText(renderer, YOUTUBE_SHORTS_METADATA_SELECTORS, 240);
  }

  function getFirstShortsSelectorText(renderer, selectors, maxLength) {
    for (const sel of selectors) {
      try {
        const nodes = renderer.querySelectorAll(sel);
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
          const text = getElementOwnMetadataText(node);
          if (text.length >= 2) return text.slice(0, maxLength).trim();
        }
      } catch (e) { /* selector may not match on this YouTube surface */ }
    }
    return "";
  }

  function applyYouTubeShortsAtmosphere(result) {
    const atm = result.atm || "orange";
    const color = ATM_COLORS[atm].match(/\d+/g).join(", ");
    const wash = ensurePageWash();
    const opacity = 0.10;
    const edgeOpacity = 0.14;

    wash.classList.add("__tint-page-wash-shorts");
    wash.classList.remove("__tint-page-wash-logo-preview");
    document.body.classList.remove("__tint-youtube-logo-preview");
    document.body.classList.add("__tint-youtube-atmosphere", "__tint-youtube-shorts");
    document.body.classList.toggle("__tint-youtube-shorts-fallback", Boolean(result.fallback));
    document.body.dataset.tintShortsAtmosphere = atm;
    wash.classList.add("__tint-page-wash-active", "__tint-shorts-wash");
    wash.dataset.tintShortsAtmosphere = atm;
    wash.style.setProperty("--tint-page-c", color);
    wash.style.setProperty("--tint-page-opacity", opacity.toFixed(2));
    wash.style.setProperty("--tint-page-edge-opacity", edgeOpacity.toFixed(2));
    wash.style.setProperty("--tint-page-x", "50%");
    wash.style.setProperty("--tint-page-y", "50%");

    debugTint("shorts wash applied", atm, "opacity", opacity.toFixed(2));
    debugTint("shorts wash element present", Boolean(document.getElementById("__tint-page-wash")));
  }

  function clearYouTubeShortsAtmosphere() {
    document.body.classList.remove("__tint-youtube-shorts", "__tint-youtube-shorts-fallback");
    delete document.body.dataset.tintShortsAtmosphere;
    if (!pageWashEl) return;
    pageWashEl.classList.remove("__tint-page-wash-active", "__tint-shorts-wash");
    pageWashEl.classList.remove("__tint-page-wash-logo-preview", "__tint-page-wash-shorts");
    delete pageWashEl.dataset.tintShortsAtmosphere;
  }

  function getYouTubeFeedRect(clusters) {
    const rects = clusters.map(el => el.getBoundingClientRect());
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const top = Math.min(...rects.map(rect => rect.top));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return {
      x: clamp(((left + right) / 2 / Math.max(window.innerWidth, 1)) * 100, 18, 82),
      y: clamp(((top + bottom) / 2 / Math.max(window.innerHeight, 1)) * 100, 18, 82)
    };
  }

  function clearYouTubePageAtmosphere() {
    document.body.classList.remove("__tint-youtube-atmosphere", "__tint-youtube-shorts", "__tint-youtube-shorts-fallback");
    delete document.body.dataset.tintShortsAtmosphere;
    if (!pageWashEl) return;
    pageWashEl.classList.remove("__tint-page-wash-active", "__tint-shorts-wash");
    delete pageWashEl.dataset.tintShortsAtmosphere;
    pageWashEl.style.removeProperty("--tint-page-c");
    pageWashEl.style.removeProperty("--tint-page-opacity");
    pageWashEl.style.removeProperty("--tint-page-x");
    pageWashEl.style.removeProperty("--tint-page-y");
    pageWashEl.style.removeProperty("--tint-page-edge-opacity");
  }

  function collectTopVisible(set, limit) {
    return [...set]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .slice(0, limit);
  }

  /* ===== Analyze + apply ===== */
  function analyzeAndApply(stagger = true) {
    const candidates = collectCandidates();
    const fresh = [];
    const onYouTube = isYouTubePage();

    if (onYouTube) {
      debugTint("youtube run");
      debugTint("enabled", enabled);

      const shortsAtmosphere = getVisibleYouTubeShortsAtmosphere({ debug: isYouTubeShortsPage() });
      const shortsActive = Boolean(shortsAtmosphere);
      const watchRecommendationsActive = isYouTubeWatchPage() && !shortsActive;
      const cards = shortsActive
        ? []
        : watchRecommendationsActive
          ? collectVisibleYouTubeWatchRecommendationCards(36)
          : collectVisibleYouTubeThumbnailClusters(36);
      let markedCount = 0;
      let skippedAlreadyMarked = 0;
      let skippedInvalid = 0;

      cards.forEach(el => {
        if (el.classList.contains("__tint-youtube-card")) {
          skippedAlreadyMarked += 1;
          return;
        }
        const text = getYouTubeClusterText(el);
        if (text.length < 8) {
          skippedInvalid += 1;
          return;
        }
        const result = scoreYouTubeRecommendationAtmosphere(text);
        if (!result) {
          skippedInvalid += 1;
          return;
        }
        markedCount += 1;
        fresh.push({
          el,
          atm: result.atm,
          intensity: result.intensity,
          label: result.label,
          isYouTubeCard: true,
          isYouTubeWatchCard: watchRecommendationsActive,
          cardEligible: false
        });
      });

      debugTint("youtube candidates found", cards.length);
      debugTint("youtube cards marked", markedCount);
      debugTint("skipped already marked", skippedAlreadyMarked);
      debugTint("skipped invalid", skippedInvalid);
    }

    for (const el of candidates) {
      if (onYouTube && el.closest(YOUTUBE_CARD_SELECTOR)) continue;

      const isYouTubeComment = onYouTube && Boolean(el.closest("ytd-comment-thread-renderer, ytd-comment-view-model, ytd-comment-renderer"));
      if (onYouTube && !isYouTubeComment) continue;

      const text = (el.innerText || el.textContent || "").trim();
      if (text.length < 20 || text.length > 6000) continue;

      const result = window.__Tint.detectStrongest(text);
      if (!result) continue;

      const signal = window.__Tint.Signals[result.key];
      const safeAtm = onYouTube && signal?.atm === "red" ? "orange" : signal?.atm;
      fresh.push({ el, ...result, atm: safeAtm, isYouTubeComment, cardEligible: onYouTube ? false : undefined });
    }

    if (fresh.length === 0 && isRedditPage()) {
      collectTopVisibleRedditTitles().forEach(el => {
        fresh.push({
          el,
          key: "attention_acceleration",
          intensity: 0.18
        });
      });
    }

    const cardEligible = new Set(
      [...fresh]
        .filter(r => !onYouTube && r.intensity >= 0.28 && !r.isYouTubeCard && !r.isYouTubeComment)
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, Math.max(1, Math.floor(fresh.length * 0.4)))
        .map(r => r.el)
    );

    if (onYouTube) updateYouTubePageAtmosphere();

    // Sort by document position for top-to-bottom reveal wave
    fresh.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    fresh.forEach((r, i) => applyMark({ ...r, cardEligible: r.cardEligible || cardEligible.has(r.el) }, i, stagger));
  }

  function applyMark({ el, key, atm, intensity, label, cardEligible = false, isYouTubeCard = false, isYouTubeWatchCard = false, isYouTubeComment = false }, idx, stagger) {
    const rawColor = atm || window.__Tint.Signals[key]?.atm;
    const color = isYouTubePage() && rawColor === "red" ? "orange" : rawColor;
    if (!color) return;

    const paintEl = el;

    paintEl.classList.add("__tint-mark");
    paintEl.dataset.tintColor = color;
    if (isYouTubeCard) {
      paintEl.classList.add("__tint-youtube-card");
      paintEl.dataset.tintLabel = label || YOUTUBE_MICRO_LABELS[color] || "";
    }
    if (isYouTubeComment) {
      paintEl.classList.add("__tint-youtube-comment");
      cardEligible = false;
    }
    paintEl.style.setProperty("--tint-i", intensity.toFixed(2));
    if (stagger) {
      paintEl.style.setProperty("--tint-reveal-delay", `${Math.min(idx * 60, 700)}ms`);
    } else {
      paintEl.style.setProperty("--tint-reveal-delay", "0ms");
    }
    marked.set(paintEl, { key, atm: color, intensity, cardEligible, isYouTubeCard, isYouTubeWatchCard, isYouTubeComment, sourceEl: el });
  }

  /* ============================================================
   * CLEANUP / RESET PATHS
   * Removes Tint-owned classes, state, timers, and visual overlays.
   * This section is critical for preventing page-wash or hover leakage.
   * ============================================================ */
  function clearMarks() {
    marked.forEach((_, el) => {
      el.classList.remove("__tint-mark", "__tint-youtube-card", "__tint-youtube-comment");
      delete el.dataset.tintColor;
      delete el.dataset.tintLabel;
      el.style.removeProperty("--tint-i");
      el.style.removeProperty("--tint-reveal-delay");
    });
    marked.clear();
  }


  function isYouTubeLogoTarget(el) {
    return Boolean(el?.closest?.("ytd-topbar-logo-renderer, a#logo, #logo-icon-container"));
  }

  function canShowYouTubeLogoPreview() {
    return enabled
      && isYouTubePage()
      && !isYouTubeShortsPage()
      && !document.body.classList.contains("__tint-youtube-atmosphere");
  }

  function clearYouTubeLogoPreview() {
    document.body.classList.remove("__tint-youtube-logo-preview");
    if (pageWashEl) pageWashEl.classList.remove("__tint-page-wash-logo-preview");
  }

  function showYouTubeLogoPreview() {
    if (!canShowYouTubeLogoPreview()) return;
    const wash = ensurePageWash();
    wash.classList.add("__tint-page-wash-logo-preview");
    wash.classList.remove("__tint-page-wash-shorts");
    document.body.classList.add("__tint-youtube-logo-preview");
    wash.style.setProperty("--tint-page-c", ATM_RGB.orange);
    wash.style.setProperty("--tint-page-opacity", "0.035");
    wash.style.setProperty("--tint-page-x", "9%");
    wash.style.setProperty("--tint-page-y", "6%");
  }

  function hideYouTubeLogoPreview() {
    clearYouTubeLogoPreview();
    if (!isYouTubePage() || document.body.classList.contains("__tint-youtube-atmosphere")) return;
    clearYouTubePageAtmosphere();
  }

  /* ===== Enable / disable ===== */
  /* ============================================================
   * EXTENSION ENABLE / DISABLE LIFECYCLE
   * Main runtime entry and exit path for Tint.
   * ============================================================ */
  function enableTint() {
    document.body.classList.add("__tint-on");
    // Slight delay to let CSS pick up the class transition
    requestAnimationFrame(() => analyzeAndApply(true));
  }

  function disableTint() {
    document.body.classList.remove("__tint-on");
    clearTimeout(scrollAnalyzeTimer);
    scrollAnalyzeTimer = null;
    clearTimeout(mutationTimer);
    mutationTimer = null;
    clearYouTubeLogoPreview();
    clearYouTubePageAtmosphere();
    if (pageWashEl) pageWashEl.classList.remove("__tint-page-wash-logo-preview", "__tint-page-wash-shorts");
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
    if (isYouTubePage()) { hideCard(); return; }
    if (e.target.closest("#__tint-toggle") || e.target.closest("#__tint-card")) return;

    // Let interactive elements work normally
    if (e.target.closest('a, button, input, textarea, select, label, [role="button"], [role="link"], [role="textbox"]')) {
      hideCard();
      return;
    }

    const tinted = e.target.closest(".__tint-mark");
    if (!tinted) { hideCard(); return; }

    const info = marked.get(tinted);
    if (info?.isYouTubeComment) { hideCard(); return; }
    if (!info?.cardEligible) { hideCard(); return; }

    e.preventDefault();
    e.stopPropagation();
    showCard(tinted);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCard();
  });
  let scrollAnalyzeTimer = null;
  document.addEventListener("pointerover", (e) => {
    if (isYouTubeLogoTarget(e.target)) showYouTubeLogoPreview();
  }, true);
  document.addEventListener("pointerout", (e) => {
    if (!isYouTubeLogoTarget(e.target)) return;
    const next = e.relatedTarget;
    if (next && isYouTubeLogoTarget(next)) return;
    hideYouTubeLogoPreview();
  }, true);

  window.addEventListener("scroll", () => {
    hideCard();
    if (!enabled || !isYouTubePage()) return;
    clearTimeout(scrollAnalyzeTimer);
    scrollAnalyzeTimer = setTimeout(() => {
      scrollAnalyzeTimer = null;
      if (!enabled || !isYouTubePage()) return;
      analyzeAndApply(false);
    }, 750);
  }, { passive: true });
  window.addEventListener("resize", () => {
    hideCard();
    if (enabled && isYouTubePage()) updateYouTubePageAtmosphere();
  });

  let mutationTimer = null;

  function scheduleYouTubeSpaAnalysis() {
    if (!enabled || !isYouTubePage()) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      if (!enabled) return;
      analyzeAndApply(false);
    }, 500);
  }

  document.addEventListener("yt-navigate-finish", scheduleYouTubeSpaAnalysis, true);
  document.addEventListener("yt-page-data-updated", scheduleYouTubeSpaAnalysis, true);

  /* ===== Dynamic content (infinite scroll, etc.) ===== */
  const observer = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      if (!enabled) return;
      // Apply marks to newly-added candidates only; no stagger for incremental adds
      analyzeAndApply(false);
    }, 1200);
  });

  /* ===== Boot ===== */
  function boot() {
    createToggle();
    createCard();
    createPageWash();
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
