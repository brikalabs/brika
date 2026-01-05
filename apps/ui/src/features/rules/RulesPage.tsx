import type { Rule } from '@brika/shared';
import { GitBranch, Loader2, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useRuleMutations, useRules } from './hooks';

export function RulesPage() {
  const { t } = useLocale();
  const { data: rules = [], isLoading, refetch } = useRules();
  const { create, remove, enable, disable } = useRuleMutations();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    event: '',
    condition: 'true',
    tool: '',
    args: '{}',
  });

  const handleCreate = async () => {
    await create.mutateAsync({
      name: form.name,
      trigger: { type: 'event', match: form.event },
      condition: form.condition,
      actions: [{ tool: form.tool, args: JSON.parse(form.args) }],
      enabled: true,
    });
    setDialogOpen(false);
    setForm({ name: '', event: '', condition: 'true', tool: '', args: '{}' });
  };

  const toggle = (r: Rule) => (r.enabled ? disable : enable).mutate(r.id);
  const isBusy = create.isPending || remove.isPending || enable.isPending || disable.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">{t('rules:title')}</h2>
          <p className="text-muted-foreground">{t('rules:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common:actions.refresh')}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                {t('rules:actions.create')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('rules:actions.create')}</DialogTitle>
                <DialogDescription>{t('rules:dialog.description')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('common:labels.name')}</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t('rules:labels.event')}</Label>
                  <Input
                    value={form.event}
                    onChange={(e) => setForm({ ...form, event: e.target.value })}
                    placeholder="motion.detected"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('rules:labels.condition')}</Label>
                  <Textarea
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    placeholder="event.payload.zone === 'front'"
                    className="min-h-[60px] font-mono text-sm"
                  />
                </div>
                <Separator />
                <div className="flex gap-3">
                  <Input
                    value={form.tool}
                    onChange={(e) => setForm({ ...form, tool: e.target.value })}
                    placeholder={t('rules:labels.tool')}
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
                  {t('common:actions.cancel')}
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isBusy || !form.name || !form.event || !form.tool}
                  className="gap-2"
                >
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {t('rules:actions.create')}
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
                <TableHead className="w-[200px]">{t('common:labels.name')}</TableHead>
                <TableHead>{t('rules:labels.event')}</TableHead>
                <TableHead>{t('rules:labels.condition')}</TableHead>
                <TableHead>{t('rules:labels.action')}</TableHead>
                <TableHead className="w-[80px]">{t('common:labels.status')}</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    <GitBranch className="mx-auto mb-2 size-8 opacity-50" />
                    {t('rules:empty')}
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id} className={!r.enabled ? 'opacity-50' : undefined}>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 font-mono">
                        <Zap className="size-3" />
                        {r.trigger.type === 'event' ? r.trigger.match : r.trigger.scheduleId}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="block max-w-[200px] truncate rounded bg-muted px-2 py-0.5 text-sm">
                        {r.condition}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {r.actions[0]?.tool ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={() => toggle(r)}
                        disabled={isBusy}
                      />
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
                        <TooltipContent>{t('common:actions.delete')}</TooltipContent>
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
