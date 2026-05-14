/*
 * Tint Clean MVP Worker
 * Optional backend endpoint.
 */

function classify(text) {
  const lower = String(text || '').toLowerCase();

  if (/(urgent|breaking|shocking|secret|warning|panic|viral|must see|exposed)/.test(lower)) {
    return ['orange', 0.82, 'attention pressure'];
  }

  if (/(premium|luxury|exclusive|elite|success|transform|unlock|masterclass)/.test(lower)) {
    return ['violet', 0.74, 'aspiration'];
  }

  if (/(ai generated|automated|template|generic|spam|synthetic)/.test(lower)) {
    return ['gray', 0.72, 'synthetic'];
  }

  if (/(calm|nature|community|local|human|family|natural|grounded)/.test(lower)) {
    return ['green', 0.70, 'grounded'];
  }

  if (/(guide|tutorial|analysis|review|documentation|study|research|comparison)/.test(lower)) {
    return ['blue', 0.68, 'informational'];
  }

  return ['blue', 0.22, 'low signal'];
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Tint worker', { status: 200 });
    }

    const body = await request.json().catch(() => ({}));
    const blocks = Array.isArray(body.blocks) ? body.blocks.slice(0, 80) : [];

    const results = blocks.map(block => {
      const [atmosphere, confidence, label] = classify(block.text);
      return {
        id: block.id,
        atmosphere,
        confidence,
        label
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      }
    });
  }
};
