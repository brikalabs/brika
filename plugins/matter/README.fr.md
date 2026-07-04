# Matter

Intégration d'appareils domotiques pour BRIKA via le protocole [Matter](https://csa-iot.org/all-solutions/matter/). Découvrez, appairez et contrôlez les appareils Matter de votre réseau local : lumières, serrures, volets, thermostats, interrupteurs, capteurs, ventilateurs et aspirateurs robots.

## Architecture

```
src/
  index.tsx                 Plugin entry: lifecycle, spark wiring, brick data push
  engine/                   matter.js-facing core
    controller.ts           CommissioningController wrapper: lifecycle, node
                            subscriptions, notify channels, command dispatch
    device-model.ts         Endpoint tree -> flat device cache (classification,
                            state read, composed-device naming)
    press-tracker.ts        Raw switch events -> normalized gestures (short,
                            long, double, triple, multi)
  registry/                 Server-side device-family registry (zod allowed)
    types.ts                ClusterEntry/CommandSpec/DeviceFamily contracts,
                            MatterStateSchema, MATTER_COMMAND_VALUES (SSOT)
    index.ts                Composes ALL families: DEVICE_TYPE_MAP,
                            CLUSTER_ENTRIES, classification hints,
                            getClusterCommand (collisions throw at load)
    families/               One self-contained module per device family:
                            light, lock, cover, thermostat, switch, sensors,
                            fan, vacuum, bridge
  display/
    attributes.ts           Browser-safe, ZOD-FREE attribute registry: labels,
                            formatting, summaries (bricks and pages import it)
  blocks/                   Workflow blocks (+ config/node views)
  bricks/                   Client-rendered bricks (device, devices, commission)
    controls/               Per-family control panels + dispatcher (index.tsx)
  pages/                    Device management page
  tools.ts                  AI-discoverable tools (list/get/control device)
  actions.ts                Server actions for pages and client bricks
  routes.ts                 REST endpoints (zod-validated bodies)
  serialize.ts              MatterDevice -> JSON-safe shape
  sparks.ts                 Spark definitions
```

### Invariants

- **Notifications à portée d'endpoint.** Un rapport d'attribut nomme l'endpoint
  qui a changé ; seuls les abonnés de cet appareil ponté (plus ceux de la racine
  du node) sont notifiés. Diffuser à tous les appareils d'un node transformerait
  un seul rapport de pont Hue en une tempête de déclenchements de workflows.
- **Appareils composés.** Un variateur ou module mural Hue ne nomme que son
  endpoint parent ; les endpoints de boutons sont nommés « Parent button N »,
  portent `parentId` et `button`, et chaque appui/événement est réémis sur le
  parent nommé afin que les utilisateurs puissent cibler l'appareil qu'ils
  reconnaissent.
- **Module d'affichage sûr pour le navigateur.** `display/attributes.ts` doit
  rester exempt de zod et d'imports de SDK réservés au serveur : les vues des
  bricks et les pages l'importent en valeur, et la frontière d'import de
  `brika check` l'impose.
- **Normalisation des appuis.** Les utilisateurs pensent en gestes, pas en
  rafales d'événements Matter. `engine/press-tracker.ts` regroupe la
  chorégraphie initialPress/shortRelease/longPress/multiPressComplete en
  exactement un appui normalisé par geste ; les blocks et les bricks ne voient
  jamais que le vocabulaire normalisé.
- **Les clés d'état sont filtrées par le schéma.** Les lecteurs de cluster
  écrivent des tranches brutes qui passent par `MatterStateSchema` ; une clé
  absente du schéma est silencieusement écartée, et chaque clé du schéma doit
  avoir une entrée d'affichage. Le test du registre (`src/registry/index.test.ts`)
  impose ces deux directions.

## Ajouter une nouvelle famille d'appareils

Trois points de contact. Exemple concret : une famille hypothétique `airQuality`
qui lit le PM2.5 et le CO2 et peut définir un mode de qualité d'air cible.

### 1. `src/registry/families/air-quality.ts` (requis)

Créez le module de la famille : ids de device-type, lecteurs de cluster,
commandes. Ajoutez tout nouveau nom de commande à `MATTER_COMMAND_VALUES` et
toute nouvelle clé d'état à `MatterStateSchema` (les deux dans
`src/registry/types.ts`).

