import { Download, Pause, Play, Radio, RefreshCw, Trash2 } from "lucide-react";
import React from "react";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { useLocale } from "@/lib/use-locale";
import { LogFilterBar } from "./components/LogFilterBar";
import { LogList } from "./components/LogList";
import { useLogs } from "./hooks";

export function LogsPage() {
  const { t } = useLocale();
  const {
    logs,
    newLogsCount,
    paused,
    togglePaused,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    filters,
    setLevels,
    setSources,
    setPluginRef,
    setSearch,
    setDateRange,
    resetFilters,
    pluginOptions,
    stats,
    clear,
    isClearing,
  } = useLogs();

  const handleExport = () => {
    const content = logs
      .map(
        (l) =>
          `${new Date(l.ts).toISOString()} [${l.level.toUpperCase()}] ${l.source}${l.pluginRef ? `:${l.pluginRef}` : ""}: ${l.message} ${l.meta ? JSON.stringify(l.meta) : ""}`,
      )
      .join("\n");

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = `brika-logs-${Date.now()}.txt`;
    a.click();
  };

  const handleClear = async () => {
    if (confirm(t("logs:confirmClear"))) {
      await clear({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">{t("logs:title")}</h2>
          <p className="text-muted-foreground">
            {stats ? t("logs:totalStored", { count: stats.total.toLocaleString() }) : t("common:loading")}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant={paused ? "default" : "secondary"} onClick={togglePaused} className="gap-2">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? t("logs:actions.resume") : t("logs:actions.pause")}
          </Button>

          <Button variant="secondary" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="size-4" />
            {t("common:actions.refresh")}
          </Button>

          <Button variant="outline" onClick={handleClear} disabled={isClearing} className="gap-2">
            <Trash2 className="size-4" />
            {t("logs:actions.clear")}
          </Button>

          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="size-4" />
            {t("logs:actions.export")}
          </Button>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex gap-2">
        <Badge variant="secondary">{t("logs:displayed", { count: logs.length })}</Badge>
        {newLogsCount > 0 && <Badge variant="default">{t("logs:new", { count: newLogsCount })}</Badge>}
        {paused && <Badge variant="outline">{t("logs:paused")}</Badge>}
        {!paused && (
          <Badge variant="outline" className="animate-pulse">
            <Radio className="mr-1 size-3" />
            {t("logs:streaming")}
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <LogFilterBar
            filters={filters}
            pluginOptions={pluginOptions}
            onLevelsChange={setLevels}
            onSourcesChange={setSources}
            onPluginChange={setPluginRef}
            onSearchChange={setSearch}
            onDateRangeChange={setDateRange}
            onReset={resetFilters}
          />
        </CardContent>
      </Card>

      {/* Log List */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <LogList
            logs={logs}
            isLoading={isLoading}
            isFetchingMore={isFetchingNextPage}
            hasMore={hasNextPage}
            onLoadMore={fetchNextPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
