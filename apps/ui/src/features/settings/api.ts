/**
 * Settings API
 */

export interface LocalesResponse {
  locales: string[];
}

export async function fetchAvailableLocales(): Promise<string[]> {
  const res = await fetch("/api/i18n/locales");
  if (!res.ok) throw new Error("Failed to fetch locales");
  const data: LocalesResponse = await res.json();
  return data.locales;
}
