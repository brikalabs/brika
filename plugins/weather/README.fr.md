# Plugin Météo

Superbe plugin d'affichage météo pour Brika, avec les conditions actuelles, des prévisions sur plusieurs jours et des widgets de température compacts. Utilise l'[API Open-Meteo](https://open-meteo.com/) gratuite — aucune clé API requise.

## Bricks

### Current Weather

Conditions météo en direct avec des arrière-plans en dégradé dynamiques qui changent selon la météo.

- **Tailles :** 1×1 à 12×8
- **Affiche :** température, ressenti, humidité, vitesse/direction du vent, pression
- **Dispositions :** compacte (1-2 colonnes), moyenne (3-4 colonnes), grande (5 colonnes et plus) — le contenu s'adapte à l'espace disponible

### Weather Forecast

Prévisions météo sur plusieurs jours avec les températures maximales, minimales et les icônes de conditions.

- **Tailles :** 2×1 à 12×6
- **Affiche :** jusqu'à 7 jours de prévisions
- **Dispositions :** liste verticale (étroit) ou grille horizontale (large) — s'adapte aux dimensions du brick
- **Config :** nombre de jours de prévision (1-7)

### Temperature (Compact)

Affichage minimaliste de la température et des conditions pour les petits espaces.

- **Tailles :** 1×1 à 3×3
- **Affiche :** température actuelle, icône météo, libellé de condition

## Configuration

### Préférences du plugin

| Préférence | Type | Défaut | Description |
|---|---|---|---|
| City | text | _(détection automatique)_ | Nom de la ville pour les données météo |
| Temperature Unit | dropdown | Celsius | Celsius ou Fahrenheit |

Chaque brick peut aussi remplacer la ville et l'unité via sa propre config.

**Ordre de résolution de la ville :** config du brick → préférence du plugin → localisation de l'appareil → Zurich (repli)

## Source des données

Les données météo sont récupérées depuis [Open-Meteo](https://open-meteo.com/) et interrogées toutes les 10 minutes. L'interrogation est comptée par références — plusieurs bricks affichant la même ville partagent un unique minuteur d'interrogation.

Prend en charge 50 codes météo WMO associés à 9 types de conditions (ciel dégagé, partiellement nuageux, nuageux, brouillard, bruine, pluie, neige, averses, orage), chacun avec sa propre icône, son arrière-plan en dégradé et sa couleur d'accentuation.

## Localisation

Entièrement traduit en anglais et en français, couvrant les conditions météo, les libellés de statistiques, les noms des jours et toutes les chaînes de l'interface.

## Développement

```bash
# Type-check
bun run tsc

# Run tests
bun test
```
