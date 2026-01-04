import type { BrikaEvent, Json, Rule, Schedule, ToolCallContext } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { EventSystem } from '@/runtime/events/event-system';
import { LogRouter } from '@/runtime/logs/log-router';
import { SchedulerService } from '@/runtime/scheduler/scheduler-service';
import { StateStore } from '@/runtime/state/state-store';
import { ToolRegistry } from '@/runtime/tools/tool-registry';
import { evaluateCondition } from './condition-eval';

function matchGlob(pattern: string, text: string): boolean {
  return new RegExp(`^${pattern.replaceAll(/\./g, '\\.').replaceAll('*', '.*')}$`).test(text);
}

@singleton()
export class RulesEngine {
  private readonly logs = inject(LogRouter);
  private readonly state = inject(StateStore);
  private readonly tools = inject(ToolRegistry);
  private readonly events = inject(EventSystem);
  private readonly scheduler = inject(SchedulerService);
  #eventUnsub?: () => void;
  #scheduleUnsub?: () => void;

  async init(): Promise<void> {
    this.#eventUnsub = this.events.subscribeAll((action) => {
      // Convert Action to BrikaEvent format
      const e: BrikaEvent = {
        id: action.id,
        type: action.type,
        source: action.source ?? 'unknown',
        payload: action.payload as Json,
        ts: action.timestamp,
      };
      this.#onEvent(e);
    });
    this.#scheduleUnsub = this.scheduler.onTrigger((s) => this.#onSchedule(s));
    this.logs.info('rules.engine.started');
  }

  async stop(): Promise<void> {
    this.#eventUnsub?.();
    this.#scheduleUnsub?.();
    this.logs.info('rules.engine.stopped');
  }

  list(): Rule[] {
    return this.state.listRules().sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): Rule | undefined {
    return this.state.getRule(id);
  }

  async create(rule: Omit<Rule, 'id'>): Promise<Rule> {
    const r: Rule = { ...rule, id: crypto.randomUUID() };
    await this.state.upsertRule(r);
    this.logs.info('rule.created', { id: r.id });
    return r;
  }

  async update(id: string, updates: Partial<Omit<Rule, 'id'>>): Promise<Rule | null> {
    const existing = this.state.getRule(id);
    if (!existing) return null;
    const r: Rule = { ...existing, ...updates };
    await this.state.upsertRule(r);
    return r;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.state.getRule(id)) return false;
    await this.state.deleteRule(id);
    return true;
  }

  async enable(id: string): Promise<boolean> {
    const r = this.state.getRule(id);
    if (!r) return false;
    r.enabled = true;
    await this.state.upsertRule(r);
    return true;
  }

  async disable(id: string): Promise<boolean> {
    const r = this.state.getRule(id);
    if (!r) return false;
    r.enabled = false;
    await this.state.upsertRule(r);
    return true;
  }

  #onEvent(event: BrikaEvent): void {
    for (const rule of this.state.listRules()) {
      if (
        !rule.enabled ||
        rule.trigger.type !== 'event' ||
        !matchGlob(rule.trigger.match, event.type)
      )
        continue;
      if (rule.condition && !evaluateCondition(rule.condition, { event })) continue;
      this.logs.info('rule.triggered', { id: rule.id, eventType: event.type });
      this.#executeActions(rule, event);
    }
  }

  #onSchedule(schedule: Schedule): void {
    for (const rule of this.state.listRules()) {
      if (
        !rule.enabled ||
        rule.trigger.type !== 'schedule' ||
        rule.trigger.scheduleId !== schedule.id
      )
        continue;
      this.logs.info('rule.triggered.schedule', { id: rule.id, scheduleId: schedule.id });
      this.#executeActions(rule, null);
    }
  }

  async #executeActions(rule: Rule, event: BrikaEvent | null): Promise<void> {
    const ctx: ToolCallContext = { traceId: crypto.randomUUID(), source: 'rule' };
    for (const action of rule.actions) {
      try {
        const args = this.#interpolateArgs(action.args, event);
        await this.tools.call(action.tool, args, ctx);
      } catch (e) {
        this.logs.error('rule.action.error', { ruleId: rule.id, error: String(e) });
      }
    }
  }

  #interpolateArgs(args: Record<string, Json>, event: BrikaEvent | null): Record<string, Json> {
    if (!event) return args;
    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        result[key] = value
          .replaceAll('${event.type}', event.type)
          .replaceAll('${event.source}', event.source)
          .replaceAll('${event.id}', event.id);
      } else result[key] = value;
    }
    return result;
  }
}
