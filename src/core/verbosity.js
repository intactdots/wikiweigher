const FACTORS = {
  vi: 1.35, ja: 1.25, hi: 1.22, fr: 1.12, nl: 1.12, es: 1.1, it: 1.09, pt: 1.08, ro: 1.08, ca: 1.05, gl: 1.1, oc: 1.1,
  da: 1.03, bg: 1.01, no: 1.0, el: 1.0, nn: 0.97, is: 0.97, af: 0.97, de: 0.97,
  sv: 0.96, id: 0.94, ru: 0.92, pl: 0.91, fa: 0.9, uk: 0.9, ur: 0.9, be: 0.9, mk: 0.9,
  zh: 0.88, hu: 0.88, sl: 0.88, sr: 0.87, cs: 0.86, sk: 0.86, hr: 0.86, lt: 0.84,
  fi: 0.8, et: 0.8, lv: 0.8, az: 0.8, kk: 0.8, tr: 0.78, ar: 0.77, he: 0.73, ko: 0.7
};

export function verbosity(lang) {
  return FACTORS[lang] || 1;
}

export function calibratedDepth(lang, words) {
  return words / verbosity(lang);
}
