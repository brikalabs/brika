import { create } from 'zustand';
import type { BrikaEvent } from './types';

interface EventsStore {
  events: BrikaEvent[];
  paused: boolean;
  initialized: boolean;
  add: (e: BrikaEvent) => void;
  setHistory: (events: BrikaEvent[]) => void;
  clear: () => void;
  togglePaused: () => void;
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: [],
  paused: false,
  initialized: false,
  add: (e) =>
    set((s) => {
      if (s.paused) {
        return s;
      }
      // Deduplicate by id
      if (s.events.some((ev) => ev.id === e.id)) {
        return s;
      }
      const events = s.events.length > 500 ? [...s.events.slice(-450), e] : [...s.events, e];
      return {
        events,
      };
    }),
  setHistory: (history) =>
    set((s) => {
      // Merge history with any events that arrived via SSE before history loaded
      const existingIds = new Set(s.events.map((e) => e.id));
      const newFromHistory = history.filter((e) => !existingIds.has(e.id));
      // Combine and sort by timestamp (oldest first for internal storage)
      const merged = [...newFromHistory, ...s.events].sort((a, b) => a.ts - b.ts);
      return {
        events: merged,
        initialized: true,
      };
    }),
  clear: () =>
    set({
      events: [],
    }),
  togglePaused: () =>
    set((s) => ({
      paused: !s.paused,
    })),
}));
