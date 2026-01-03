import { usePlugin, usePluginMutations } from "./hooks";
import { pluginsApi } from "./api";
import { useLocale } from "@/lib/use-locale";
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
  Globe,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Link, Route, useParams } from "@tanstack/react-router";
import { Uptime } from "@/components/Uptime";

export function PluginDetailPage() {
  const { uid: pluginUid } = useParams({ strict: false });
  const { data: plugin, isLoading, error, refetch } = usePlugin(pluginUid!);
  const { reload, disable, kill } = usePluginMutations();
  const { t, tp, getLanguageName, formatTime } = useLocale();
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
          {t("plugins:backToList")}
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="size-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">{t("plugins:notFound")}</h3>
            <p className="text-muted-foreground mt-1">{t("plugins:notFoundDetail", { uid: pluginUid })}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const authorName = getAuthorName();
  const repoUrl = getRepoUrl();
  const tools = plugin.tools ?? [];
  const blocks = plugin.blocks ?? [];
  const locales = plugin.locales ?? [];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/plugins"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        {t("plugins:backToList")}
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
            <h1 className="text-2xl font-bold tracking-tight">{tp(plugin.name, "name")}</h1>
            <code className="text-xs text-muted-foreground font-mono">{plugin.name}</code>
            {plugin.description && (
              <p className="text-muted-foreground mt-1">{tp(plugin.name, "description")}</p>
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
                  {t("plugins:details.repository")}
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
            {t(`common:status.${plugin.status}`)}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common:actions.refresh")}</TooltipContent>
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
            <TooltipContent>{t("plugins:actions.reload")}</TooltipContent>
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
            <TooltipContent>{t("plugins:actions.disable")}</TooltipContent>
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
            <TooltipContent>{t("plugins:actions.kill")}</TooltipContent>
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

      {/* Languages */}
      {locales.length > 0 && (
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("plugins:details.languages")}:</span>
          <div className="flex flex-wrap gap-1.5">
            {locales.map((loc) => (
              <Tooltip key={loc}>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="uppercase text-xs font-mono">
                    {loc}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{getLanguageName(loc)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {plugin.lastError && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <strong>{t("common:labels.error")}:</strong> {plugin.lastError}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wrench className="size-4" />
              {t("tools:title")}
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
              {t("workflows:blocks")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{blocks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("plugins:details.pid")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{plugin.pid ?? "-"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="size-4" />
              {t("plugins:details.uptime")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Uptime startedAt={plugin.startedAt} className="text-2xl font-bold" />
            {plugin.startedAt && (
              <div className="text-xs text-muted-foreground mt-1">
                {t("plugins:details.startedAt")} {formatTime(plugin.startedAt)}
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
              {t("plugins:details.availableTools")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => {
                const iconName = (tool.icon || "wrench") as IconName;
                const color = tool.color || "#d97706";
                const toolKey = tool.id.split(":").pop() || tool.id;
                const toolName = tp(plugin.name, `tools.${toolKey}.name`, toolKey);
                const toolDesc = tp(plugin.name, `tools.${toolKey}.description`, tool.description);

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
                      <div className="font-medium text-sm truncate">{toolName}</div>
                      {toolDesc && <div className="text-xs text-muted-foreground truncate">{toolDesc}</div>}
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
              {t("plugins:details.availableBlocks")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {blocks.map((block) => {
                const iconName = (block.icon || "box") as IconName;
                const color = block.color || "#6366f1";
                const blockKey = block.id.split(":").pop() || block.id;
                const blockName = tp(plugin.name, `blocks.${blockKey}.name`, block.name || blockKey);
                const blockDesc = tp(plugin.name, `blocks.${blockKey}.description`, block.description);

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
                      <div className="font-medium text-sm truncate">{blockName}</div>
                      {blockDesc && <div className="text-xs text-muted-foreground truncate">{blockDesc}</div>}
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
          <CardTitle>{t("plugins:details.installation")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">UID:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs">{plugin.uid}</code>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">{t("plugins:details.directory")}:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs break-all">{plugin.dir}</code>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">{t("plugins:labels.reference")}:</span>
            <code className="font-mono bg-muted px-2 py-1 rounded text-xs break-all">{plugin.ref}</code>
          </div>
          {plugin.license && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-muted-foreground w-24 shrink-0">{t("plugins:details.license")}:</span>
              <span>{plugin.license}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
