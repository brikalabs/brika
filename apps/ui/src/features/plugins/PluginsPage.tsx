import React from "react";
import { Link } from "@tanstack/react-router";
import { usePlugins, usePluginMutations } from "./hooks";
import { pluginsApi } from "./api";
import { useLocale } from "@/lib/use-locale";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  Input,
  Badge,
  Label,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import {
  RefreshCw,
  Power,
  RotateCcw,
  Skull,
  Plug,
  Plus,
  Wrench,
  Loader2,
  ChevronRight,
  Boxes,
} from "lucide-react";

export function PluginsPage() {
  const { t, tp } = useLocale();
  const { data: plugins = [], isLoading, refetch } = usePlugins();
  const { load, disable, reload, kill } = usePluginMutations();
  const [ref, setRef] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const handleLoad = async () => {
    if (!ref) return;
    await load.mutateAsync(ref);
    setRef("");
    setDialogOpen(false);
  };

  const isBusy = load.isPending || disable.isPending || reload.isPending || kill.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("plugins:title")}</h2>
          <p className="text-muted-foreground">{t("plugins:subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            {t("common:actions.refresh")}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("plugins:actions.load")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("plugins:actions.load")}</DialogTitle>
                <DialogDescription>{t("plugins:dialog.loadDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>{t("plugins:labels.reference")}</Label>
                <Input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="file:./plugins/example-echo/src/index.ts"
                  className="font-mono text-sm"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("common:actions.cancel")}
                </Button>
                <Button onClick={handleLoad} disabled={isBusy || !ref} className="gap-2">
                  {load.isPending && <Loader2 className="size-4 animate-spin" />}
                  {t("plugins:actions.load")}
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
            <h3 className="font-semibold text-lg">{t("plugins:empty")}</h3>
            <p className="text-muted-foreground mt-1">{t("plugins:emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {plugins.map((p) => {
            const health = p.status;
            return (
              <Card key={p.uid} className="group hover:border-primary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      to="/plugins/$uid"
                      params={{ uid: p.uid }}
                      className="flex items-start gap-4 flex-1 group-hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="size-10 rounded-lg">
                        <AvatarImage src={pluginsApi.getIconUrl(p.uid)} />
                        <AvatarFallback className="rounded-lg bg-primary/10">
                          <Plug className="size-5 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{tp(p.name, "name")}</div>
                        {p.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                            {tp(p.name, "description")}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">v{p.version}</span>
                          {p.pid && <span className="text-xs text-muted-foreground">PID: {p.pid}</span>}
                        </div>
                      </div>
                      <ChevronRight className="size-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                    <Badge
                      variant={
                        health === "running" ? "default" : health === "crashed" ? "destructive" : "secondary"
                      }
                    >
                      {t(`common:status.${health}`)}
                    </Badge>
                  </div>

                  {(p.tools.length > 0 || p.blocks.length > 0) && (
                    <div className="mt-4 pt-4 border-t flex gap-6">
                      {p.tools.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Wrench className="size-4" />
                          <span>
                            {p.tools.length} {t("tools:title").toLowerCase()}
                          </span>
                        </div>
                      )}
                      {p.blocks.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Boxes className="size-4" />
                          <span>
                            {p.blocks.length} {t("workflows:blocks").toLowerCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {p.lastError && (
                    <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      {p.lastError}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            reload.mutate(p.uid);
                          }}
                          disabled={isBusy}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("plugins:actions.reload")}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            disable.mutate(p.uid);
                          }}
                          disabled={isBusy}
                        >
                          <Power className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("plugins:actions.disable")}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            kill.mutate(p.uid);
                          }}
                          disabled={isBusy}
                        >
                          <Skull className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("plugins:actions.kill")}</TooltipContent>
                    </Tooltip>
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
