import { create } from "zustand";
import type { LogEvent } from "@elia/shared";

interface LogsStore {
  logs: LogEvent[];
  paused: boolean;
  level: "all" | "error" | "warn" | "info" | "debug";
  add: (log: LogEvent) => void;
  clear: () => void;
  togglePaused: () => void;
  setLevel: (level: LogsStore["level"]) => void;
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  paused: false,
  level: "all",
  add: (log) => set((s) => {
    if (s.paused) return s;
    const logs = s.logs.length > 1000 ? [...s.logs.slice(-900), log] : [...s.logs, log];
    return { logs };
  }),
  clear: () => set({ logs: [] }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setLevel: (level) => set({ level }),
}));