```ts
import type { DeviceFamily } from '../types';

export const airQuality: DeviceFamily = {
  id: 'airQuality',
  deviceTypeIds: {
    0x002c: 'sensor', // Air Quality Sensor (or a new DeviceType)
  },
  clusters: [
    {
      id: 'pm25ConcentrationMeasurement',
      read: (ep, state) => {
        const value = ep.maybeStateOf('pm25ConcentrationMeasurement')?.measuredValue;
        if (value !== null && value !== undefined) {
          state.pm25 = Number(value); // add `pm25` to MatterStateSchema!
        }
      },
      // Lower priority number = checked first; sensors use 80 (see
      // ClassificationHint in registry/types.ts for the bands in use).
      classify: { type: 'sensor', keys: ['pm25'], priority: 80 },
      commands: [
        {
          name: 'setAirQualityMode', // add to MATTER_COMMAND_VALUES first
          when: 'pm25',
          execute: (ep, args) =>
            ep.setStateOf('pm25ConcentrationMeasurement', { mode: Number(args.mode ?? 0) }),
        },
      ],
    },
  ],
};
```

Enregistrez-le ensuite dans `src/registry/index.ts` : importez le module et
ajoutez-le à `FAMILIES`. C'est la seule modification à y faire ; le registre
dérive `DEVICE_TYPE_MAP`, `CLUSTER_ENTRIES`, la classification et la recherche
de commandes, et lève une erreur au chargement du module si votre famille entre
en collision avec un id de device-type ou un nom de commande existant.

### 2. `src/display/attributes.ts` + locales (requis pour les nouvelles clés d'état)

Donnez à chaque nouvelle clé d'état son visage humain, et étiquetez-la dans les
DEUX locales :

```ts
// ATTRIBUTES entry (keep the module zod-free):
{
  key: 'pm25',
  kind: 'number',
  labelKey: 'device.attributes.pm25',
  format: (value) => `${String(value)} ug/m3`,
  category: 'sensor',
  watchable: true,
  summaryPriority: 15,
},
```

Ajoutez `device.attributes.pm25` à `locales/en/plugin.json` et
`locales/fr/plugin.json`. Si la famille introduit un nouveau `DeviceType`,
étendez ici aussi `DEVICE_TYPE_VALUES` et `SUMMARY_RULES` (plus les clés
`device.types.*`).

### 3. Panneau `src/bricks/controls/` (optionnel)

Les capteurs s'affichent automatiquement via `SensorControls`. N'ajoutez un
panneau dédié que lorsque la famille nécessite une interaction personnalisée :
créez `src/bricks/controls/air-quality.tsx` et ajoutez un `case` pour le type
d'appareil dans le dispatcher `DeviceControls` (`src/bricks/controls/index.tsx`).
Les vues des bricks sont rendues côté navigateur : importez uniquement depuis
`display/attributes.ts`, jamais depuis `registry/` ni `engine/`.

### Vérifier

`bun test plugins/matter/` exécute les garde-fous du registre (ids en double,
commandes en double, couverture des exécuteurs, couverture des attributs), puis
`bun node_modules/.bin/brika build && bun node_modules/.bin/brika check`
régénère le manifeste et impose les frontières d'import.

## Page de gestion des appareils

Interface complète de gestion des appareils, accessible depuis la page du plugin :

- **Analyse du réseau** pour découvrir les appareils appairables à proximité
- **Appairage** des appareils via un code de couplage à 11 chiffres ou une chaîne de code QR
- **Liste des appareils** organisée par type avec des indicateurs en ligne/hors ligne
- **Prise en charge des ponts** : détecte automatiquement les ponts et liste leurs appareils enfants
- **Fiche d'information** de l'appareil avec fabricant, produit, numéro de série, version logicielle et plus encore
- **Suppression** des appareils pour les désappairer de BRIKA

## Bricks

### Vue d'ensemble des appareils

Surveillance en un coup d'œil de tous vos appareils appairés.

- **Tailles :** 2×2 à 12×8
- **Affiche :** nombre d'appareils en ligne/total, grille d'appareils avec indicateurs d'état
- **Dispositions :** 1 à 3 colonnes selon la largeur du brick

