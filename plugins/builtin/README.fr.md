# @brika/plugin-builtin

Blocs réactifs de base pour les automatisations de workflows BRIKA. Ce plugin fournit les briques essentielles pour créer des workflows visuels.

## Vue d'ensemble

Le plugin de blocs intégrés est chargé automatiquement par le hub BRIKA et fournit les blocs fondamentaux de contrôle de flux et de manipulation de données, en s'appuyant sur l'architecture de flux réactifs.

## Blocs disponibles

### Déclencheurs

#### Clock
Émet des tics périodiques à intervalle régulier.

- **Entrées** : aucune (bloc source)
- **Sorties** : `tick` — `{ count: number, ts: number }`
- **Configuration** :
  - `interval` (durée) — Intervalle entre les tics

```yaml
- id: clock
  type: "@brika/plugin-builtin:clock"
  config:
    interval: 5000  # 5 seconds
```

### Contrôle de flux

#### Condition
Bifurque selon une condition booléenne.

- **Entrées** : `in` (générique)
- **Sorties** : `then`, `else` (passthrough)
- **Configuration** :
  - `field` — Chemin du champ à vérifier (p. ex. `"value"`, `"data.status"`)
  - `operator` — `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists`
  - `value` — Valeur de comparaison

```yaml
- id: check
  type: "@brika/plugin-builtin:condition"
  config:
    field: "temperature"
    operator: "gt"
    value: 25
```

#### Switch
Bifurcation multiple selon une valeur.

- **Entrées** : `in` (générique)
- **Sorties** : `case1`, `case2`, `case3`, `default` (passthrough)
- **Configuration** :
  - `field` — Chemin du champ à vérifier
  - `case1`, `case2`, `case3` — Valeurs à comparer

```yaml
- id: switch
  type: "@brika/plugin-builtin:switch"
  config:
    field: "status"
    case1: "active"
    case2: "pending"
    case3: "error"
```

#### Delay
Attend une durée donnée avant de continuer.

- **Entrées** : `in` (générique)
- **Sorties** : `out` (passthrough)
- **Configuration** :
  - `duration` (durée) — Durée d'attente

```yaml
- id: wait
  type: "@brika/plugin-builtin:delay"
  config:
    duration: 5000  # 5 seconds
```

#### Merge
Attend plusieurs entrées avant de continuer.

- **Entrées** : `a`, `b` (générique)
- **Sorties** : `out` — `{ a: any, b: any }`
- **Configuration** : aucune

```yaml
- id: merge
  type: "@brika/plugin-builtin:merge"
  config: {}
```

#### Split
Envoie les données vers plusieurs branches.

- **Entrées** : `in` (générique)
- **Sorties** : `a`, `b` (passthrough)
- **Configuration** : aucune

```yaml
- id: split
  type: "@brika/plugin-builtin:split"
  config: {}
```

#### End
Termine une branche du workflow.

- **Entrées** : `in` (générique)
- **Sorties** : aucune
- **Configuration** :
  - `status` — `"success"` ou `"failure"`

```yaml
- id: end
  type: "@brika/plugin-builtin:end"
  config:
    status: success
```

### Actions

#### HTTP Request
Effectue des requêtes HTTP vers des API externes.

- **Entrées** : `trigger` (générique)
- **Sorties** : `response`, `error`
- **Configuration** :
  - `url` — URL de la requête
  - `method` — `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
  - `headers` — Objet des en-têtes de la requête
  - `body` — Corps de la requête (pour POST/PUT/PATCH)

```yaml
- id: api-call
  type: "@brika/plugin-builtin:http-request"
  config:
    url: "https://api.example.com/data"
    method: GET
    headers:
      Authorization: "Bearer token"
```

#### Log
Journalise un message avec interpolation de variables.

- **Entrées** : `in` (générique)
- **Sorties** : `out` (passthrough)
- **Configuration** :
  - `message` — Modèle de message avec des expressions `{{inputs.in.field}}`
  - `level` — `debug`, `info`, `warn`, `error`

```yaml
- id: log
  type: "@brika/plugin-builtin:log"
  config:
    message: "Received: {{inputs.in.value}}"
    level: info
