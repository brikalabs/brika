import React from "react";
import { usePlugin, usePluginMutations } from "./hooks";
import { pluginsApi } from "./api";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
} from "lucide-react";
import { Link } from "@tanstack/react-router";

interface PluginDetailPageProps {
  pluginId: string;
}

export function PluginDetailPage({ pluginId }: PluginDetailPageProps) {
  const { data: plugin, isLoading, error, refetch } = usePlugin(pluginId);
  const { reload, disable, kill } = usePluginMutations();

  const isBusy = reload.isPending || disable.isPending || kill.isPending;

  // Extract author name
  const getAuthorName = () => {
    if (!plugin?.metadata?.author) return null;
    if (typeof plugin.metadata.author === "string") return plugin.metadata.author;
    return plugin.metadata.author.name;
  };

  // Extract repository URL
  const getRepoUrl = () => {
    if (!plugin?.metadata?.repository) return null;
    if (typeof plugin.metadata.repository === "string") return plugin.metadata.repository;
    return plugin.metadata.repository.url;
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
              The plugin "{pluginId}" is not loaded or doesn't exist
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const authorName = getAuthorName();
  const repoUrl = getRepoUrl();

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
            {plugin.uid && <AvatarImage src={pluginsApi.getIconUrl(plugin.uid)} />}
            <AvatarFallback className="rounded-xl bg-primary/10">
              <Plug className="size-8 text-primary" />
            </AvatarFallback>
          </Avatar>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">{plugin.id}</h1>
            {plugin.metadata?.description && (
              <p className="text-muted-foreground mt-1">{plugin.metadata.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
              <Badge variant="outline" className="gap-1">
                v{plugin.version || "0.0.0"}
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
              plugin.health === "running"
                ? "default"
                : plugin.health === "crashed"
                  ? "destructive"
                  : "secondary"
            }
            className="px-3 py-1"
          >
            {plugin.health}
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
                onClick={() => reload.mutate(plugin.ref)}
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
                onClick={() => disable.mutate(plugin.ref)}
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
                onClick={() => kill.mutate(plugin.ref)}
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
      {plugin.metadata?.keywords && plugin.metadata.keywords.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plugin.metadata.keywords.map((kw) => (
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wrench className="size-4" />
              Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plugin.tools?.length || 0}</div>
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
            <div className="text-2xl font-bold">{plugin.blocks?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Process ID</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{plugin.pid || "-"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tools Table */}
      {plugin.tools && plugin.tools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Registered Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plugin.tools.map((tool) => (
                  <TableRow key={tool}>
                    <TableCell className="font-mono text-sm">{tool}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Blocks Table */}
      {plugin.blocks && plugin.blocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="size-5" />
              Registered Blocks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Block ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plugin.blocks.map((block) => (
                  <TableRow key={block}>
                    <TableCell className="font-mono text-sm">{block}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Reference & Installation Info */}
      <Card>
        <CardHeader>
          <CardTitle>Installation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-24">Reference:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs">{plugin.ref}</code>
          </div>
          {plugin.metadata?.license && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground w-24">License:</span>
              <span>{plugin.metadata.license}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

