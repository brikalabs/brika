import React, { useState } from "react";
import { useLocale } from "@/lib/use-locale";
import {
  Button,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { X, Search, Calendar } from "lucide-react";
import type { LogLevel, LogSource } from "@elia/shared";
import type { LogFilters } from "../store";
import type { PluginInfo } from "../api";

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LOG_SOURCES: LogSource[] = ["hub", "plugin", "installer", "registry", "stderr", "automation"];

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
  warn: "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30",
  info: "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
  debug: "bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30",
};

interface LogFilterBarProps {
  filters: LogFilters;
  pluginOptions: PluginInfo[];
  onLevelsChange: (levels: LogLevel[]) => void;
  onSourcesChange: (sources: LogSource[]) => void;
  onPluginChange: (ref: string | null) => void;
  onSearchChange: (search: string) => void;
  onDateRangeChange: (start: Date | null, end: Date | null) => void;
  onReset: () => void;
}

export function LogFilterBar({
  filters,
  pluginOptions,
  onLevelsChange,
  onSourcesChange,
  onPluginChange,
  onSearchChange,
  onDateRangeChange,
  onReset,
}: LogFilterBarProps) {
  const { t } = useLocale();
  const [searchInput, setSearchInput] = useState(filters.search);

  const hasActiveFilters =
    filters.levels.length > 0 ||
    filters.sources.length > 0 ||
    filters.pluginRef !== null ||
    filters.search !== "" ||
    filters.startDate !== null ||
    filters.endDate !== null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(searchInput);
  };

  const toggleLevel = (level: LogLevel) => {
    const newLevels = filters.levels.includes(level)
      ? filters.levels.filter((l) => l !== level)
      : [...filters.levels, level];
    onLevelsChange(newLevels);
  };

  const toggleSource = (source: LogSource) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source];
    onSourcesChange(newSources);
  };

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
    // Format as local datetime string for datetime-local input
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-3">
      {/* Search and Plugin Filter Row */}
      <div className="flex gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("logs:searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            {t("common:actions.search")}
          </Button>
        </form>

        {pluginOptions.length > 0 && (
          <Select
            value={filters.pluginRef ?? "all"}
            onValueChange={(v) => onPluginChange(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("logs:allPlugins")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("logs:allPlugins")}</SelectItem>
              {pluginOptions.map((plugin) => (
                <SelectItem key={plugin.ref} value={plugin.ref}>
                  {plugin.name}
                  {plugin.version && <span className="ml-1 text-muted-foreground">v{plugin.version}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" onClick={onReset} className="gap-2">
            <X className="size-4" />
            {t("logs:clearFilters")}
          </Button>
        )}
      </div>

      {/* Level Filter Pills */}
      <div className="flex gap-2 items-center">
        <span className="text-sm text-muted-foreground w-14">{t("logs:filters.level")}:</span>
        {LOG_LEVELS.map((level) => (
          <Badge
            key={level}
            variant={filters.levels.includes(level) ? "default" : "outline"}
            className={`cursor-pointer capitalize ${filters.levels.includes(level) ? LEVEL_COLORS[level] : ""}`}
            onClick={() => toggleLevel(level)}
          >
            {level}
          </Badge>
        ))}
      </div>

      {/* Source Filter Pills */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm text-muted-foreground w-14">{t("logs:filters.source")}:</span>
        {LOG_SOURCES.map((source) => (
          <Badge
            key={source}
            variant={filters.sources.includes(source) ? "default" : "outline"}
            className="cursor-pointer capitalize"
            onClick={() => toggleSource(source)}
          >
            {source}
          </Badge>
        ))}
      </div>

      {/* Date Range */}
      <div className="flex gap-3 items-center">
        <Calendar className="size-4 text-muted-foreground" />
        <Input
          type="datetime-local"
          value={formatDateForInput(filters.startDate)}
          onChange={(e) =>
            onDateRangeChange(e.target.value ? new Date(e.target.value) : null, filters.endDate)
          }
          className="w-auto"
        />
        <span className="text-muted-foreground">{t("logs:filters.to")}</span>
        <Input
          type="datetime-local"
          value={formatDateForInput(filters.endDate)}
          onChange={(e) =>
            onDateRangeChange(filters.startDate, e.target.value ? new Date(e.target.value) : null)
          }
          className="w-auto"
        />
      </div>
    </div>
  );
}
