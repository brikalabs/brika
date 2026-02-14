/**
 * Scaffold a new BRIKA plugin from the template directory
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { PluginConfig, PluginFeature } from './prompts';
import { type TemplateData, walkTemplate } from './render';
import { runCommand, toCamelCase, toPascalCase } from './utils';

export interface ScaffoldOptions extends PluginConfig {
  git: boolean;
  install: boolean;
}

export function createTemplateData(config: PluginConfig, sdkVersion: string): TemplateData {
  return {
    name: config.name,
    packageName: `@brika/plugin-${config.name}`,
    description: config.description,
    category: config.category,
    author: config.author,
    id: config.name,
    pascal: toPascalCase(config.name),
    camel: toCamelCase(config.name),
    sdkVersion,
    blocks: config.features.includes('blocks'),
    bricks: config.features.includes('bricks'),
    sparks: config.features.includes('sparks'),
  };
}

async function fetchLatestVersion(packageName: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${packageName} version: ${response.status}`);
  }
  const data = (await response.json()) as { version: string };
  return data.version;
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { git, install, ...config } = options;
  const targetDir = path.resolve(process.cwd(), config.name);

  // Check if directory exists
  try {
    await fs.access(targetDir);
    p.cancel(`Directory ${pc.cyan(config.name)} already exists`);
    throw new Error('cancelled');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const spinner = p.spinner();

  // Fetch latest SDK version
  spinner.start('Fetching latest SDK version');
  const sdkVersion = await fetchLatestVersion('@brika/sdk');
  spinner.stop(`Using SDK version ${pc.cyan(sdkVersion)}`);

  // Walk template directory
  spinner.start('Creating plugin files');

  const data = createTemplateData(config, sdkVersion);
  const templateDir = path.resolve(import.meta.dir, '..', 'template');

  await walkTemplate(templateDir, targetDir, data);

  spinner.stop('Created plugin files');

  // Git init
  if (git) {
    spinner.start('Initializing git repository');
    const success = await runCommand(['git', 'init'], targetDir);
    spinner.stop(success ? 'Initialized git repository' : 'Skipped git init');
  }

  // Install deps
  if (install) {
    spinner.start('Installing dependencies');
    const success = await runCommand(['bun', 'install'], targetDir);
    if (success) {
      spinner.stop('Installed dependencies');
    } else {
      spinner.stop('Failed to install dependencies');
      p.log.warn('Run `bun install` manually to install dependencies');
    }
  }

  // Summary
  const has = (f: PluginFeature) => config.features.includes(f);
  const featureLabels = config.features.map((f) => pc.cyan(f)).join(', ');
  p.note(
    [
      `${pc.cyan('package.json')}     Plugin manifest (${featureLabels})`,
      `${pc.cyan('src/index.ts')}     Plugin entry`,
      ...(has('blocks') ? [`${pc.cyan('src/blocks/')}      Block definitions`] : []),
      ...(has('bricks') ? [`${pc.cyan('src/bricks/')}      Brick components`] : []),
      ...(has('sparks') ? [`${pc.cyan('src/sparks/')}      Spark definitions`] : []),
      `${pc.cyan('tsconfig.json')}    TypeScript config${has('bricks') ? ' (JSX enabled)' : ''}`,
      `${pc.cyan('README.md')}        Documentation`,
      `${pc.cyan('locales/')}         i18n translations`,
    ].join('\n'),
    'Created files'
  );
}
