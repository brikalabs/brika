import type { Schedule } from '@brika/shared';
import { Calendar, Clock, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
  Select,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useScheduleMutations, useSchedules } from './hooks';

export function SchedulesPage() {
  const { t } = useLocale();
  const { data: schedules = [], isLoading, refetch } = useSchedules();
  const { create, remove, enable, disable } = useScheduleMutations();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    triggerType: 'cron' as 'cron' | 'interval',
    cron: '0 * * * *',
    interval: '60000',
    tool: '',
    args: '{}',
  });

  const handleCreate = async () => {
    const trigger =
      form.triggerType === 'cron'
        ? { type: 'cron' as const, expr: form.cron }
        : { type: 'interval' as const, ms: +form.interval };
    await create.mutateAsync({
      name: form.name,
      trigger,
      action: { tool: form.tool, args: JSON.parse(form.args) },
      enabled: true,
    });
    setDialogOpen(false);
    setForm({
      name: '',
      triggerType: 'cron',
      cron: '0 * * * *',
      interval: '60000',
      tool: '',
      args: '{}',
    });
  };

  const toggle = (s: Schedule) => (s.enabled ? disable : enable).mutate(s.id);
  const fmt = (s: Schedule) => {
    if (!s.trigger) return '—';
    return s.trigger.type === 'cron'
      ? s.trigger.expr
      : `${t('schedules:every')} ${s.trigger.ms / 1000}s`;
  };
  const isBusy = create.isPending || remove.isPending || enable.isPending || disable.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">{t('schedules:title')}</h2>
          <p className="text-muted-foreground">{t('schedules:subtitle')}</p>
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
                {t('schedules:actions.create')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('schedules:actions.create')}</DialogTitle>
                <DialogDescription>{t('schedules:dialog.description')}</DialogDescription>
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
                <div className="flex gap-3">
                  <Select
                    value={form.triggerType}
                    onChange={(e) =>
                      setForm({ ...form, triggerType: e.target.value as 'cron' | 'interval' })
                    }
                    className="w-32"
                  >
                    <option value="cron">{t('schedules:cron')}</option>
                    <option value="interval">{t('schedules:interval')}</option>
                  </Select>
                  {form.triggerType === 'cron' ? (
                    <Input
                      value={form.cron}
                      onChange={(e) => setForm({ ...form, cron: e.target.value })}
                      placeholder="0 * * * *"
                      className="flex-1 font-mono"
                    />
                  ) : (
                    <Input
                      type="number"
                      value={form.interval}
                      onChange={(e) => setForm({ ...form, interval: e.target.value })}
                      className="flex-1 font-mono"
                    />
                  )}
                </div>
                <Separator />
                <div className="flex gap-3">
                  <Input
                    value={form.tool}
                    onChange={(e) => setForm({ ...form, tool: e.target.value })}
                    placeholder={t('schedules:labels.tool')}
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
                  disabled={isBusy || !form.name || !form.tool}
                  className="gap-2"
                >
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {t('schedules:actions.create')}
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
                <TableHead className="w-[250px]">{t('common:labels.name')}</TableHead>
                <TableHead>{t('schedules:labels.trigger')}</TableHead>
                <TableHead>{t('schedules:labels.action')}</TableHead>
                <TableHead className="w-[100px]">{t('common:labels.status')}</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : schedules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <Calendar className="mx-auto mb-2 size-8 opacity-50" />
                    {t('schedules:empty')}
                  </TableCell>
                </TableRow>
              ) : (
                schedules.map((s) => (
                  <TableRow key={s.id} className={!s.enabled ? 'opacity-50' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {s.trigger?.type === 'cron' ? (
                          <Calendar className="size-4 text-muted-foreground" />
                        ) : (
                          <Clock className="size-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                        {fmt(s)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {s.action?.tool ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={() => toggle(s)}
                        disabled={isBusy}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove.mutate(s.id)}
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
