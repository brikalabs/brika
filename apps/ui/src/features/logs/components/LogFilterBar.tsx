import type { PluginInfo } from "../api";
import type { LogFilters } from "../store";
import type { LogLevel, LogSource } from "../types";
import { LogDateRangeFilter } from "./LogDateRangeFilter";
import { LogLevelFilter } from "./LogLevelFilter";
import { LogSearchBar } from "./LogSearchBar";
import { LogSourceFilter } from "./LogSourceFilter";

interface LogFilterBarProps {
  filters: LogFilters;
  pluginOptions: PluginInfo[];
  levelOptions: LogLevel[];
  sourceOptions: LogSource[];
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
  levelOptions,
  sourceOptions,
  onLevelsChange,
  onSourcesChange,
  onPluginChange,
  onSearchChange,
  onDateRangeChange,
  onReset,
}: Readonly<LogFilterBarProps>) {
  const hasActiveFilters =
    filters.levels.length > 0 ||
    filters.sources.length > 0 ||
    filters.pluginName !== null ||
    filters.search !== "" ||
    filters.startDate !== null ||
    filters.endDate !== null;

  return (
    <div className="space-y-3">
      {/* Search and Plugin Filter Row */}
      <LogSearchBar
        search={filters.search}
        pluginName={filters.pluginName}
        pluginOptions={pluginOptions}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={onSearchChange}
        onPluginChange={onPluginChange}
        onReset={onReset}
      />

      {/* Level Filter Pills */}
      <LogLevelFilter
        selectedLevels={filters.levels}
        levelOptions={levelOptions}
        onLevelsChange={onLevelsChange}
      />

      {/* Source Filter Pills */}
      <LogSourceFilter
        selectedSources={filters.sources}
        sourceOptions={sourceOptions}
        onSourcesChange={onSourcesChange}
      />

      {/* Date Range */}
      <LogDateRangeFilter
        startDate={filters.startDate}
        endDate={filters.endDate}
        onDateRangeChange={onDateRangeChange}
      />
    </div>
  );
}
