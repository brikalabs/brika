import React from "react";
import { useRules, useRuleMutations } from "./hooks";
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Label,
  Textarea,
  Separator,
  Switch,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { Plus, RefreshCw, Trash2, GitBranch, Zap, Loader2 } from "lucide-react";
import type { Rule } from "@elia/shared";

export function RulesPage() {
  const { data: rules = [], isLoading, refetch } = useRules();
  const { create, remove, enable, disable } = useRuleMutations();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", event: "", condition: "true", tool: "", args: "{}" });

  const handleCreate = async () => {
    await create.mutateAsync({
      name: form.name,
      event: form.event,
      condition: form.condition,
      action: { tool: form.tool, args: JSON.parse(form.args) },
      enabled: true,
    });
    setDialogOpen(false);
    setForm({ name: "", event: "", condition: "true", tool: "", args: "{}" });
  };

  const toggle = (r: Rule) => (r.enabled ? disable : enable).mutate(r.id);
  const isBusy = create.isPending || remove.isPending || enable.isPending || disable.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Rules</h2>
          <p className="text-muted-foreground">Event-driven automation rules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Rule</DialogTitle>
                <DialogDescription>Define an event-action automation</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Trigger Event</Label>
                  <Input
                    value={form.event}
                    onChange={(e) => setForm({ ...form, event: e.target.value })}
                    placeholder="motion.detected"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Textarea
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    placeholder="event.payload.zone === 'front'"
                    className="font-mono text-sm min-h-[60px]"
                  />
                </div>
                <Separator />
                <div className="flex gap-3">
                  <Input
                    value={form.tool}
                    onChange={(e) => setForm({ ...form, tool: e.target.value })}
                    placeholder="Tool name"
                    className="flex-1"
                  />
                  <Input
                    value={form.args}
                    onChange={(e) => setForm({ ...form, args: e.target.value })}
                    placeholder="{}"
                    className="flex-1 font-mono text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isBusy || !form.name || !form.event || !form.tool}
                  className="gap-2"
                >
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Name</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="size-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    <GitBranch className="size-8 mx-auto mb-2 opacity-50" />
                    No rules...
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id} className={!r.enabled ? "opacity-50" : undefined}>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono gap-1">
                        <Zap className="size-3" />
                        {r.event}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-0.5 rounded truncate max-w-[200px] block">
                        {r.condition}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {r.action?.tool ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} disabled={isBusy} />
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove.mutate(r.id)}
                            disabled={isBusy}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
