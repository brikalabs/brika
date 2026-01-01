import React from "react";
import { useLogStream } from "./hooks";
import { Button, Card, CardContent, Badge, ScrollArea, Select } from "@/components/ui";
import { Pause, Play, Trash2, Download, Filter } from "lucide-react";

const LEVEL_COLORS: Record<string, string> = {
  error: "text-red-400 bg-red-500/10",
  warn: "text-yellow-400 bg-yellow-500/10",
  info: "text-emerald-400 bg-emerald-500/10",
  debug: "text-zinc-400 bg-zinc-500/10",
};

export function LogsPage() {
  const { logs, allLogs, paused, level, clear, togglePaused, setLevel } = useLogStream();

  const download = () => {
    const content = allLogs.map((l) =>
      `${new Date(l.ts).toISOString()} [${l.level.toUpperCase()}] ${l.source}: ${l.message} ${l.meta ? JSON.stringify(l.meta) : ""}`
    ).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = `elia-logs-${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Logs</h2>
          <p className="text-muted-foreground">Real-time log stream</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="w-28">
              <option value="all">All</option>
              <option value="error">Error</option>
              <option value="warn">Warn</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </Select>
          </div>
          <Button variant={paused ? "default" : "secondary"} onClick={togglePaused} className="gap-2">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" onClick={clear} className="gap-2"><Trash2 className="size-4" />Clear</Button>
          <Button variant="outline" onClick={download} className="gap-2"><Download className="size-4" />Export</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge variant="secondary">{logs.length} logs</Badge>
        {paused && <Badge variant="outline">Paused</Badge>}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="font-mono text-xs">
              {logs.length === 0 ? (
                <div className="p-8 text-muted-foreground text-center">No logs yet...</div>
              ) : logs.map((l, i) => (
                <div key={`${l.ts}-${i}`} className="flex gap-3 px-4 py-1.5 border-b border-border/30 hover:bg-muted/30 items-start">
                  <span className="text-muted-foreground shrink-0 tabular-nums">{new Date(l.ts).toISOString().slice(11, 23)}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${LEVEL_COLORS[l.level] || ""}`}>{l.level}</span>
                  <span className="text-muted-foreground shrink-0 w-24 truncate">{l.source}</span>
                  <span className="text-foreground">{l.message}</span>
                  {l.meta && <span className="text-muted-foreground/70 truncate">{JSON.stringify(l.meta)}</span>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

