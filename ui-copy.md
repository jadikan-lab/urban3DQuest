# Urban 3D Quest — Textes joueurs (source de vérité)

> **Comment utiliser ce fichier**
> Modifie les valeurs ci-dessous, puis dis "applique ui-copy.md".
> Les clés (ex: `LOGIN_SOUS_TITRE`) ne doivent pas être renommées — c'est ce qui permet de retrouver chaque texte dans le code.
> `{N}` = variable dynamique (nombre), `{PSEUDO}` = pseudo du joueur — ne pas supprimer.

---

## LOGIN

```
LOGIN_LOGO:         Jadikan · Urban 3D Quest
LOGIN_TITRE:        Urban 3D Quest
LOGIN_SOUS_TITRE:   J'ai caché des miniatures dans la ville.
                    C'est à toi de les trouver.
LOGIN_PLACEHOLDER:  Ton pseudo
LOGIN_CTA:          Je cherche
LOGIN_INVITÉ:       Juste regarder d'abord
```

---

## HEADER & NAVIGATION

```
HEADER_TITRE:       🏙 Urban 3D Quest
HEADER_GPS_INIT:    GPS…
HEADER_AIDE:        Aide
HEADER_BRAND:       Un jeu de Jadikan
NAV_QUETE:          Quête
NAV_FLASH:          Flash
NAV_COMPTE:         Compte
NAV_SCORES:         Scores
```

---

## CARTOUCHE MODE (en-tête de carte)

> Petite barre affichée au-dessus de la minimap selon le mode actif.
> Pour Flash, `{N}` = nombre de trésors encore disponibles.

```
GUIDE_QUETE_TITRE:       Mode Quête
GUIDE_QUETE_SOUS:        Balise fixe: approche-toi, trouve l'objet et scanne.

GUIDE_FLASH_TITRE:       Mode Flash
GUIDE_FLASH_SOUS_SOLO:   1 trésor disponible · sois le premier !
GUIDE_FLASH_SOUS_MULTI:  {N} trésors disponibles · sois le premier !
```

---

## TUTORIEL / ONBOARDING

```
TUTO_ACCROCHE:      Deux façons de jouer.

TUTO_QUETE_NOM:     Mode Quête
TUTO_QUETE_SOUS:    Des balises à trouver
TUTO_QUETE_DESC:    Balises fixes dans la ville.
                    Approche-toi, scanne, collectionne.
                    Objectif : toutes les trouver.

TUTO_FLASH_NOM:     Mode Flash
TUTO_FLASH_SOUS:    Trouves les petits Polaroids qui apparaissent dans la ville
TUTO_FLASH_DESC:    Des Polaroids apparaissent aléatoirement en ville.
                    Chacun ne peut être cueilli qu'une seule fois.
                    

TUTO_ASTUCE:        Active GPS + compas avant de démarrer pour une meilleure fluidité.
```

---

## BARRE DE PROXIMITÉ — Mode Quête

> Textes qui apparaissent dans la barre en bas de la carte selon la distance à la balise la plus proche.

```
QUETE_RADAR_TRES_LOIN:    Un polaroid se cache dans ce quartier…
QUETE_RADAR_LOIN:         Tu chauffes — il est tout près.
QUETE_RADAR_PROCHE:       Cherche bien, il est là.
QUETE_RADAR_COMPLETE:     ✅ Ta quete est complete !
```

---

## BARRE DE PROXIMITÉ — Mode Flash

> `{N}` = nombre de trésors Flash disponibles.

```
FLASH_RADAR_TRES_LOIN:    {N} trésor(s) dispo · Un polaroid se cache dans ce quartier…
FLASH_RADAR_LOIN:         {N} trésor(s) dispo · Tu chauffes !
FLASH_RADAR_PROCHE:       {N} trésor(s) dispo · Cherche bien, il n'est pas loin !
FLASH_RADAR_TRES_PROCHE:  {N} trésor(s) dispo · 📷 Scanne-le maintenant !
```

---

## MODAL DE RÉSULTAT — Quête (1ère révélation)

```
QUETE_FIRST_LABEL:  PREMIÈRE RÉVÉLATION
QUETE_FIRST_TITRE:  La chasse commence !
QUETE_FIRST_DESC:   Le chrono est lancé. Trouve les {N} autres polaroids le plus vite possible.
```

