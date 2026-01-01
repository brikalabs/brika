import React from "react";
import { useEventStream, useEmitEvent } from "./hooks";
import {
  Button, Card, CardContent, Badge, ScrollArea, Input, Textarea, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui";
import { Send, Pause, Play, Trash2, Zap, Loader2 } from "lucide-react";

export function EventsPage() {
  const { events, paused, clear, togglePaused } = useEventStream();
  const emitEvent = useEmitEvent();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [type, setType] = React.useState("test.event");
  const [payload, setPayload] = React.useState('{"message": "hello"}');

  const handleEmit = async () => {
    try {
      await emitEvent.mutateAsync({ type, payload: JSON.parse(payload) });
      setDialogOpen(false);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Events</h2>
          <p className="text-muted-foreground">Real-time event stream</p>
        </div>
        <div className="flex gap-2">
          <Button variant={paused ? "default" : "secondary"} onClick={togglePaused} className="gap-2">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" onClick={clear} className="gap-2"><Trash2 className="size-4" />Clear</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Send className="size-4" />Emit</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Emit Event</DialogTitle>
                <DialogDescription>Send a custom event</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Event Type</Label>
                  <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="motion.detected" />
                </div>
                <div className="space-y-2">
                  <Label>Payload (JSON)</Label>
                  <Textarea value={payload} onChange={(e) => setPayload(e.target.value)} className="font-mono text-sm min-h-[100px]" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEmit} disabled={emitEvent.isPending} className="gap-2">
                  {emitEvent.isPending && <Loader2 className="size-4 animate-spin" />}Emit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge variant="secondary">{events.length} events</Badge>
        {paused && <Badge variant="outline">Paused</Badge>}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {events.length === 0 ? (
              <div className="p-12 text-center">
                <Zap className="size-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold">No events yet</h3>
                <p className="text-muted-foreground mt-1">Events will appear here as they occur</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {events.map((e) => (
                  <div key={e.id} className="px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                          <Zap className="size-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-mono text-sm font-semibold">{e.type}</div>
                          <div className="text-xs text-muted-foreground">from {e.source}</div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {new Date(e.ts).toISOString().slice(11, 23)}
                      </span>
                    </div>
                    {e.payload && (
                      <pre className="mt-2 ml-11 text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-auto max-h-20">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

