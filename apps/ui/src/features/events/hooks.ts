import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useEventsStore } from "./store";
import { fetcher, getStreamUrl } from "@/lib/query";
import type { EliaEvent } from "@elia/shared";

export function useEventStream() {
  const { add, events, paused, clear, togglePaused } = useEventsStore();

  useEffect(() => {
    const es = new EventSource(getStreamUrl("/api/stream/events"));
    es.addEventListener("event", (ev: MessageEvent) => add(JSON.parse(ev.data)));
    es.onerror = () => {};
    return () => es.close();
  }, [add]);

  return { events, paused, clear, togglePaused };
}

export function useEmitEvent() {
  return useMutation({
    mutationFn: ({ type, payload }: { type: string; payload: unknown }) =>
      fetcher<EliaEvent>("/api/events", { method: "POST", body: JSON.stringify({ type, payload }) }),
  });
}
