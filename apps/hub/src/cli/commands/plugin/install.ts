import pc from 'picocolors';
import type { Command } from '../../command';
import { hubFetchOk } from '../../utils/hub-client';

/** Parse `@scope/name@version` or `name@version` into [name, version?]. */
function parsePackageSpec(spec: string): [name: string, version: string | undefined] {
  const lastAt = spec.lastIndexOf('@');
  if (lastAt > 0 && spec[lastAt - 1] !== '/') {
    return [spec.slice(0, lastAt), spec.slice(lastAt + 1)];
  }
  return [spec, undefined];
}

function printProgress(p: {
  phase: string;
  package?: string;
  message?: string;
  error?: string;
}): void {
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
      console.error(`  ${pc.red('✗')} ${p.error ?? p.message ?? 'Installation failed'}`);
      process.exit(1);
      break;
  }
}

export default {
  name: 'install',
  description: 'Install a plugin',
  examples: [
    'brika plugin install @brika/plugin-timer',
    'brika plugin install @brika/plugin-timer@1.0.0',
  ],
  async handler({ positionals }) {
    const spec = positionals[0];
    if (!spec) {
      console.error(
        `${pc.red('Missing package name.')} Usage: brika plugin install <name>[@version]`
      );
      process.exit(1);
    }

    const [name, version] = parsePackageSpec(spec);

    console.log(
      `${pc.cyan('Installing')} ${pc.bold(name)}${version ? pc.dim(`@${version}`) : ''} …`
    );

    const res = await hubFetchOk('/api/registry/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: name, version }),
    });

    const reader = res.body?.getReader();
    if (!reader) {
      console.error(`${pc.red('Error')} — no response stream`);
      process.exit(1);
    }

    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const progress = JSON.parse(line.slice(6));
          printProgress(progress);
          if (progress.phase === 'complete' || progress.phase === 'error') return;
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  },
} satisfies Command;
