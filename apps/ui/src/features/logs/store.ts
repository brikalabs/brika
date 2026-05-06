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
  // Logs ready for display (prepended to historical)
  newLogs: StoredLogEvent[];
  // Logs buffered from SSE, waiting to be revealed
  pendingLogs: StoredLogEvent[];
  paused: boolean;

  // Filters
  filters: LogFilters;

  // Actions
  addNew: (log: StoredLogEvent) => void;
  revealPending: () => void;
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
  pendingLogs: [],
  paused: false,
  filters: defaultFilters,

  // New SSE logs always go to pendingLogs (unless manually paused).
  // The UI decides when to promote them to newLogs via revealPending.
  addNew: (log) =>
    set((s) => {
      if (s.paused) { return s; }
      return { pendingLogs: [log, ...s.pendingLogs].slice(0, 500) };
    }),

  // Promote all pending logs into the displayed list.
  revealPending: () =>
    set((s) => {
      if (s.pendingLogs.length === 0) { return s; }
      return {
        newLogs: [...s.pendingLogs, ...s.newLogs].slice(0, 500),
        pendingLogs: [],
      };
    }),

  clearNew: () => set({ newLogs: [], pendingLogs: [] }),
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
