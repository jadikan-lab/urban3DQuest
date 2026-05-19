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

Convention équipe — Cache-buster + QA release
---------------------------------------------

Pourquoi
--------
- Eviter de tester un build ancien servi par cache.
- Garantir que toute validation QA est faite sur la version réellement déployée.

Format cache-buster (cb)
------------------------
- Toujours utiliser un cb neuf à chaque session QA.
- Format obligatoire: <type>-<YYYYMMDD>-<HHmm>-<initiales>
- Types recommandés: qa, hotfix, release
- Exemples:
  - qa-20260519-1415-gn
  - release-20260519-1930-team

Règles cb
---------
- Ne jamais réutiliser un ancien cb.
- Ne pas tester avec des alias historiques (ex: qa-final-1).
- Chaque personne QA utilise son propre suffixe (<initiales>).

Protocole QA en 5 étapes (obligatoire)
--------------------------------------
1. Ouvrir l'app avec un cb neuf:
	- PROD: index.html?env=prod&cb=<cb-neuf>
	- STG:  index.html?env=stg&cb=<cb-neuf>
2. Vérifier la version affichée dans l'UI avant tout test.
3. Exécuter les parcours critiques:
	- Connexion
	- Capture (scan/QR)
	- Scores + partage
4. Vérifier la console navigateur:
	- Aucun nouveau crash JS
	- Noter les erreurs réseau récurrentes (si connues) sans les ignorer
5. Journaliser le run QA dans le ticket/PR:
	- URL exacte (avec cb)
	- Version affichée
	- Résultat des 3 parcours
	- Anomalies restantes

Checklist release rapide
------------------------
- cb neuf utilisé
- version UI confirmée
- 3 parcours OK
- anomalies notées
- go/no-go explicite

Suivi de version (obligatoire)
------------------------------

Objectif
--------
- Savoir exactement ce qui est en prod.
- Permettre un QA fiable avec une version visible dans l'UI.

Règles
------
- La version affichée est définie dans `js/config.js` (`GAME_VERSION`).
- Format: `vMAJOR.MINOR.PATCH` (SemVer).
- `PATCH`: bugfix/comportement sans rupture.
- `MINOR`: nouvelle fonctionnalité compatible.
- `MAJOR`: changement cassant ou migration lourde.

Process release conseillé
------------------------
1. Bump `GAME_VERSION` dans `js/config.js`.
2. Ajouter une entrée dans `CHANGELOG.md`.
3. Commit de release dédié (version + changelog).
4. Push main.
5. Créer un tag git `vX.Y.Z` correspondant.
6. QA avec un `cb` neuf et vérification de la version UI.

Contact
-------
Le dépôt : https://github.com/jadikan-lab/urban3DQuest
