export const ACCENTS = {
  blue: '#0078d4',
  indigo: '#635bff',
  violet: '#7c5cff',
  teal: '#12a594',
  green: '#1f9a3c',
  amber: '#e5920a',
  rose: '#e5484d'
};

export function accentHex(name) {
  return ACCENTS[name] || ACCENTS.blue;
}