```

### Manipulation de données

#### Transform
Transforme ou extrait des données.

- **Entrées** : `in` (générique)
- **Sorties** : `out` (any)
- **Configuration** :
  - `field` — Champ à extraire (vide pour un passthrough)
  - `template` — Modèle pour construire l'objet de sortie

```yaml
# Extract a field
- id: extract
  type: "@brika/plugin-builtin:transform"
  config:
    field: "data.temperature"

# Build new object
- id: reshape
  type: "@brika/plugin-builtin:transform"
  config:
    template:
      temp: "data.temperature"
      hum: "data.humidity"
```

## Exemples d'utilisation

### Clock + Log simple

```yaml
id: clock-demo
name: Clock Demo
enabled: true

blocks:
  - id: clock
    type: "@brika/plugin-builtin:clock"
    config:
      interval: 5000
    position: { x: 100, y: 100 }

  - id: log
    type: "@brika/plugin-builtin:log"
    config:
      message: "Tick #{{inputs.in.count}}"
      level: info
    position: { x: 300, y: 100 }

connections:
  - from: clock
    fromPort: tick
    to: log
    toPort: in
```

### Flux conditionnel

```yaml
id: condition-demo
name: Condition Demo
enabled: true

blocks:
  - id: clock
    type: "@brika/plugin-builtin:clock"
    config:
      interval: 10000

  - id: condition
    type: "@brika/plugin-builtin:condition"
    config:
      field: "count"
      operator: "gt"
      value: 5

  - id: high
    type: "@brika/plugin-builtin:log"
    config:
      message: "Count is high: {{inputs.in.count}}"
      level: warn

  - id: low
    type: "@brika/plugin-builtin:log"
    config:
      message: "Count is low: {{inputs.in.count}}"
      level: debug

connections:
  - from: clock
    fromPort: tick
    to: condition
    toPort: in
  - from: condition
    fromPort: then
    to: high
    toPort: in
  - from: condition
    fromPort: else
    to: low
    toPort: in
```

### Branches parallèles

```yaml
id: parallel-demo
name: Parallel Demo
enabled: true

blocks:
  - id: clock
    type: "@brika/plugin-builtin:clock"
    config:
      interval: 5000

  - id: split
    type: "@brika/plugin-builtin:split"
    config: {}

  - id: fast
    type: "@brika/plugin-builtin:log"
    config:
      message: "Fast path"

  - id: slow
    type: "@brika/plugin-builtin:delay"
    config:
      duration: 2000

  - id: slow-log
    type: "@brika/plugin-builtin:log"
    config:
      message: "Slow path (after 2s)"

  - id: merge
    type: "@brika/plugin-builtin:merge"
    config: {}

  - id: done
    type: "@brika/plugin-builtin:log"
    config:
      message: "Both paths completed"

connections:
  - from: clock
    fromPort: tick
    to: split
    toPort: in
  - from: split
    fromPort: a
    to: fast
    toPort: in
  - from: split
    fromPort: b
    to: slow
    toPort: in
  - from: slow
    fromPort: out
    to: slow-log
    toPort: in
  - from: fast
    fromPort: out
    to: merge
    toPort: a
  - from: slow-log
    fromPort: out
    to: merge
    toPort: b
  - from: merge
    fromPort: out
    to: done
    toPort: in
```

## Syntaxe des expressions

Les blocs Log prennent en charge les expressions `{{...}}` pour l'interpolation de variables :

- `{{inputs.in}}` — Données d'entrée brutes
- `{{inputs.in.field}}` — Accès aux champs imbriqués
- `{{config.value}}` — Accès aux valeurs de configuration
- `{{JSON.stringify(inputs.in)}}` — Sérialisation en JSON

## Installation

Ce plugin est inclus par défaut avec BRIKA et n'a pas besoin d'être installé séparément.
