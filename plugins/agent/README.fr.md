# Agent IA

Exécutez des LLM (Claude, n'importe quel endpoint compatible OpenAI ou un serveur
Ollama local) au sein des workflows Brika.

## Blocs

### Ask AI (`agent:llm`)

Un prompt en entrée, le texte de la complétion en sortie. Un appel LLM par
événement reçu. Utilisez-le pour résumer une lecture de capteur, classer un
événement, rédiger une notification ou réécrire du texte au fil d'un flux.

- **Entrées :** `prompt` (string)
- **Sorties :** `text` (string), `error` ({ message })
- **Config :** `model`, `systemPrompt`, `effort` (low | medium | high), `maxTokens`

### Call Tool (`agent:call-tool`)

Invoque un outil enregistré dans le hub par son id et émet son résultat.

### AI Agent (`agent:agent`)

Un LLM qui raisonne sur le prompt et appelle les outils enregistrés dans le hub
pour y répondre.

## Configuration

1. Le plugin demande des autorisations réseau, il s'installe donc en veille tant
   que vous ne l'activez pas :
   - `dev.brika.net.fetch` restreint aux hôtes des fournisseurs pris en charge
     (Anthropic, OpenAI, OpenRouter, Groq, Together, Mistral, Azure OpenAI)
   - `dev.brika.net.local.fetch` sur le port loopback d'Ollama (11434)
2. Ajoutez une clé de fournisseur dans les préférences du plugin (`Anthropic API Key`,
   `OpenAI API Key`, une URL de base compatible OpenAI et/ou une URL de serveur
   Ollama). Les préférences de type mot de passe sont stockées dans le trousseau
   du système d'exploitation.
3. Reliez un déclencheur ou la sortie de n'importe quel bloc à `prompt`, puis
   acheminez `text` vers la suite.

## Notes

- Les clés ne quittent jamais le hub : elles sont lues depuis les préférences du
  plugin et envoyées uniquement à l'endpoint du fournisseur configuré.
- La configuration du fournisseur réside dans les préférences globales du plugin,
  jamais dans les blocs individuels, si bien que chaque bloc IA partage un même
  jeu d'identifiants.
