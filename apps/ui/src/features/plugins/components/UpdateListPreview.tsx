interface UpdateItem {
  name: string;
  currentVersion: string;
  latestVersion: string;
}

interface UpdateListPreviewProps {
  updates: UpdateItem[];
}

export function UpdateListPreview({ updates }: UpdateListPreviewProps) {
  return (
    <div className="space-y-2">
      {updates.map((u) => (
        <div key={u.name} className="flex items-center justify-between rounded-md bg-muted/50 p-2">
          <span className="font-mono text-sm">{u.name}</span>
          <span className="text-muted-foreground text-sm">
            {u.currentVersion} → {u.latestVersion}
          </span>
        </div>
      ))}
    </div>
  );
}
