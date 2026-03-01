import { create } from "zustand";
import type { StoredLogEvent } from "./api";
import type { LogLevel, LogSource } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LogFilters {
  levels: LogLevel[];
  sources: LogSource[];
  pluginName: string | null;
  search: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface LogsStore {
  // Live logs that arrived via SSE (prepended to historical)
  newLogs: StoredLogEvent[];
  paused: boolean;

  // Filters
  filters: LogFilters;

  // Actions
  addNew: (log: StoredLogEvent) => void;
  clearNew: () => void;
  togglePaused: () => void;

  // Filter actions
  setLevels: (levels: LogLevel[]) => void;
  setSources: (sources: LogSource[]) => void;
  setPluginName: (name: string | null) => void;
  setSearch: (search: string) => void;
  setDateRange: (start: Date | null, end: Date | null) => void;
  resetFilters: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

const defaultFilters: LogFilters = {
  levels: [],
  sources: [],
  pluginName: null,
  search: "",
  startDate: null,
  endDate: null,
};

export const useLogsStore = create<LogsStore>((set) => ({
  newLogs: [],
  paused: false,
  filters: defaultFilters,

  addNew: (log) =>
    set((s) => {
      if (s.paused) { return s; }
      // Prepend new logs (newest first), keep max 500 in memory
      const logs = [log, ...s.newLogs].slice(0, 500);
      return { newLogs: logs };
    }),

  clearNew: () => set({ newLogs: [] }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  setLevels: (levels) => set((s) => ({ filters: { ...s.filters, levels } })),
  setSources: (sources) => set((s) => ({ filters: { ...s.filters, sources } })),
  setPluginName: (name) => set((s) => ({ filters: { ...s.filters, pluginName: name } })),
  setSearch: (search) => set((s) => ({ filters: { ...s.filters, search } })),
  setDateRange: (startDate, endDate) =>
    set((s) => ({
      filters: { ...s.filters, startDate, endDate },
    })),
  resetFilters: () => set({ filters: defaultFilters }),
}));

