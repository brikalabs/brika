import { Card, CardContent, CardHeader, CardTitle, Spinner } from '@brika/sdk/ui-kit';
import type { UploadItem } from '../types';

function StatusDot({ status }: Readonly<{ status: UploadItem['status'] }>) {
  if (status === 'uploading') {
    return <Spinner size="sm" className="shrink-0 text-primary" aria-label="Uploading" />;
  }
  if (status === 'done') {
    return <span className="size-3 shrink-0 rounded-full bg-success" />;
  }
  if (status === 'error') {
    return <span className="size-3 shrink-0 rounded-full bg-destructive" />;
  }
  return <span className="size-3 shrink-0 rounded-full bg-muted-foreground/30" />;
}

function UploadQueueRow({ item }: Readonly<{ item: UploadItem }>) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <StatusDot status={item.status} />
      <span className="flex-1 truncate text-muted-foreground">{item.file.name}</span>
      {item.status === 'error' && item.error && (
        <span className="max-w-24 truncate text-destructive">{item.error}</span>
      )}
    </div>
  );
}

export function UploadQueue({ items }: Readonly<{ items: UploadItem[] }>) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader className="px-3 pt-3 pb-1">
        <CardTitle className="font-medium text-muted-foreground text-xs">Uploads</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {items.map((item) => (
          <UploadQueueRow key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
