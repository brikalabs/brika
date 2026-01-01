import { singleton, inject } from "@elia/shared";
import type { EliaEvent, Json, Rule, Schedule, ToolCallContext } from "@elia/shared";
import { LogRouter } from "../logs/log-router";
import { StateStore } from "../state/state-store";
import { ToolRegistry } from "../tools/tool-registry";
import { EventBus } from "../events/event-bus";
import { SchedulerService } from "../scheduler/scheduler-service";
import { evaluateCondition } from "./condition-eval";

function matchGlob(pattern: string, text: string): boolean {
  return new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$").test(text);
}

@singleton()
export class RulesEngine {
  private readonly logs = inject(LogRouter);
  private readonly state = inject(StateStore);
  private readonly tools = inject(ToolRegistry);
  private readonly events = inject(EventBus);
  private readonly scheduler = inject(SchedulerService);
  #eventUnsub?: () => void;
  #scheduleUnsub?: () => void;

  async init(): Promise<void> {
    this.#eventUnsub = this.events.subscribeAll((e) => this.#onEvent(e));
    this.#scheduleUnsub = this.scheduler.onTrigger((s) => this.#onSchedule(s));
    this.logs.info("rules.engine.started");
  }

  async stop(): Promise<void> { this.#eventUnsub?.(); this.#scheduleUnsub?.(); this.logs.info("rules.engine.stopped"); }
  list(): Rule[] { return this.state.listRules(); }
  get(id: string): Rule | undefined { return this.state.getRule(id); }

  async create(rule: Omit<Rule, "id">): Promise<Rule> {
    const r: Rule = { ...rule, id: crypto.randomUUID() };
    await this.state.upsertRule(r);
    this.logs.info("rule.created", { id: r.id });
    return r;
  }

  async update(id: string, updates: Partial<Omit<Rule, "id">>): Promise<Rule | null> {
    const existing = this.state.getRule(id);
    if (!existing) return null;
    const r: Rule = { ...existing, ...updates };
    await this.state.upsertRule(r);
    return r;
  }

  async delete(id: string): Promise<boolean> { if (!this.state.getRule(id)) return false; await this.state.deleteRule(id); return true; }
  async enable(id: string): Promise<boolean> { const r = this.state.getRule(id); if (!r) return false; r.enabled = true; await this.state.upsertRule(r); return true; }
  async disable(id: string): Promise<boolean> { const r = this.state.getRule(id); if (!r) return false; r.enabled = false; await this.state.upsertRule(r); return true; }

  #onEvent(event: EliaEvent): void {
    for (const rule of this.state.listRules()) {
      if (!rule.enabled || rule.trigger.type !== "event" || !matchGlob(rule.trigger.match, event.type)) continue;
      if (rule.condition && !evaluateCondition(rule.condition, { event })) continue;
      this.logs.info("rule.triggered", { id: rule.id, eventType: event.type });
      this.#executeActions(rule, event);
    }
  }

  #onSchedule(schedule: Schedule): void {
    for (const rule of this.state.listRules()) {
      if (!rule.enabled || rule.trigger.type !== "schedule" || rule.trigger.scheduleId !== schedule.id) continue;
      this.logs.info("rule.triggered.schedule", { id: rule.id, scheduleId: schedule.id });
      this.#executeActions(rule, null);
    }
  }

  async #executeActions(rule: Rule, event: EliaEvent | null): Promise<void> {
    const ctx: ToolCallContext = { traceId: crypto.randomUUID(), source: "rule" };
    for (const action of rule.actions) {
      try {
        const args = this.#interpolateArgs(action.args, event);
        await this.tools.call(action.tool, args, ctx);
      } catch (e) { this.logs.error("rule.action.error", { ruleId: rule.id, error: String(e) }); }
    }
  }

  #interpolateArgs(args: Record<string, Json>, event: EliaEvent | null): Record<string, Json> {
    if (!event) return args;
    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string") {
        result[key] = value.replace(/\$\{event\.type\}/g, event.type).replace(/\$\{event\.source\}/g, event.source).replace(/\$\{event\.id\}/g, event.id);
      } else result[key] = value;
    }
    return result;
  }
}
