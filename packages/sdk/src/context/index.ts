/**
 * Context Module Barrel
 *
 * Importing this file triggers registration of all context modules.
 * Order matters for shutdown: blocks and bricks clean up before
 * lifecycle runs user stop handlers.
 */

import './sparks';
import './routes';
import './blocks';
import './i18n';
import './bricks';
import './lifecycle';
