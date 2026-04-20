import { createCli as _createCli, type CliConfig } from '@brika/cli';
import { generateHelp } from './help';

export type { Cli } from '@brika/cli';

export function createCli(config?: CliConfig) {
  return _createCli({ ...config, helpFormatter: generateHelp });
}
