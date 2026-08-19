import { ACCENTS } from '../ui/accents.js';

export const CARD_LANGS = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'ru', 'uk', 'pl', 'tr', 'id', 'vi', 'ja', 'zh', 'ko', 'ar', 'fa', 'hi'];

export const PRESET_WEIGHT = { balanced: 0.5, complete: 0.75, sourced: 0.25 };

export const SCHEMA = {
  weight: { type: 'number', def: 0.5, min: 0, max: 1 },
  analyze: { type: 'enum', def: 12, values: [6, 12, 24] },
  theme: { type: 'enum', def: 'auto', values: ['auto', 'light', 'dark'] },
  accent: { type: 'enum', def: 'blue', values: Object.keys(ACCENTS) },
  cardLang: { type: 'enum', def: 'auto', values: ['auto', ...CARD_LANGS] },
  enabled: { type: 'boolean', def: true },
  languagesIRead: { type: 'codes', def: [], max: 20 }
};

const CODE = /^[a-z]{2,3}$/;

function clone(v) {
  if (Array.isArray(v)) return v.slice();
  if (v && typeof v === 'object') return { ...v };
  return v;
}

function codes(value, max) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim().toLowerCase().split('-')[0];
    if (CODE.test(code) && !out.includes(code)) out.push(code);
  }
  return out.slice(0, max);
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const top = Number(value.top);
  const left = Number(value.left);
  if (!Number.isFinite(top) || !Number.isFinite(left)) return null;
  return { top: Math.max(0, top), left: Math.max(0, left) };
}

function coerce(def, value) {
  const fallback = clone(def.def);
  switch (def.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
      return Math.min(def.max, Math.max(def.min, value));
    case 'enum':
      return def.values.includes(value) ? value : fallback;
    case 'boolean':
      return typeof value === 'boolean' ? value : fallback;
    case 'codes': {
      const list = codes(value, def.max);
      return list === null ? fallback : list;
    }
    case 'point':
      return point(value);
    default:
      return fallback;
  }
}

export function validatorFor(table) {
  const defaults = Object.fromEntries(Object.entries(table).map(([k, d]) => [k, clone(d.def)]));
  return {
    DEFAULTS: defaults,
    validate(key, value) {
      return table[key] ? coerce(table[key], value) : undefined;
    },
    validateAll(obj) {
      const src = obj && typeof obj === 'object' ? obj : {};
      const out = {};
      for (const key of Object.keys(table)) out[key] = coerce(table[key], src[key]);
      return out;
    }
  };
}

const settingsValidator = validatorFor(SCHEMA);

export const DEFAULTS = settingsValidator.DEFAULTS;
export const validate = settingsValidator.validate;
export const validateAll = settingsValidator.validateAll;

export function presetOf(weight) {
  for (const [name, value] of Object.entries(PRESET_WEIGHT)) {
    if (Math.abs(value - weight) < 1e-9) return name;
  }
  return 'custom';
}
