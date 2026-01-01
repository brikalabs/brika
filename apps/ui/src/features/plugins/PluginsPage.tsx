import React from "react";
import { Link } from "@tanstack/react-router";
import { usePlugins, usePluginMutations } from "./hooks";
import {
  Button, Card, CardContent, Input, Badge, Label, Switch,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui";
import { RefreshCw, Power, RotateCcw, Skull, Plug, Plus, Wrench, Loader2, ChevronRight, Boxes } from "lucide-react";

export function PluginsPage() {
  const { data: plugins = [], isLoading, refetch } = usePlugins();
  const { enable, disable, reload, kill } = usePluginMutations();
  const [ref, setRef] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const handleEnable = async () => {
    if (!ref) return;
    await enable.mutateAsync(ref);
    setRef("");
    setDialogOpen(false);
  };

  const isBusy = enable.isPending || disable.isPending || reload.isPending || kill.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Plugins</h2>
          <p className="text-muted-foreground">Manage your installed plugins</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" />Enable Plugin</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enable Plugin</DialogTitle>
                <DialogDescription>Enter the plugin reference</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Plugin Reference</Label>
                <Input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="file:./plugins/example-echo/src/index.ts"
                  className="font-mono text-sm"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEnable} disabled={isBusy || !ref} className="gap-2">
                  {enable.isPending && <Loader2 className="size-4 animate-spin" />}
                  Enable
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : plugins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="size-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">No plugins loaded</h3>
            <p className="text-muted-foreground mt-1">Click "Enable Plugin" to load your first plugin</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {plugins.map((p) => {
            const pluginId = p.id || "";
            const health = typeof p.health === "string" ? p.health : p.health?.status || "unknown";
            
            return (
              <Card key={p.ref} className="group hover:border-primary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <Link 
                      to={`/plugins/${encodeURIComponent(pluginId)}`}
                      className="flex items-start gap-4 flex-1 group-hover:opacity-80 transition-opacity"
                    >
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                        <Plug className="size-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{pluginId || p.ref}</div>
                        {p.metadata?.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">{p.metadata.description}</div>
                        )}
                        <div className="text-xs text-muted-foreground font-mono mt-1 truncate">{p.ref}</div>
                      </div>
                      <ChevronRight className="size-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                    <Badge variant={health === "running" ? "default" : health === "crashed" ? "destructive" : "secondary"}>
                      {health}
                    </Badge>
                  </div>

                  {(p.tools.length > 0 || (p.blocks && p.blocks.length > 0)) && (
                    <div className="mt-4 pt-4 border-t flex gap-6">
                      {p.tools.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Wrench className="size-4" />
                          <span>{p.tools.length} tools</span>
                        </div>
                      )}
                      {p.blocks && p.blocks.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Boxes className="size-4" />
                          <span>{p.blocks.length} blocks</span>
                        </div>
                      )}
                    </div>
                  )}

                  {p.lastError && (
                    <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{p.lastError}</div>
                  )}

                  <div className="mt-4 pt-4 border-t flex gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); reload.mutate(p.ref); }} disabled={isBusy}>
                        <RotateCcw className="size-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent>Reload</TooltipContent></Tooltip>

                    <Tooltip><TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); disable.mutate(p.ref); }} disabled={isBusy}>
                        <Power className="size-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent>Disable</TooltipContent></Tooltip>

                    <Tooltip><TooltipTrigger asChild>
                      <Button size="sm" variant="destructive" onClick={(e) => { e.preventDefault(); kill.mutate(p.ref); }} disabled={isBusy}>
                        <Skull className="size-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent>Kill</TooltipContent></Tooltip>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

