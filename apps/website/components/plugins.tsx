import { ArrowRight, Code, Puzzle } from 'lucide-react';
import { npm, site } from '@/lib/config';
import { fetchPlugins } from '@/lib/plugins';
import { PluginGrid } from './plugin-grid';
import { AnimatedSection } from './ui/animated-section';
import { Button } from './ui/button';
import { Terminal, Comment, Line, Cmd, Flag } from './ui/terminal';

export async function Plugins() {
  const plugins = await fetchPlugins();

  if (plugins.length === 0) return null;

  return (
    <AnimatedSection id="plugins" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Puzzle className="size-3.5" />
            {plugins.length} plugins available
          </div>
        </div>
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">
          Extend with plugins
        </h2>
        <p className="mb-12 text-center text-muted-foreground">
          Discover community and official plugins from the npm registry.
        </p>
      </div>
      <PluginGrid plugins={plugins} />

      {/* Build your own CTA */}
      <div className="mx-auto mt-16 max-w-4xl px-6">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Code className="size-4" />
              Developer experience first
            </p>
            <h3 className="mb-3 text-2xl font-bold tracking-tight">
              Build your own plugin
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Scaffold a plugin in one command. Define blocks, bricks, and integrations
              with full TypeScript inference. Ship as an npm package — Brika handles
              isolation, IPC, and hot-reload.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button href={site.docsUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="md">
                Read the docs
                <ArrowRight className="size-3.5" />
              </Button>
              <Button href={`${npm.packageUrl}/@brika/sdk`} target="_blank" rel="noopener noreferrer" variant="glow" size="md" className="px-4">
                <span className="font-mono text-xs text-muted-foreground">npm</span>
                @brika/sdk
              </Button>
            </div>
          </div>

          <Terminal>
            <Comment># scaffold a new plugin</Comment>
            <Line><Cmd>bun</Cmd> create <Flag>brika</Flag> my-plugin</Line>
            <div className="my-2" />
            <Comment># start developing with hot-reload</Comment>
            <Line><Cmd>cd</Cmd> my-plugin</Line>
            <Line><Cmd>bun</Cmd> dev</Line>
          </Terminal>
        </div>
      </div>
    </AnimatedSection>
  );
}
