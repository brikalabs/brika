import { fetchPlugins } from '@/lib/plugins';
import { PluginGrid } from './plugin-grid';
import { AnimatedSection } from './ui/animated-section';

export async function Plugins() {
  const plugins = await fetchPlugins();

  if (plugins.length === 0) return null;

  return (
    <AnimatedSection id="plugins" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">Plugins</h2>
        <p className="mb-12 text-center text-muted-foreground">
          Extend Brika with community and official plugins from npm.
        </p>

        <PluginGrid plugins={plugins} />
      </div>
    </AnimatedSection>
  );
}
