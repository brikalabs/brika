import type { PluginError } from '@brika/plugin';
import { HUB_VERSION } from './utils';

/**
 * Factory functions for structured plugin errors.
 *
 * Each method returns a `PluginError` with:
 * - `key`: i18n translation key
 * - `params`: interpolation parameters
 * - `message`: pre-built English fallback (for logs)
 */
export const PluginErrors = {
  incompatibleVersion(required: string): PluginError {
    return {
      key: 'plugins:errors.incompatibleVersion',
      params: {
        required,
        current: HUB_VERSION,
      },
      message: `Requires Brika ${required}, current version is ${HUB_VERSION}`,
    };
  },

  incompatibleUnknown(): PluginError {
    return {
      key: 'plugins:errors.incompatibleUnknown',
      message: 'Missing engines.brika in package.json',
    };
  },

  heartbeatTimeout(): PluginError {
    return {
      key: 'plugins:errors.heartbeatTimeout',
      message: 'heartbeat timeout',
    };
  },

  crashed(reason: string): PluginError {
    return {
      key: 'plugins:errors.crashed',
      params: {
        reason,
      },
      message: reason,
    };
  },

  crashLoop(reason: string): PluginError {
    return {
      key: 'plugins:errors.crashLoop',
      params: {
        reason,
      },
      message: `Crash loop: ${reason}`,
    };
  },

  restarting(delayMs: number): PluginError {
    const seconds = String(Math.round(delayMs / 1000));
    return {
      key: 'plugins:errors.restarting',
      params: {
        seconds,
      },
      message: `Restarting in ${seconds}s`,
    };
  },

  killed(): PluginError {
    return {
      key: 'plugins:errors.killed',
      message: 'Plugin was forcefully terminated',
    };
  },

  buildFailed(errors: string[]): PluginError {
    const message = errors.join('; ');
    return {
      key: 'plugins:errors.buildFailed',
      params: { errors: message },
      message: `Build failed: ${message}`,
    };
  },
} as const;
