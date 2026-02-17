import { AlertTriangle, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { PluginContext } from './plugin-context';
import { setActivePluginUid } from './plugin-hooks';
import './plugin-bridge';

// ── Status placeholder ──────────────────────────────────────────────────────

export function ModuleStatus({
  icon: Icon,
  label,
  spin,
}: {
  icon: React.FC<{ className?: string }>;
  label?: string;
  spin?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className={`text-muted-foreground ${spin ? 'size-6 animate-spin' : 'size-10'}`} />
      {label && <p className="text-muted-foreground">{label}</p>}
    </div>
  );
}

// ── Dynamic module loader hook ──────────────────────────────────────────────

function useModuleImport(url: string) {
  const [Module, setModule] = useState<React.FC | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setModule(null);
    setError(false);
    import(/* @vite-ignore */ url)
      .then((mod) => setModule(() => mod.default))
      .catch(() => setError(true));
  }, [url]);

  return { Module, error };
}

// ── Generic plugin module renderer ──────────────────────────────────────────

interface PluginModuleProps {
  pluginUid: string;
  pluginName: string;
  moduleUrl: string;
}

export function PluginModule({ pluginUid, pluginName, moduleUrl }: PluginModuleProps) {
  const { Module, error } = useModuleImport(moduleUrl);

  // Set module-level uid for non-hook callAction
  setActivePluginUid(pluginUid);

  if (error) return <ModuleStatus icon={AlertTriangle} label="Failed to load module" />;
  if (!Module) return <ModuleStatus icon={Loader2} spin />;

  return (
    <PluginContext.Provider value={{ uid: pluginUid, namespace: `plugin:${pluginName}` }}>
      <Module />
    </PluginContext.Provider>
  );
}
