import { Card, CardContent } from '@brika/sdk/ui-kit';
import { Shield } from '@brika/sdk/ui-kit/icons';

export function PermissionGate() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Shield className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold">Filesystem access required</p>
          <p className="mx-auto mt-1 max-w-xs text-muted-foreground text-sm">
            Enable the <span className="font-medium text-foreground">Filesystem</span> permission in
            the Permissions card to browse and manage files.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
