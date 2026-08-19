const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">${p}</svg>`;

export const ICONS = {
  world: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  external: svg('<path d="M14 5h5v5M19 5l-8 8M19 13v6H5V5h6"/>'),
  chevronUp: svg('<path d="M6 15l6-6 6 6"/>'),
  translate: svg('<path d="M4 5h7M8 4v1c0 4-2 7-5 9M5 9c0 3 3 5 6 6M13 20l4-9 4 9M14.5 17h5"/>'),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4V3z"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>'),
  warn: svg('<path d="M12 4.5 2.5 20h19L12 4.5z"/><path d="M12 10v4M12 17.2v.01"/>')
};
