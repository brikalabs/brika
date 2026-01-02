import React from "react";
import { useStoreMutations } from "./hooks";
import { Button, Card, CardContent, Input, Label } from "@/components/ui";
import { Package, Download, Trash2, Loader2 } from "lucide-react";

export function StorePage() {
  const { install, uninstall } = useStoreMutations();
  const [ref, setRef] = React.useState("");
  const [wanted, setWanted] = React.useState("");

  const handleInstall = async () => {
    if (!ref) return;
    await install.mutateAsync({ ref, wanted: wanted || undefined });
    setRef("");
    setWanted("");
  };

  const handleUninstall = async () => {
    if (!ref) return;
    await uninstall.mutateAsync(ref);
    setRef("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Store</h2>
        <p className="text-muted-foreground">Install plugins from npm or git</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <Package className="size-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Install Plugin</h3>
              <p className="text-sm text-muted-foreground">Install from npm or git URL</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Package Reference</Label>
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="@elia/plugin-hue or git+https://..."
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Version (optional)</Label>
              <Input
                value={wanted}
                onChange={(e) => setWanted(e.target.value)}
                placeholder="^1.0.0"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleInstall} disabled={install.isPending || !ref} className="gap-2">
                {install.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Install
              </Button>
              <Button
                variant="destructive"
                onClick={handleUninstall}
                disabled={uninstall.isPending || !ref}
                className="gap-2"
              >
                {uninstall.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Uninstall
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-12 text-center">
          <Package className="size-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <p className="text-muted-foreground">Plugin registry coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

