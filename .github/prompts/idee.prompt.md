---
mode: agent
description: "Ajoute une idée en attente dans IDEAS_BACKLOG.md. Utiliser quand l'utilisateur tape /idee ou /idée suivi d'un texte."
---

Tu dois stocker l'idée dans le backlog du projet.

Règles:
- Si l'utilisateur a fourni un texte après la commande, utilise ce texte comme idée.
- Si aucun texte n'est fourni, demande une seule question courte pour obtenir l'idée.
- Ajoute l'idée en lançant la commande terminal:
  - npm run idee -- "/idee <texte de l'idée>"
- Confirme ensuite en une phrase que l'idée est enregistrée dans IDEAS_BACKLOG.md.
- N'implémente pas l'idée maintenant, c'est juste une capture pour plus tard.
