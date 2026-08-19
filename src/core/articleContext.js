export function currentLang(loc) {
  const label = (loc.hostname || '').split('.')[0];
  if (!label || label === 'www' || label === 'wikipedia') return null;
  return label;
}

export function currentTitle(loc, doc) {
  const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  let path = loc.pathname;
  try {
    if (canon) path = new URL(canon, loc.origin).pathname;
  } catch {}
  const m = path.match(/\/wiki\/(.+)$/);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/_/g, ' ');
}

function isMainPage(loc, doc) {
  const logo = doc.querySelector('.mw-logo-link, a.mw-logo, #p-logo a');
  const href = logo?.getAttribute('href');
  if (!href) return false;
  try {
    return decodeURIComponent(new URL(href, loc.origin).pathname) === decodeURIComponent(loc.pathname);
  } catch {
    return false;
  }
}

export function getContext(loc, doc) {
  const lang = currentLang(loc);
  if (!lang) return null;
  if (!doc.body || !doc.body.classList.contains('ns-0')) return null;
  if (isMainPage(loc, doc)) return null;
  const title = currentTitle(loc, doc);
  if (!title) return null;
  return { lang, title };
}
