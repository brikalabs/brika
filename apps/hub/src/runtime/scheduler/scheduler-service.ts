import type { Schedule } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { LogRouter } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';

export type ScheduleCallback = (schedule: Schedule) => void | Promise<void>;

interface RunningSchedule {
  schedule: Schedule;
  nextRun?: number;
}

function parseCron(expr: string): { nextRun: (now: Date) => Date } | null {
  const specials: Record<string, string> = {
    '@hourly': '0 * * * *',
    '@daily': '0 0 * * *',
    '@weekly': '0 0 * * 0',
    '@monthly': '0 0 1 * *',
  };
  const normalized = specials[expr.toLowerCase()] ?? expr;
  const parts = normalized.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const parseField = (field: string, min: number, max: number): number[] | null => {
    if (field === '*') return null;
    const vals: number[] = [];
    for (const part of field.split(',')) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        for (let i = a; i <= b; i++) vals.push(i);
      } else if (part.includes('/')) {
        const [r, s] = part.split('/');
        const step = Number(s);
        const start = r === '*' ? min : Number(r);
        for (let i = start; i <= max; i += step) vals.push(i);
      } else vals.push(Number(part));
    }
    return vals.length ? vals : null;
  };

  const [minutes, hours, days, months, weekdays] = [
    parseField(parts[0], 0, 59),
    parseField(parts[1], 0, 23),
    parseField(parts[2], 1, 31),
    parseField(parts[3], 1, 12),
    parseField(parts[4], 0, 6),
  ];

  return {
    nextRun: (now: Date) => {
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(next.getMinutes() + 1);
      for (let i = 0; i < 525600; i++) {
        if (
          (minutes === null || minutes.includes(next.getMinutes())) &&
          (hours === null || hours.includes(next.getHours())) &&
          (days === null || days.includes(next.getDate())) &&
          (months === null || months.includes(next.getMonth() + 1)) &&
          (weekdays === null || weekdays.includes(next.getDay()))
        )
          return next;
        next.setMinutes(next.getMinutes() + 1);
      }
      return new Date(now.getTime() + 3600000);
    },
  };
}

@singleton()
export class SchedulerService {
  private readonly logs = inject(LogRouter);
  private readonly state = inject(StateStore);
  readonly #running = new Map<string, RunningSchedule>();
  readonly #callbacks = new Set<ScheduleCallback>();
  #ticker?: Timer;

  onTrigger(cb: ScheduleCallback): () => void {
    this.#callbacks.add(cb);
    return () => this.#callbacks.delete(cb);
  }

  init(): void {
    for (const s of this.state.listSchedules()) if (s.enabled) this.#activate(s);
    this.#ticker = setInterval(() => this.#tick(), 1000);
  }

  stop(): void {
    if (this.#ticker) clearInterval(this.#ticker);
    this.#running.clear();
  }

  list(): Schedule[] {
    return this.state.listSchedules().sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): Schedule | undefined {
    return this.state.getSchedule(id);
  }

  async create(schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const s: Schedule = { ...schedule, id: crypto.randomUUID() };
    await this.state.upsertSchedule(s);
    if (s.enabled) this.#activate(s);
    this.logs.info('schedule.created', { id: s.id });
    return s;
  }

  async update(id: string, updates: Partial<Omit<Schedule, 'id'>>): Promise<Schedule | null> {
    const existing = this.state.getSchedule(id);
    if (!existing) return null;
    const s: Schedule = { ...existing, ...updates };
    await this.state.upsertSchedule(s);
    this.#deactivate(id);
    if (s.enabled) this.#activate(s);
    return s;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.state.getSchedule(id)) return false;
    this.#deactivate(id);
    await this.state.deleteSchedule(id);
    return true;
  }

  async enable(id: string): Promise<boolean> {
    const s = this.state.getSchedule(id);
    if (!s) return false;
    s.enabled = true;
    await this.state.upsertSchedule(s);
    this.#activate(s);
    return true;
  }

  async disable(id: string): Promise<boolean> {
    const s = this.state.getSchedule(id);
    if (!s) return false;
    s.enabled = false;
    await this.state.upsertSchedule(s);
    this.#deactivate(id);
    return true;
  }

  #activate(schedule: Schedule): void {
    if (this.#running.has(schedule.id)) return;
    const rs: RunningSchedule = { schedule };
    if (schedule.trigger.type === 'interval') rs.nextRun = Date.now() + schedule.trigger.ms;
    else if (schedule.trigger.type === 'cron') {
      const c = parseCron(schedule.trigger.expr);
      if (c) rs.nextRun = c.nextRun(new Date()).getTime();
    }
    this.#running.set(schedule.id, rs);
  }

  #deactivate(id: string): void {
    this.#running.delete(id);
  }

  #tick(): void {
    const now = Date.now();
    for (const rs of this.#running.values()) {
      if (rs.nextRun && now >= rs.nextRun) {
        this.#fire(rs);
        if (rs.schedule.trigger.type === 'interval') rs.nextRun = now + rs.schedule.trigger.ms;
        else if (rs.schedule.trigger.type === 'cron') {
          const c = parseCron(rs.schedule.trigger.expr);
          if (c) rs.nextRun = c.nextRun(new Date()).getTime();
        }
      }
    }
  }

  #fire(rs: RunningSchedule): void {
    this.logs.info('schedule.fired', { id: rs.schedule.id });
    for (const cb of this.#callbacks) {
      try {
        cb(rs.schedule);
      } catch {
        // Ignore callback errors
      }
    }
  }
}
