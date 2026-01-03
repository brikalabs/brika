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
  ArrowRight,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-foreground to-foreground/70 bg-clip-text">
            {t("plugins:title")}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Plug className="size-4" />
            {t("plugins:subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
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
            const accent = health === "running" ? "blue" : health === "crashed" ? "orange" : undefined;
            return (
              <Link key={p.uid} to="/plugins/$uid" params={{ uid: p.uid }}>
                <Card accent={accent} interactive className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Plugin Icon */}
                    <Avatar className="size-12 rounded-xl shrink-0">
                      <AvatarImage src={pluginsApi.getIconUrl(p.uid)} />
                      <AvatarFallback className="rounded-xl bg-primary/10">
                        <Plug className="size-6 text-primary" />
                      </AvatarFallback>
                    </Avatar>

                    {/* Plugin Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate group-hover:text-foreground transition-colors">
                          {tp(p.name, "name")}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          v{p.version}
                        </Badge>
                      </div>
                      {p.description && (
                        <div className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                          {tp(p.name, "description")}
                        </div>
                      )}

                      {/* Stats Row */}
                      {(p.tools.length > 0 || p.blocks.length > 0) && (
                        <div className="flex gap-4 mt-2">
                          {p.tools.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Wrench className="size-3.5" />
                              <span>{p.tools.length} {t("tools:title").toLowerCase()}</span>
                            </div>
                          )}
                          {p.blocks.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Boxes className="size-3.5" />
                              <span>{p.blocks.length} {t("workflows:blocks").toLowerCase()}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error Display */}
                      {p.lastError && (
                        <div className="mt-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
                          {p.lastError}
                        </div>
                      )}
                    </div>

                    {/* Right Side: Status + Actions */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <Badge
                        variant={health === "running" ? "default" : health === "crashed" ? "destructive" : "secondary"}
                        className={cn(
                          health === "running" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                        )}
                      >
                        {t(`common:status.${health}`)}
                      </Badge>

                      <div className="flex gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
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
                              size="icon"
                              variant="ghost"
                              className="size-8"
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
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:text-destructive"
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
                    </div>

                    {/* Arrow indicator */}
                    <ArrowRight className="size-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all self-center" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
