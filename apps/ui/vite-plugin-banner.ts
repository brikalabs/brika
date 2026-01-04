import { createBanner } from '@elia/banner';
import type { Plugin } from 'vite';
import pkg from './package.json';

/**
 * Vite plugin that displays a startup banner with ASCII art.
 * Shows the banner when the dev server starts or when building.
 */
export function bannerPlugin(): Plugin {
  let bannerShown = false;

  const showBanner = () => {
    if (bannerShown) return;
    bannerShown = true;

    console.log(
      createBanner({
        title: 'EliaUI',
        subtitle: 'Event-driven Logical Intelligence Architecture',
        metadata: {
          Version: pkg.version,
          Package: pkg.name,
        },
      })
    );
  };

  return {
    name: 'elia-banner',
    enforce: 'pre',
    buildStart() {
      // Show banner at build start (for both dev and build)
      showBanner();
    },
    configureServer(server) {
      // For dev server, also show when ready (in case buildStart fires too early)
      server.httpServer?.once('listening', () => {
        if (!bannerShown) {
          showBanner();
        }
      });
    },
  };
}
