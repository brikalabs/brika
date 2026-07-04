# @brika/plugin-timer

Blocs de minuterie et de compte à rebours pour les workflows BRIKA. Créez des déclencheurs différés, des comptes à rebours avec progression et une logique d'automatisation basée sur le temps.

## Blocs disponibles

### Timer

Une minuterie à usage unique qui se déclenche après une durée configurée.

**Entrées :**
- `trigger` (generic) — Démarre la minuterie à la réception de données

**Sorties :**
- `completed` — Émis à la fin de la minuterie avec `{ name, duration, triggeredAt, completedAt }`

**Configuration :**
- `name` (string, optionnel) — Nom de la minuterie
- `duration` (duration) — Durée d'attente

**Utilisation :**

```yaml
blocks:
  - id: start-timer
    type: "@brika/plugin-timer:timer"
    config:
      name: "Break Reminder"
      duration: 1800000  # 30 minutes in ms

  - id: notify
    type: "@brika/plugin-builtin:log"
    config:
      message: "Timer completed!"

connections:
  - from: start-timer
    fromPort: completed
    to: notify
    toPort: in
```

### Countdown

Un compte à rebours qui émet des ticks de progression ainsi que des événements de fin et d'annulation.

**Entrées :**
- `start` (generic) — Démarre le compte à rebours
- `cancel` (generic) — Annule le compte à rebours

**Sorties :**
- `tick` — Progression périodique : `{ remaining, total, progress }`
- `completed` — À la fin du compte à rebours : `{ total }`
- `cancelled` — En cas d'annulation : `{ remaining }`

**Configuration :**
- `duration` (duration) — Durée totale du compte à rebours
- `tickInterval` (duration, valeur par défaut : 1000) — Intervalle entre les ticks

**Utilisation :**

```yaml
blocks:
  - id: countdown
    type: "@brika/plugin-timer:countdown"
    config:
      duration: 60000      # 1 minute
      tickInterval: 1000   # Update every second

  - id: progress-log
    type: "@brika/plugin-builtin:log"
    config:
      message: "{{ Math.round(inputs.in.progress * 100) }}% complete"

connections:
  - from: countdown
    fromPort: tick
    to: progress-log
    toPort: in
```

## Exemples

### Action différée simple

```yaml
id: delayed-action
name: Delayed Action
enabled: true

blocks:
  - id: clock
    type: "@brika/plugin-builtin:clock"
    config:
      interval: 60000  # Check every minute

  - id: timer
    type: "@brika/plugin-timer:timer"
    config:
      name: "action-delay"
      duration: 5000  # 5 second delay

  - id: action
    type: "@brika/plugin-builtin:log"
    config:
      message: "Delayed action executed!"

connections:
  - from: clock
    fromPort: tick
    to: timer
    toPort: trigger
  - from: timer
    fromPort: completed
    to: action
    toPort: in
```

### Compte à rebours avec progression

```yaml
id: countdown-demo
name: Countdown Demo
enabled: true

blocks:
  - id: start
    type: "@brika/plugin-builtin:clock"
    config:
      interval: 30000

  - id: countdown
    type: "@brika/plugin-timer:countdown"
    config:
      duration: 10000
      tickInterval: 1000

  - id: progress
    type: "@brika/plugin-builtin:log"
    config:
      message: "Countdown: {{ inputs.in.remaining }}ms remaining"
      level: debug

  - id: done
    type: "@brika/plugin-builtin:log"
    config:
      message: "Countdown complete!"
      level: info

connections:
  - from: start
    fromPort: tick
    to: countdown
    toPort: start
  - from: countdown
    fromPort: tick
    to: progress
    toPort: in
  - from: countdown
    fromPort: completed
    to: done
    toPort: in
```

## Implémentation

```typescript
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

export const timer = defineReactiveBlock(
  {
    id: "timer",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      completed: output(
        z.object({
          name: z.string(),
          duration: z.number(),
          triggeredAt: z.number(),
          completedAt: z.number(),
        }),
        { name: "Completed" }
      ),
    },
    config: z.object({
      name: z.string().optional().describe("Timer name"),
      duration: z.duration(undefined, "Duration to wait"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      if (activeTimer) clearTimeout(activeTimer);

      const triggeredAt = Date.now();
      const name = config.name ?? "timer";

      log.info(`Timer "${name}" started for ${config.duration}ms`);

      activeTimer = setTimeout(() => {
        outputs.completed.emit({
          name,
          duration: config.duration,
          triggeredAt,
          completedAt: Date.now(),
        });
        activeTimer = null;
      }, config.duration);
    });

    return () => {
      if (activeTimer) clearTimeout(activeTimer);
    };
  }
);

onStop(() => log.info("Timer plugin stopping"));
log.info("Timer plugin loaded");
```

## Installation

Ajoutez ceci à votre `brika.yml` :

```yaml
plugins:
  "@brika/plugin-timer":
    version: "latest"
```
