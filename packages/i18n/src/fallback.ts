const DEFAULT_FALLBACK_LOCALE = 'en';

export function buildFallbackChain(locale: string, fallback = DEFAULT_FALLBACK_LOCALE): string[] {
  const chain: string[] = [locale];

  if (locale.includes('-')) {
    const base = locale.split('-')[0];
    if (base && !chain.includes(base)) {
      chain.push(base);
    }
  }

  if (!chain.includes(fallback)) {
    chain.push(fallback);
  }

  return chain;
}
