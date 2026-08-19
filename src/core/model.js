import { score } from './scorer.js';
import { calibratedDepth } from './verbosity.js';

export function buildModel(state) {
  const cap = Math.max(1, state.settings.analyze || 12);
  const analyzed = [];
  const estimated = [];
  for (const l of state.langs) {
    const ex = state.exact[l.lang];
    if (ex) analyzed.push({ lang: l.lang, words: ex.words, refs: ex.refs, depth: calibratedDepth(l.lang, ex.words), sections: ex.sections, images: ex.images, badge: l.badge });
    else estimated.push({ lang: l.lang, size: state.sizes[l.lang] || 0 });
  }

  let ranked = [];
  let best = null;
  let bestSourced = null;
  let verdict = { type: 'stay', target: state.current, deltaPct: 0 };

  if (analyzed.length >= 1) {
    const s = score(analyzed, { weight: state.settings.weight, currentLang: state.current });
    best = s.best;
    bestSourced = s.bestSourced;
    verdict = s.verdict;
    ranked = s.ranked.map(r => ({ ...r, estimated: false }));
  } else if (estimated.length >= 1) {
    const s = score(estimated.map(e => ({ lang: e.lang, words: e.size, refs: 0 })), { weight: 1, currentLang: state.current });
    best = s.best;
    verdict = s.verdict;
    ranked = s.ranked.map(r => ({ lang: r.lang, words: null, refs: null, score: r.score, estimated: true }));
  }

  ranked = ranked.slice(0, cap);

  return {
    state: state.state,
    error: state.error || null,
    current: state.current,
    ranked,
    best,
    bestSourced,
    verdict,
    settings: state.settings,
    minimized: state.minimized,
    total: state.total,
    shown: (state.langs || []).length,
    uiLang: state.uiLang
  };
}
