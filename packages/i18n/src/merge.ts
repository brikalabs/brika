import { isTranslationData, type TranslationData } from './types';

export function mergeFallbackChain(
  chain: string[],
  lookup: (locale: string) => TranslationData | undefined
): TranslationData {
  let result: TranslationData = {};
  for (const loc of chain.toReversed()) {
    const data = lookup(loc);
    if (data) {
      result = deepMerge(result, data);
    }
  }
  return result;
}

export function deepMerge(target: TranslationData, source: TranslationData): TranslationData {
  const result: TranslationData = {
    ...target,
  };

  for (const key in source) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (isTranslationData(sourceVal) && isTranslationData(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

export function countLeafKeys(obj: TranslationData, visited = new WeakSet<object>()): number {
  if (visited.has(obj)) {
    return 0;
  }
  visited.add(obj);

  let count = 0;
  for (const value of Object.values(obj)) {
    if (isTranslationData(value)) {
      count += countLeafKeys(value, visited);
    } else {
      count++;
    }
  }
  return count;
}