### Contrôle d'appareil

Contrôle individuel d'appareil qui s'adapte au type d'appareil :

- **Lumières** : bascule, curseur de luminosité, teinte/saturation, température de couleur avec aperçu des couleurs
- **Serrures** : bascule verrouiller/déverrouiller avec retour visuel
- **Volets** : boutons ouvrir, arrêter, fermer avec pourcentage de position
- **Thermostats** : température actuelle et mode du système
- **Interrupteurs** : bascule d'alimentation (les télécommandes à pile affichent un panneau du dernier appui en direct à la place)
- **Aspirateurs** : démarrer, mettre en pause, reprendre, remettre à la base avec état opérationnel
- **Capteurs** : jusqu'à 2 valeurs de capteur affichées
- **Tailles :** 1×1 à 6×6
- **Config :** choisissez l'appareil à afficher dans une liste déroulante

### Ajouter un appareil Matter

Appairez un nouvel appareil depuis un tableau de bord à l'aide de son code de configuration.

## Sparks

### Device State Changed

Émis lorsqu'un appareil Matter change d'état.

| Champ        | Type    | Description                                     |
|--------------|---------|-------------------------------------------------|
| `nodeId`     | string  | Identifiant du node de l'appareil               |
| `name`       | string  | Nom de l'appareil                               |
| `deviceType` | string  | Type (light, lock, cover, thermostat, etc.)     |
| `online`     | boolean | Indique si l'appareil est joignable             |
| `state`      | object  | État complet de l'appareil (power, brightness, temp...) |

### Device Discovered

Émis lorsqu'un nouvel appareil Matter est trouvé sur le réseau.

| Champ        | Type   | Description                                  |
|--------------|--------|----------------------------------------------|
| `nodeId`     | string | Identifiant du node de l'appareil            |
| `name`       | string | Nom de l'appareil                            |
| `deviceType` | string | Type (light, lock, cover, thermostat, etc.)  |

Également émis : `device-online`, `device-offline` (transitions de connexion) et
`attribute-changed` (un spark par attribut modifié).

## Blocks

### Matter Command

Envoie des commandes aux appareils Matter depuis les workflows d'automatisation.

**Inputs :**
- `trigger` (generic) : active la commande

**Outputs :**
- `success` : émet `{ nodeId, command }` en cas de succès
- `error` : émet `{ message }` en cas d'échec

**Config :**
- `nodeId` (string) : appareil cible
- `command` (enum) : l'une des `MATTER_COMMAND_VALUES` (on, off, toggle, setBrightness, setColorTemp, setHueSaturation, lock, unlock, coverOpen, coverClose, coverStop, setCoverPosition, setTargetTemp, setFanMode, setFanSpeed, vacuumStart, vacuumPause, vacuumResume, vacuumDock)
- `params` (object, optionnel) : paramètres spécifiques à la commande (p. ex. niveau de luminosité, température cible)

### When Device Changes

Block déclencheur : se déclenche lorsque les attributs d'un appareil changent
(tout changement, devient une valeur, ou franchit un seuil) ou lorsqu'il émet un
événement Matter (appui sur un bouton).

### When Button Pressed

Block déclencheur : se déclenche une fois par geste de bouton normalisé (short,
long, double, triple, multi) sur un interrupteur ou une télécommande Matter.

## Tools

Outils à l'échelle du hub, découvrables par l'IA : `list-devices`,
`get-device-state` et `control-device` (nodeIds uniques ou groupés, arguments en
unités humaines validés par les contrats de commandes du registre).

## Preferences

| Préférence       | Type     | Défaut  | Description                                       |
|------------------|----------|---------|---------------------------------------------------|
| Auto-commission  | checkbox | off     | Appaire automatiquement les appareils découverts  |

## Appareils pris en charge

Lumières, lumières variables, lumières couleur, lumières à température de couleur, prises, prises murales, interrupteurs et télécommandes à pile, serrures de porte, volets de fenêtre, thermostats, ventilateurs, purificateurs d'air, aspirateurs robots, capteurs de température, capteurs d'humidité, capteurs de contact, capteurs de présence, capteurs de luminosité et ponts.

## Localisation

Entièrement traduit en anglais et en français.
