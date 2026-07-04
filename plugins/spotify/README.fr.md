# Spotify Connect

Contrôleur de lecture Spotify pour les tableaux de bord BRIKA. Affiche les informations de lecture en cours, la pochette de l'album et offre des commandes de transport complètes via la Spotify Web API.

## Configuration

1. Créez une application sur [developer.spotify.com](https://developer.spotify.com)
2. Ajoutez `http://127.0.0.1:3001/api/oauth/spotify/callback` comme **Redirect URI** dans les paramètres de votre application Spotify
3. Dans BRIKA, ouvrez les préférences du plugin et collez votre **Client ID**
4. Cliquez sur le lien **Connect** pour autoriser l'accès

> Utilise PKCE — aucun client secret n'est nécessaire.

## Brick : Spotify Player

Lecteur adaptatif qui s'ajuste à la taille de la grille :

| Taille     | Disposition                                                     |
|------------|----------------------------------------------------------------|
| 1-2 cols   | Pochette d'album avec superposition lecture/pause              |
| 3-4 cols   | Pochette d'album en fond avec panneau de commandes flottant    |
| 5+ cols    | Disposition partagée — pochette à gauche, commandes complètes à droite |

La hauteur débloque des fonctionnalités supplémentaires :

- **h >= 3** (disposition moyenne) : curseur de progression
- **h >= 4** : curseur de volume
- **h >= 5** (grande disposition) : badge du nom de l'appareil

### Config

| Nom               | Type   | Défaut  | Description                            |
|-------------------|--------|---------|----------------------------------------|
| `refreshInterval` | number | 3000    | Intervalle de sondage en ms (1000–30000) |

La progression est interpolée localement entre les sondages pour des mises à jour d'interface fluides.

## Spark : Track Changed

Émis chaque fois que la piste en cours de lecture change.

**Charge utile :**

| Champ        | Type           | Description                          |
|--------------|----------------|--------------------------------------|
| `trackName`  | string         | Titre de la piste                    |
| `artistName` | string         | Nom(s) de l'artiste, séparés par des virgules |
| `albumName`  | string         | Titre de l'album                     |
| `albumArt`   | string \| null | URL de la pochette d'album (640px)   |
| `timestamp`  | number         | Horodatage Unix (ms)                 |

## Scopes

- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`
