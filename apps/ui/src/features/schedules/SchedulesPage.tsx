import React from "react";
import { useSchedules, useScheduleMutations } from "./hooks";
import {
  Button, Card, CardContent, Badge, Input, Label, Select, Separator, Switch,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui";
import { Plus, RefreshCw, Trash2, Calendar, Clock, Loader2 } from "lucide-react";
import type { Schedule } from "@elia/shared";

export function SchedulesPage() {
  const { data: schedules = [], isLoading, refetch } = useSchedules();
  const { create, remove, enable, disable } = useScheduleMutations();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", triggerType: "cron" as "cron" | "interval", cron: "0 * * * *", interval: "60000", tool: "", args: "{}" });

  const handleCreate = async () => {
    const trigger = form.triggerType === "cron" ? { type: "cron" as const, expr: form.cron } : { type: "interval" as const, ms: +form.interval };
    await create.mutateAsync({ name: form.name, trigger, action: { tool: form.tool, args: JSON.parse(form.args) }, enabled: true });
    setDialogOpen(false);
    setForm({ name: "", triggerType: "cron", cron: "0 * * * *", interval: "60000", tool: "", args: "{}" });
  };

  const toggle = (s: Schedule) => (s.enabled ? disable : enable).mutate(s.id);
  const fmt = (s: Schedule) => {
    if (!s.trigger) return "—";
    return s.trigger.type === "cron" ? s.trigger.expr : `Every ${s.trigger.ms / 1000}s`;
  };
  const isBusy = create.isPending || remove.isPending || enable.isPending || disable.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight">Schedules</h2><p className="text-muted-foreground">Scheduled tasks</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Create</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader><DialogTitle>Create Schedule</DialogTitle><DialogDescription>Set up a scheduled task</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <Separator />
                <div className="flex gap-3">
                  <Select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value as "cron" | "interval" })} className="w-32">
                    <option value="cron">Cron</option><option value="interval">Interval</option>
                  </Select>
                  {form.triggerType === "cron" ? (
                    <Input value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} placeholder="0 * * * *" className="flex-1 font-mono" />
                  ) : (
                    <Input type="number" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} className="flex-1 font-mono" />
                  )}
                </div>
                <Separator />
                <div className="flex gap-3">
                  <Input value={form.tool} onChange={(e) => setForm({ ...form, tool: e.target.value })} placeholder="Tool name" className="flex-1" />
                  <Input value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder="{}" className="flex-1 font-mono text-sm" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={isBusy || !form.name || !form.tool} className="gap-2">
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-[250px]">Name</TableHead><TableHead>Trigger</TableHead><TableHead>Action</TableHead><TableHead className="w-[100px]">Status</TableHead><TableHead className="w-[80px]" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="size-6 animate-spin mx-auto" /></TableCell></TableRow>
            : schedules.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground"><Calendar className="size-8 mx-auto mb-2 opacity-50" />No schedules...</TableCell></TableRow>
            : schedules.map((s) => (
              <TableRow key={s.id} className={!s.enabled ? "opacity-50" : undefined}>
                <TableCell><div className="flex items-center gap-2">{s.trigger?.type === "cron" ? <Calendar className="size-4 text-muted-foreground" /> : <Clock className="size-4 text-muted-foreground" />}<span className="font-medium">{s.name}</span></div></TableCell>
                <TableCell><code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{fmt(s)}</code></TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{s.action?.tool ?? "—"}</Badge></TableCell>
                <TableCell><Switch checked={s.enabled} onCheckedChange={() => toggle(s)} disabled={isBusy} /></TableCell>
                <TableCell><Tooltip><TooltipTrigger asChild><Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)} disabled={isBusy}><Trash2 className="size-4" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

