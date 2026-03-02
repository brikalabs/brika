import { AlertTriangle, Loader2 } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { PluginContext } from './plugin-context';
import { useModuleImport } from './use-module-import';

// ── Status placeholder ──────────────────────────────────────────────────────

export function ModuleStatus({
  icon: Icon,
  label,
  spin,
}: Readonly<{
  icon: React.FC<{
    className?: string;
  }>;
  label?: string;
  spin?: boolean;
}>) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className={`text-muted-foreground ${spin ? 'size-6 animate-spin' : 'size-10'}`} />
      {label && <p className="text-muted-foreground">{label}</p>}
    </div>
  );
}

// ── Generic plugin module renderer ──────────────────────────────────────────

interface PluginModuleProps {
  pluginUid: string;
  pluginName: string;
  moduleUrl: string;
  scopeId?: string;
}

export function PluginModule({
  pluginUid,
  pluginName,
  moduleUrl,
  scopeId,
}: Readonly<PluginModuleProps>) {
  // CSS is inlined into the JS module — no separate stylesheet request needed
  const { Module, error } = useModuleImport(moduleUrl);
  const contextValue = useMemo(
    () => ({
      uid: pluginUid,
      namespace: `plugin:${pluginName}`,
    }),
    [pluginUid, pluginName]
  );

  if (error) {
    return <ModuleStatus icon={AlertTriangle} label="Failed to load module" />;
  }
  if (!Module) {
    return <ModuleStatus icon={Loader2} spin />;
  }

  return (
    <PluginContext.Provider value={contextValue}>
      <div data-brika-scope={scopeId} style={{ display: 'contents' }}>
        <Module />
      </div>
    </PluginContext.Provider>
  );
}
