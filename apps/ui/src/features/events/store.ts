import type { EliaEvent } from '@brika/shared';
import { create } from 'zustand';

interface EventsStore {
  events: EliaEvent[];
  paused: boolean;
  add: (e: EliaEvent) => void;
  clear: () => void;
  togglePaused: () => void;
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: [],
  paused: false,
  add: (e) =>
    set((s) => {
      if (s.paused) return s;
      const events = s.events.length > 500 ? [...s.events.slice(-450), e] : [...s.events, e];
      return { events };
    }),
  clear: () => set({ events: [] }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
}));
