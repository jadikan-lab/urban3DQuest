CONTRIBUTING — Urban3DQuest
===========================

Objectif
--------
Fournir un workflow simple et reproductible pour continuer le développement en s'aidant d'un modèle LLM plus petit (ex: gpt-3.5-mini) ou pour les contributeurs humains.

Règles générales
----------------
- La base du projet est un unique fichier `index.html`. Eviter les modifications globales aléatoires : cible une section précise.
- Faire des commits petits et atomiques (1 fonctionnalité / bugfix par commit).
- Tests rapides : host localement (python3 -m http.server) et reproduire le scénario.

Workflow pour travailler avec un LLM « petit » (gpt-3.5-mini)
-----------------------------------------------------------
1. Résumer le contexte (max 6 lignes). Ex: "Webapp mobile single-file, QR photo-based dans index.html. Objectif: corriger le bug X."
2. Isoler le snippet de code ciblé (<=200 lignes). Copier/coller uniquement ce snippet dans la requête.
3. Décrire précisément la tâche (1-3 phrases) et les critères d'acceptation (tests locaux).
4. Demander la sortie sous forme de patch git (diff/patch apply format) ou instructions étapes-par-étapes pour éviter erreurs de parsing.

Exemple de template de prompt
----------------------------
Contexte: Urban3DQuest, `index.html` contient le scanner QR (photo-based) qui a un souci sur iOS.
Fichier: index.html (lignes 980-1060) — inclure uniquement ce snippet.
Tâche: Ajoute `_resetQRInput()` pour cloner l'input file et garantir `onchange` sur iOS. Appelle la fonction après échec de décodage.
Contraintes: Ne modifie que la section QR Scanner. Garde le style et ne touchera pas au reste.
Tests: 1) Sur iPhone Safari, ouvrir overlay, prendre photo invalide, réessayer → l'input doit ouvrir l'appareil photo à nouveau.
Format: Répond avec un patch git (git apply compatible).

Conseils pour humains
---------------------
- Vérifier les changements localement avant de pousser.
- Utiliser des PRs pour modifications significatives et demander review.
- Documenter toute modification de sécurité (Supabase/RLS) séparément.

Contact
-------
Le dépôt : https://github.com/zzzanzzzibar/urban3DQuest
