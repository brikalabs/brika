# @brika/plugin-sil-electricity

Plugin Brika qui récupère vos données de consommation électrique auprès des [Services Industriels de Lausanne](https://www.sil.ch/) (Lausanne, Suisse) et les expose sous forme de widgets Brick en temps réel et d'entrées de workflow.

## Configuration

1. Installez le plugin depuis l'interface du hub.
2. Ouvrez les paramètres du plugin et renseignez les identifiants de votre compte SIL. Le mot de passe est une préférence `password` : le hub le conserve donc dans le trousseau du système d'exploitation plutôt que dans une configuration en clair.
3. Le plugin interroge le portail des SIL à un intervalle configurable (par défaut : 6 heures) et met les relevés en cache localement.

## Ce qu'il expose

- Un **Brick** affichant la consommation du jour et du mois en cours avec un petit graphique
- Un **Spark** de workflow qui se déclenche à chaque nouveau relevé
- Un **Block** de workflow renvoyant le dernier cumul en kWh
- Des ports de type capteur typés `power.kwh` depuis [`@brika/type-system`](../../packages/type-system/)

## Portée

- Lecture seule : les SIL n'offrent aucune API de commande, uniquement des relevés de compteur.
- Les identifiants de compte ne quittent jamais le hub. Le plugin communique directement avec les SIL ; le cloud Brika n'intervient pas.
- Spécifique à Lausanne. Si votre distributeur propose un portail similaire, ce plugin constitue un bon point de départ pour un fork : l'essentiel du code est un client HTTP typé et une boucle d'interrogation, sans dépendance spécifique aux SIL.