---

## MODAL DE RÉSULTAT — Quête (milieu de partie, rotation)

> Ces messages s'affichent en rotation selon le nombre déjà trouvés.

```
MID_1_LABEL:   RÉVÉLÉ
MID_1_TITRE:   Polaroid révélé.
MID_1_DESC:    Continue, il t'en reste {N}.

MID_2_LABEL:   EN ROUTE
MID_2_TITRE:   Belle trouvaille.
MID_2_DESC:    {N} polaroids t'attendent encore.

MID_3_LABEL:   TROUVÉ
MID_3_TITRE:   Tu as l'œil.
MID_3_DESC:    Plus que {N} dans ce quartier.

MID_4_LABEL:   MARQUÉ
MID_4_TITRE:   Dans la boîte.
MID_4_DESC:    {N} restants. Ne ralentis pas.

MID_5_LABEL:   EN CHASSE
MID_5_TITRE:   La quête avance.
MID_5_DESC:    {N} polaroids à révéler.
```

---

## MODAL DE RÉSULTAT — Quête (fin de partie)

```
QUETE_3_LABEL:   BON RYTHME
QUETE_3_TITRE:   Encore trois à trouver.
QUETE_3_DESC:    La fin approche. Reste concentré.

QUETE_2_LABEL:   EN FEU
QUETE_2_TITRE:   Il n'en reste plus que deux.
QUETE_2_DESC:    Tu y es presque. Ne lâche rien.

QUETE_1_LABEL:   PRESQUE !
QUETE_1_TITRE:   Plus qu'un !
QUETE_1_DESC:    Un seul polaroid te sépare de la fin. Tout se joue maintenant.

QUETE_0_LABEL:   POLAROID RÉVÉLÉ
QUETE_0_TITRE:   Polaroid révélé !
QUETE_0_DESC:    Incroyable ! Ta quete est complete !
```

---

## MODAL DE RÉSULTAT — Flash

```
FLASH_WIN_LABEL:   Félicitation !
FLASH_WIN_TITRE:   Tu es le premier à l'avoir trouvé
FLASH_WIN_DESC:    (vide)

FLASH_PRIS_LABEL:  TROP TARD
FLASH_PRIS_TITRE:  Trop tard !
FLASH_PRIS_DESC:   Trop tard. Ce flash trésor a déjà été pris.
```

---

## MODAL DE RÉSULTAT — Erreurs

```
DEJA_LABEL:   DÉJÀ FLASHÉ
DEJA_TITRE:   Tu as déjà flashé ce polaroid.
```

---

## ÉCRAN COMPLÉTION — Mode Quête

> S'affiche quand tous les polaroids fixes sont trouvés.

```
COMPLETE_TITRE:   Série complète.
COMPLETE_STATS_POLAROIDS:  Polaroids
COMPLETE_STATS_TEMPS:      Temps
COMPLETE_STATS_RANG:       Rang
COMPLETE_SHARE:   📤 Partager
COMPLETE_CTA:     Continuer
```

---

## ONGLET COMPTE

```
COMPTE_COLLECTION_TITRE:  Ma collection
COMPTE_COLLECTION_SOUS:   📷 Polaroids trouvés
COMPTE_VIDE:              Aucun polaroid trouvés pour l'instant
```

---

## MESSAGES DE RETOUR (toast bienvenue)

```
RETOUR_MESSAGE:   Bon retour {PSEUDO} ! Il te reste {N} polaroid(s) à trouver.
```

---

## ERREURS / SYSTÈME

```
ERR_TROP_LOIN:       Tu es à {N}m — trop loin pour révéler. Approche-toi à moins de {R}m.
ERR_TOUS_TROUVES:    Tu as révélé tous les polaroids ! 🏆
ERR_INVITÉ:          Mode invité : connecte-toi pour révéler des polaroids.
ERR_INTROUVABLE:     Polaroid introuvable — il a peut-être été retiré.
ERR_PAS_ACTIF:       Ce polaroid n'est pas encore actif.
ERR_RESEAU:          Révélation impossible pour le moment. Réessaie dans quelques secondes.
```
