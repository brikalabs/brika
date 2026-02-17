/**
 * @brika/sdk/storage
 *
 * Persistent file-based storage for plugins.
 * Data is stored in a `data/` subfolder of the plugin's package directory.
 */

export type { Store } from './api/storage';
export {
  clearAllData,
  defineStore,
  deleteJSON,
  exists,
  getDataDir,
  readJSON,
  updateJSON,
  writeJSON,
} from './api/storage';
