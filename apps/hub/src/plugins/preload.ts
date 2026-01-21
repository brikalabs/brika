/**
 * Runtime preload - registers the folder-tar plugin
 * Loaded via bunfig.toml before any other code
 */

import { plugin } from 'bun';
import { folderTarPlugin } from './folder-tar-plugin';

plugin(folderTarPlugin());
