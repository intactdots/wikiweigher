const DROP = 'ol.references, .reflist, .references, .refbegin, .infobox, table, .navbox, .sidebar, .thumb, figure, figcaption, .hatnote, .mw-editsection, sup.reference, style, .noprint, .metadata, .mw-empty-elt, .gallery, .quotebox';

export function extractProse(doc) {
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  if (!root) return '';
  const clone = root.cloneNode(true);
  clone.querySelectorAll(DROP).forEach(n => n.remove());
  const out = [];
  clone.querySelectorAll('p').forEach(p => {
    const t = p.textContent.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  });
  return out.join(' ');
}

export function countRefs(doc) {
  const root = doc.querySelector('.mw-parser-output') || doc.body || doc;
  let n = root.querySelectorAll('ol.references > li').length;
  if (!n) n = root.querySelectorAll('.reflist li').length;
  if (!n) n = root.querySelectorAll('.references li').length;
  return n;
}

export function structure(doc) {
  const root = doc.querySelector('.mw-parser-output') || doc.body || doc;
  return {
    sections: root.querySelectorAll('h2, h3').length,
    images: root.querySelectorAll('img').length,
    tables: root.querySelectorAll('table').length
  };
}
