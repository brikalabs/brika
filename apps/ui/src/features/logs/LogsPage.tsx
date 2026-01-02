import React from "react";
import { useLogs } from "./hooks";
import { LogFilterBar } from "./components/LogFilterBar";
import { LogList } from "./components/LogList";
import { Button, Card, CardContent, Badge } from "@/components/ui";
import { Pause, Play, Trash2, Download, RefreshCw, Radio } from "lucide-react";

export function LogsPage() {
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
    a.download = `elia-logs-${Date.now()}.txt`;
    a.click();
  };

  const handleClear = async () => {
    if (confirm("Are you sure you want to clear all logs? This cannot be undone.")) {
      await clear({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Logs</h2>
          <p className="text-muted-foreground">
            {stats ? `${stats.total.toLocaleString()} total logs stored` : "Loading..."}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant={paused ? "default" : "secondary"} onClick={togglePaused} className="gap-2">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>

          <Button variant="secondary" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="size-4" />
            Refresh
          </Button>

          <Button variant="outline" onClick={handleClear} disabled={isClearing} className="gap-2">
            <Trash2 className="size-4" />
            Clear
          </Button>

          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex gap-2">
        <Badge variant="secondary">{logs.length} logs displayed</Badge>
        {newLogsCount > 0 && <Badge variant="default">{newLogsCount} new</Badge>}
        {paused && <Badge variant="outline">Paused</Badge>}
        {!paused && (
          <Badge variant="outline" className="animate-pulse">
            <Radio className="size-3 mr-1" />
            Streaming
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

