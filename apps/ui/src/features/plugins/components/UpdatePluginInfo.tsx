interface UpdatePluginInfoProps {
  packageName: string;
  currentVersion?: string;
  latestVersion?: string;
}

export function UpdatePluginInfo({
  packageName,
  currentVersion,
  latestVersion,
}: Readonly<UpdatePluginInfoProps>) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-1">
        <div className="text-muted-foreground text-sm">Package</div>
        <code className="font-mono text-sm">{packageName}</code>
      </div>
      {currentVersion && latestVersion && (
        <div className="space-y-1">
          <div className="text-muted-foreground text-sm">Version</div>
          <div className="font-mono text-sm">
            v{currentVersion} → v{latestVersion}
          </div>
        </div>
      )}
      {currentVersion && !latestVersion && (
        <div className="space-y-1">
          <div className="text-muted-foreground text-sm">Current Version</div>
          <code className="font-mono text-sm">v{currentVersion}</code>
        </div>
      )}
    </div>
  );
}
