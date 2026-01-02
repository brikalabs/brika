import { usePlugin, usePluginMutations } from "./hooks";
import { pluginsApi } from "./api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import {
  ArrowLeft,
  RefreshCw,
  Power,
  RotateCcw,
  Skull,
  Plug,
  Wrench,
  Boxes,
  ExternalLink,
  Tag,
  User,
  Github,
  Clock,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Link } from "@tanstack/react-router";
import { Uptime } from "@/components/Uptime";

interface PluginDetailPageProps {
  pluginUid: string;
}

export function PluginDetailPage({ pluginUid }: PluginDetailPageProps) {
  const { data: plugin, isLoading, error, refetch } = usePlugin(pluginUid);
  const { reload, disable, kill } = usePluginMutations();

  const isBusy = reload.isPending || disable.isPending || kill.isPending;

  // Extract author name
  const getAuthorName = () => {
    if (!plugin?.author) return null;
    if (typeof plugin.author === "string") return plugin.author;
    return plugin.author.name;
  };

  // Extract repository URL with directory path for direct linking
  const getRepoUrl = () => {
    if (!plugin?.repository) return null;

    if (typeof plugin.repository === "string") {
      return plugin.repository;
    }

    let url = plugin.repository.url;
    if (!url) return null;

    url = url.replace(/\.git$/, "");

    const directory = plugin.repository.directory;
    if (directory) {
      url = `${url}/tree/HEAD/${directory}`;
    }

    return url;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !plugin) {
    return (
      <div className="space-y-6">
        <Link
          to="/plugins"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Plugins
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="size-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Plugin not found</h3>
            <p className="text-muted-foreground mt-1">
              The plugin "{pluginUid}" is not loaded or doesn't exist
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const authorName = getAuthorName();
  const repoUrl = getRepoUrl();
  const tools = plugin.tools ?? [];
  const blocks = plugin.blocks ?? [];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/plugins"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Plugins
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Plugin Icon */}
          <Avatar className="size-16 rounded-xl">
            <AvatarImage src={pluginsApi.getIconUrl(plugin.uid)} />
            <AvatarFallback className="rounded-xl bg-primary/10">
              <Plug className="size-8 text-primary" />
            </AvatarFallback>
          </Avatar>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">{plugin.name}</h1>
            {plugin.description && (
              <p className="text-muted-foreground mt-1">{plugin.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
              <Badge variant="outline" className="gap-1">
                v{plugin.version}
              </Badge>
              {authorName && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {authorName}
                </span>
              )}
              {repoUrl && (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Github className="size-3" />
                  Repository
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={
              plugin.status === "running"
                ? "default"
                : plugin.status === "crashed"
                  ? "destructive"
                  : "secondary"
            }
            className="px-3 py-1"
          >
            {plugin.status}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => reload.mutate(plugin.uid)}
                disabled={isBusy}
              >
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => disable.mutate(plugin.uid)}
                disabled={isBusy}
              >
                <Power className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disable</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="destructive"
                onClick={() => kill.mutate(plugin.uid)}
                disabled={isBusy}
              >
                <Skull className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Kill</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Keywords */}
      {plugin.keywords.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plugin.keywords.map((kw) => (
            <Badge key={kw} variant="secondary" className="gap-1">
              <Tag className="size-3" />
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {/* Error display */}
      {plugin.lastError && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <strong>Error:</strong> {plugin.lastError}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wrench className="size-4" />
              Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tools.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Boxes className="size-4" />
              Blocks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{blocks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Process ID</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{plugin.pid ?? "-"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="size-4" />
              Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Uptime
              startedAt={plugin.startedAt}
              className="text-2xl font-bold"
            />
            {plugin.startedAt && (
              <div className="text-xs text-muted-foreground mt-1">
                Started {new Date(plugin.startedAt).toLocaleTimeString()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tools Grid */}
      {tools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Available Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => {
                const iconName = (tool.icon || "wrench") as IconName;
                const color = tool.color || "#d97706";

                return (
                  <div
                    key={tool.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="size-10 rounded-lg">
                      <AvatarFallback className="rounded-lg" style={{ backgroundColor: `${color}20`, color }}>
                        <DynamicIcon name={iconName} className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{tool.id}</div>
                      {tool.description && (
                        <div className="text-xs text-muted-foreground truncate">{tool.description}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocks Grid */}
      {blocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="size-5" />
              Available Blocks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {blocks.map((block) => {
                const iconName = (block.icon || "box") as IconName;
                const color = block.color || "#6366f1";

                return (
                  <div
                    key={block.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="size-10 rounded-lg">
                      <AvatarFallback className="rounded-lg" style={{ backgroundColor: `${color}20`, color }}>
                        <DynamicIcon name={iconName} className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{block.name || block.id}</div>
                      {block.description && (
                        <div className="text-xs text-muted-foreground truncate">{block.description}</div>
                      )}
                    </div>
                    {block.category && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {block.category}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reference & Installation Info */}
      <Card>
        <CardHeader>
          <CardTitle>Installation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">UID:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs">{plugin.uid}</code>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">Directory:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs break-all">{plugin.dir}</code>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">Reference:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs break-all">{plugin.ref}</code>
          </div>
          {plugin.license && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-muted-foreground w-24 shrink-0">License:</span>
              <span>{plugin.license}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
