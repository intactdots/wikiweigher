export const ext = globalThis.browser ?? globalThis.chrome;

export const gecko = String(ext?.runtime?.getURL?.('') || '').startsWith('moz-extension://');
