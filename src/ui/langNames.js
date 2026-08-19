function safe(locale, code) {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

export function nativeName(code) {
  return safe(code, code);
}

export function englishName(code) {
  return safe('en', code);
}
