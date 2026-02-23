import pc from 'picocolors';
import { defineCommand } from '../../command';
import { CliError } from '../../errors';
import { hubFetchOk } from '../../utils/hub-client';
import { streamSseEvents } from '../../utils/sse';

/** Parse `@scope/name@version` or `name@version` into [name, version?]. */
function parsePackageSpec(spec: string): [name: string, version: string | undefined] {
  const lastAt = spec.lastIndexOf('@');
  if (lastAt > 0 && spec[lastAt - 1] !== '/') {
    return [spec.slice(0, lastAt), spec.slice(lastAt + 1)];
  }
  return [spec, undefined];
}

interface Progress {
  phase: string;
  package?: string;
  message?: string;
  error?: string;
}

function printProgress(p: Progress): void {
  switch (p.phase) {
    case 'resolving':
      console.log(`  ${pc.dim('◌')} Resolving ${pc.dim(p.package ?? '')} …`);
      break;
    case 'downloading':
      console.log(`  ${pc.dim('↓')} Downloading …`);
      break;
    case 'linking':
      console.log(`  ${pc.dim('⊕')} Linking …`);
      break;
    case 'complete':
      console.log(`  ${pc.green('✓')} ${p.message ?? 'Installed successfully'}`);
      break;
    case 'error':
      throw new CliError(`  ${pc.red('✗')} ${p.error ?? p.message ?? 'Installation failed'}`);
  }
}

export default defineCommand({
  name: 'install',
  description: 'Install a plugin',
  examples: [
    'brika plugin install @brika/plugin-timer',
    'brika plugin install @brika/plugin-timer@1.0.0',
  ],
  async handler({ positionals }) {
    const spec = positionals[0];
    if (!spec) {
      throw new CliError(
        `${pc.red('Missing package name.')} Usage: brika plugin install <name>[@version]`
      );
    }

    const [name, version] = parsePackageSpec(spec);

    const versionSuffix = version ? pc.dim(`@${version}`) : '';
    console.log(
      `${pc.cyan('Installing')} ${pc.bold(name)}${versionSuffix} …`
    );

    const res = await hubFetchOk('/api/registry/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: name, version }),
    });

    for await (const progress of streamSseEvents<Progress>(res)) {
      printProgress(progress);
      if (progress.phase === 'complete') return;
    }
  },
});
