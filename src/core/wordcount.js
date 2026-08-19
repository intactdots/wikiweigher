export const CJK_FACTOR = 0.5;

const CJK = new RegExp('[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF]', 'g');

export function countWords(text) {
  if (!text) return 0;
  const cjk = (text.match(CJK) || []).length;
  const latin = (text.replace(CJK, ' ').match(/\S+/g) || []).length;
  return latin + Math.round(cjk * CJK_FACTOR);
}
