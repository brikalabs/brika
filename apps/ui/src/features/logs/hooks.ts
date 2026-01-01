import { useEffect } from "react";
import { useLogsStore } from "./store";
import { getStreamUrl } from "@/lib/query";

export function useLogStream() {
  const store = useLogsStore();

  useEffect(() => {
    const es = new EventSource(getStreamUrl("/api/stream/logs"));
    es.addEventListener("log", (ev: MessageEvent) => store.add(JSON.parse(ev.data)));
    es.onerror = () => {};
    return () => es.close();
  }, [store.add]);

  const filtered = store.level === "all" ? store.logs : store.logs.filter((l) => l.level === store.level);

  return { ...store, logs: filtered, allLogs: store.logs };
}

