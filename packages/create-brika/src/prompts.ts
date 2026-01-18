/**
 * Interactive prompts for plugin configuration
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getGitUser } from './utils';

export interface PluginConfig {
  name: string;
  description: string;
  category: 'trigger' | 'action' | 'transform' | 'flow';
  author: string;
}

const CATEGORIES = [
  {
    value: 'trigger',
    label: 'Trigger',
    hint: 'Starts workflows (sensors, timers, webhooks)',
  },
  {
    value: 'action',
    label: 'Action',
    hint: 'Performs operations (send, control, notify)',
  },
  {
    value: 'transform',
    label: 'Transform',
    hint: 'Processes data (map, filter, format)',
  },
  {
    value: 'flow',
    label: 'Flow',
    hint: 'Controls flow (condition, delay, split)',
  },
] as const;

/**
 * Validate plugin name (kebab-case)
 */
function validatePluginName(name: string): string | undefined {
  if (!name) return 'Plugin name is required';
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return 'Plugin name must be kebab-case (e.g., my-plugin)';
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return 'Plugin name cannot start or end with a hyphen';
  }
  return undefined;
}

/**
 * Prompt for plugin configuration
 */
export async function promptForConfig(pluginName?: string): Promise<PluginConfig> {
  p.intro(pc.bgCyan(pc.black(' create-brika ')));

  // Validate provided name
  if (pluginName) {
    const error = validatePluginName(pluginName);
    if (error) {
      p.cancel(error);
      throw new Error('cancelled');
    }
  }

  const gitUser = await getGitUser();

  const answers = await p.group(
    {
      name: () => {
        if (pluginName) {
          p.log.info(`Plugin name: ${pc.cyan(pluginName)}`);
          return Promise.resolve(pluginName);
        }
        return p.text({
          message: 'What is your plugin name?',
          placeholder: 'my-plugin',
          validate: validatePluginName,
        });
      },
      description: ({ results }) =>
        p.text({
          message: 'Description',
          placeholder: `A BRIKA plugin for ${results.name}`,
          defaultValue: `A BRIKA plugin for ${results.name}`,
        }),
      category: () =>
        p.select({
          message: 'What type of plugin is this?',
          options: CATEGORIES.map((c) => ({
            value: c.value,
            label: c.label,
            hint: c.hint,
          })),
          initialValue: 'action',
        }),
      author: () =>
        p.text({
          message: 'Author',
          placeholder: gitUser || 'Your Name',
          defaultValue: gitUser,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled.');
        throw new Error('cancelled');
      },
    }
  );

  return {
    name: answers.name as string,
    description: answers.description as string,
    category: answers.category as PluginConfig['category'],
    author: answers.author as string,
  };
}
