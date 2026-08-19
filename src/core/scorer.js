function norm(vals) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return v => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
}

const QUALITY = { featured: 0.05, good: 0.025 };

export function score(langs, opts = {}) {
  const weight = opts.weight ?? 0.5;
  const margin = opts.margin ?? 0.1;
  const current = opts.currentLang;
  const D = l => l.depth ?? l.words;
  const S = l => (l.sections || 0) + 0.5 * (l.images || 0);
  const nd = norm(langs.map(D));
  const nr = norm(langs.map(l => l.refs));
  const ns = norm(langs.map(S));
  const ranked = langs
    .map(l => {
      const base = weight * nd(D(l)) + (1 - weight) * nr(l.refs);
      const structureBonus = 0.05 * ns(S(l));
      return { ...l, score: (base + structureBonus) * (1 + (QUALITY[l.badge] || 0)) };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const bestSourced = [...ranked].sort((a, b) => b.refs - a.refs)[0];
  const cur = ranked.find(l => l.lang === current);
  let type = 'stay';
  let gain = 0;
  let drivers = { depth: 0, refs: 0, quality: 0 };
  if (cur && best.lang !== current) {
    const depthGain = (D(best) - D(cur)) / Math.max(D(cur), 1);
    const refsGain = (best.refs - cur.refs) / Math.max(cur.refs, 1);
    const qualGain = (QUALITY[best.badge] || 0) - (QUALITY[cur.badge] || 0);
    gain = weight * depthGain + (1 - weight) * refsGain + qualGain;
    drivers = { depth: weight * depthGain, refs: (1 - weight) * refsGain, quality: qualGain };
    if (gain >= margin) type = 'switch';
  }
  return {
    ranked,
    best,
    bestSourced,
    verdict: { type, target: best.lang, deltaPct: Math.round(gain * 100), drivers }
  };
}
