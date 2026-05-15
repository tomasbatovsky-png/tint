export const ATMOSPHERES = [
  { key: "neutralInfo", label: "Neutral info", phrase: "neutral info", color: "blue" },
  { key: "attentionHeavy", label: "Attention-heavy", phrase: "attention-heavy", color: "orange" },
  { key: "syntheticRhythm", label: "Synthetic rhythm", phrase: "synthetic rhythm", color: "gray" },
  { key: "groundedPace", label: "Grounded pace", phrase: "grounded pace", color: "green" }
];

function count(text, patterns) {
  return patterns.reduce((sum, pattern) => sum + ((text.match(pattern) || []).length), 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreText(input) {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(words.length, 1);

  const neutral =
    count(lower, [
      /\b(how to|guide|tutorial|documentation|explained|explanation|learn|course|lesson|manual|reference|overview|introduction|history of|what is|why does|case study|research|report|analysis|technical|review|specification|faq)\b/g,
      /\b(information|context|details|example|definition|method|process|step|source|data|study|evidence|background)\b/g
    ]) * 1.35;

  const attention =
    count(lower, [
      /\b(shocking|insane|crazy|urgent|breaking|viral|exposed|secret|must watch|you won't believe|hurry|last chance|limited time|only \d+|before it's gone|don't miss|trending|drama|reaction|challenge|extreme|war|collapse|crisis|danger|millionaire|make money fast|live trading)\b/g,
      /\b(buy now|claim|subscribe|join now|act now|click here|share this|wake up)\b/g
    ]) * 1.55 + Math.min(count(text, /!/g) * 0.8, 4);

  const synthetic =
    count(lower, [
      /\b(in today's fast-paced world|more important than ever|game-changer|unlock your potential|ultimate guide|top \d+|best tips|proven strategies|without further ado|let's dive in|comprehensive guide|take it to the next level|whether you're|content creation|ai-generated|chatgpt|automation|passive income|seo|template|faceless)\b/g,
      /\b(productivity hacks|life hacks|secret formula|step-by-step system|boost your|maximize your|optimize your)\b/g
    ]) * 1.5;

  const grounded =
    count(lower, [
      /\b(calm|slow|quiet|grounded|gentle|restorative|reflective|thoughtful|conversation|interview|nature|walking|music|orchestra|ambient|meditation|sleep|journal|personal essay|craft|garden|handmade|documentary|field notes|longform)\b/g,
      /\b(no rush|take your time|from experience|by hand|on the porch|human-paced|listening|presence)\b/g
    ]) * 1.25;

  const density = clamp(wordCount / 900, 0, 1.4);
  const base = {
    neutralInfo: 5 + neutral + density * 10,
    attentionHeavy: 2 + attention,
    syntheticRhythm: 3 + synthetic,
    groundedPace: 2 + grounded
  };

  if (wordCount > 250 && attention < 2) base.neutralInfo += 8;
  if (wordCount > 350 && grounded > 2 && synthetic < 3) base.groundedPace += 5;
  if (synthetic > 2 && neutral > 1) base.syntheticRhythm += 4;
  if (attention > 2 && synthetic > 1) base.attentionHeavy += 4;

  const total = Object.values(base).reduce((a, b) => a + b, 0) || 1;
  const raw = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.max(0, value / total * 100)]));
  return normalizePercentages(raw);
}

function normalizePercentages(raw) {
  const rounded = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.floor(value)]));
  let remainder = 100 - Object.values(rounded).reduce((a, b) => a + b, 0);
  const order = Object.entries(raw)
    .sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])))
    .map(([key]) => key);

  for (let i = 0; remainder > 0 && order.length; i = (i + 1) % order.length) {
    rounded[order[i]] += 1;
    remainder -= 1;
  }
  return rounded;
}

export function summarizeMix(mix) {
  const ranked = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const [firstKey, firstValue] = ranked[0];
  const [secondKey, secondValue] = ranked[1];
  const first = ATMOSPHERES.find(item => item.key === firstKey)?.phrase || firstKey;
  const second = ATMOSPHERES.find(item => item.key === secondKey)?.phrase || secondKey;

  if (firstValue >= 70) return `Mostly ${first}.`;
  if (secondValue >= 22) return `Mostly ${first}. Slightly ${second}.`;
  return `Mostly ${first}.`;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractReadableText(html) {
  const source = String(html || "");
  const title = (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const meta = (source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] || "").trim();
  const headings = Array.from(source.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)).map(match => stripHtml(match[1])).join(" ");
  const paragraphs = Array.from(source.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map(match => stripHtml(match[1])).join(" ");
  const body = stripHtml(source).slice(0, 50000);
  return [title, meta, headings, paragraphs || body].join(" ").replace(/\s+/g, " ").trim().slice(0, 50000);
}
