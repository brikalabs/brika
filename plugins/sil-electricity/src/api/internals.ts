/**
 * Shared constants and logger used across the api/ modules.
 */

export const BASE = 'https://www.lausanne.ch';
export const IAM = `${BASE}/iam-ui-fusion`;
export const DIAMOND = `${BASE}/eb2sil-ui/diamond-smart-data/load`;
export const GOTO =
  '/vie-pratique/energies-et-eau/services-industriels/particuliers/mon-compte/Ma-consommation/-my-ma-consommation.html?iam=true';

export const log = {
  info: (msg: string) => console.log(`[sil] ${msg}`),
  error: (msg: string) => console.error(`[sil] ${msg}`),
};
