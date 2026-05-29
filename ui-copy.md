# Urban 3D Quest — Textes joueurs (source de vérité)

> **Comment utiliser ce fichier**
> Modifie les valeurs ci-dessous, puis dis "applique ui-copy.md".
> Les clés de ce fichier sont lues par `js/ui-copy.js`.
> Les clés (ex: `LOGIN_SOUS_TITRE`) ne doivent pas être renommées — c'est ce qui permet de retrouver chaque texte dans le code.
> `{N}` = variable dynamique (nombre), `{PSEUDO}` = pseudo du joueur — ne pas supprimer.

---

## LOGIN

```
LOGIN_LOGO:         Jadikan · Urban 3D Quest
LOGIN_TITRE:        Urban 3D Quest
LOGIN_SOUS_TITRE:   Des miniatures sont cachées dans la ville.
                    À toi de toutes les retrouver.
LOGIN_PLACEHOLDER:  Ton pseudo
LOGIN_CTA:          Je participe
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
> Pour Flash, `{N}` = nombre de miniatures encore disponibles.

```
GUIDE_QUETE_TITRE:       Mode Quête
GUIDE_QUETE_SOUS:        Approche-toi pour révéler les balises fixes

GUIDE_FLASH_TITRE:       Mode Flash
GUIDE_FLASH_SOUS_ZERO:   Aucune miniature disponible pour le moment
GUIDE_FLASH_SOUS_SOLO:   Plus qu'une miniature à trouver
GUIDE_FLASH_SOUS_MULTI:  {N} miniatures à cueillir · sois le premier !
```

---

## TUTORIEL / ONBOARDING

```
TUTO_ACCROCHE:      Deux façons de jouer.

TUTO_QUETE_NOM:     Mode Quête
TUTO_QUETE_SOUS:    Des balises à trouver
TUTO_QUETE_DESC:    Balises fixes dans la ville.
                    Approche-toi pour scanner les QR code
                    Objectif : toutes les trouver.

TUTO_FLASH_NOM:     Mode Flash
TUTO_FLASH_SOUS:    Trouve les miniatures Flash qui apparaissent en ville
TUTO_FLASH_DESC:    Trouves les petits Polaroids qui apparaissent sur la carte
                    Objectif: les cueillir avant les autres
                    

TUTO_ASTUCE:        Active GPS + compas avant de démarrer pour une meilleure fluidité.
TUTO_CLICK_HINT:    Astuce : la flèche en Quête et le rond en Flash sont cliquables.
SHEET_BACK_BTN:     Retour au jeu
FLASH_SHEET_HINT:   Clique le rond pour voir l'info, puis reviens ici.
```

---

## BARRE DE PROXIMITÉ — Mode Quête

> Textes qui apparaissent dans la barre en bas de la carte selon la distance à la balise la plus proche.

```
QUETE_RADAR_TRES_LOIN:    Une balise se cache dans ce quartier…
QUETE_RADAR_LOIN:         Tu chauffes — il est tout près.
QUETE_RADAR_PROCHE:       Cherche bien, il est là.
QUETE_RADAR_ZONE_RECHERCHE: Zone de recherche: ouvre l'œil autour de toi.
QUETE_RADAR_FINALE:       Tu es tout près. Repère l'objet réel et son QR.
QUETE_RADAR_SCAN:         Tu es dans la bonne zone: prends le QR en photo.
QUETE_RADAR_GPS_INSTABLE: ⚠️ GPS instable (±{A}m), avance en zone dégagée.
QUETE_RADAR_INDICE:       Voilà ce que tu cherches — tu es dans la zone !
QUETE_RADAR_COMPLETE:     ✅ Ta quête est complète !
```

---

## BARRE DE PROXIMITÉ — Mode Flash

> `{N}` = nombre de miniatures Flash disponibles.

```
FLASH_COUNT_ONE:          ⚡ 1 miniature dispo
FLASH_COUNT_MULTI:        ⚡ {N} miniatures dispos
FLASH_RADAR_DISTRICT:     Un polaroid se cache dans ce quartier
FLASH_RADAR_ZONE_DIST:    À ~{D}m de la zone
FLASH_RADAR_NEAR:         Tu es tout près
FLASH_RADAR_CAPTURE:      📷 Prends le QR en photo pour valider
FLASH_RADAR_ZERO:         ✅ Toutes les miniatures ont été cueillies, reviens plus tard !
```

---

## MODAL DE RÉSULTAT — Quête (1ère révélation)

```
QUETE_FIRST_LABEL:  PREMIÈRE RÉVÉLATION
QUETE_FIRST_TITRE:  La chasse commence !
QUETE_FIRST_DESC:   Le chrono est lancé. Révèle les {N} autres balises le plus vite possible.
```

---

## MODAL DE RÉSULTAT — Quête (milieu de partie, rotation)

> Ces messages s'affichent en rotation selon le nombre déjà trouvés.

```
MID_1_LABEL:   RÉVÉLÉ
MID_1_TITRE:   Balise révélé.
MID_1_DESC:    Continue, il t'en reste {N}.

MID_2_LABEL:   EN ROUTE
MID_2_TITRE:   Belle trouvaille.
MID_2_DESC:    {N} balises t'attendent encore.

MID_3_LABEL:   TROUVÉ
MID_3_TITRE:   Tu as l'œil.
MID_3_DESC:    Plus que {N} en attente.

MID_4_LABEL:   MARQUÉ
MID_4_TITRE:   Dans la boîte.
MID_4_DESC:    {N} restants. Ne ralentis pas.

MID_5_LABEL:   EN CHASSE
MID_5_TITRE:   La quête avance.
MID_5_DESC:    {N} balises à révéler.
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
QUETE_1_DESC:    Une seule Balise te sépare de la fin. Tout se joue maintenant.

QUETE_0_LABEL:   BALISE TROUVÉE
QUETE_0_TITRE:   Balise révélée !
QUETE_0_DESC:    Incroyable ! Ta quête est complète !
```

---

## MODAL DE RÉSULTAT — Flash

```
FLASH_WIN_LABEL:   CAPTURÉ
FLASH_WIN_TITRE:   Miniature Flash capturée
FLASH_WIN_DESC:    Miniature validée. Partage ta capture et continue la chasse.
FLASH_PRIS_LABEL:  TROP TARD
FLASH_PRIS_TITRE:  Trop tard !
FLASH_PRIS_DESC:   Cette miniature Flash a déjà été capturée.
FLASH_SHARE_KICKER:      FLASH CAPTURÉ · {PSEUDO}
FLASH_SHARE_TITLE:
FLASH_SHARE_TEXT:
FLASH_SHARE_CAPTURE_CTA: Partager
FLASH_SHARE_INVITE_CTA:  Inviter
```

---

## SCANNER QR (mode photo)

```
QR_STATUS_SCAN:   Vise le QR pour le révéler.
QR_STATUS_FIXED:   Tu as trouvé la balise, prends une photo du QR code pour continuer le jeu.
QR_STATUS_FLASH:   Tu as trouvé la miniature, prends une photo du QR code pour valider ta cueillette.
QR_STATUS_ANALYZING: 🔍 Révélation en cours…
QR_STATUS_BAD_PHOTO: ❌ Polaroid non reconnu — réessaie en te rapprochant et en éclairant bien le polaroid
QR_STATUS_NOT_GAME: ⚠️ Ce code n'appartient pas au jeu — cherche le bon polaroid !
QR_STATUS_WRONG_TREASURE: ⚠️ Mauvais polaroid — cherche le bon !
QR_STATUS_WRONG_TREASURE_DETAIL: ⚠️ Mauvais QR: détecté {SCANNED}. Cherche {EXPECTED}.
QR_STATUS_CAPTURED: ✅ Polaroid révélé !
QR_STATUS_CAMERA_BLOCKED: ⚠️ Caméra bloquée. Autorise la caméra puis utilise la photo de secours.
QR_TARGET_FIXED:   Balise {N} de la quête
QR_TARGET_FLASH:   Miniature Flash
QR_TARGET_FLASH_REF: QR-00X
QR_PHOTO_CTA:      📷 Prendre la photo
QR_RETRY_PHOTO_CTA: ↻ Reprendre la photo
QR_TIPS:           Astuce : rapproche-toi du QR code, évite les reflets et assure-toi qu'il occupe bien l'image.

FLASH_TAKEN_TOAST_ONE:   ⚡ {PSEUDO} vient de capturer une miniature !
FLASH_TAKEN_TOAST_MULTI:  ⚡ {N} miniatures viennent d'être capturées !
```

---

## MODAL DE RÉSULTAT — Erreurs

```
DEJA_LABEL:   DÉJÀ FLASHÉ
DEJA_TITRE:   Tu as déjà flashé ce polaroid.
```

---

## ÉCRAN COMPLÉTION — Mode Quête

> S'affiche quand toutes les balises fixes sont trouvées.

```
COMPLETE_TITRE:   Série complète.
COMPLETE_STATS_POLAROIDS:  Polaroids
COMPLETE_STATS_TEMPS:      Temps
COMPLETE_STATS_RANG:       Rang
COMPLETE_SHARE:   📤 Partager
COMPLETE_CTA:     Continuer
```

---

## BARRE DE PROGRESSION — Mode Quête uniquement

> S'affiche en bas de l'écran uniquement dans l'onglet Quête (pas en Compte ni Scores).

```
PROGRES_LABEL:    📷 Balises trouvées
```

---

## ONGLET COMPTE

```
COMPTE_COLLECTION_TITRE:  Ma collection
COMPTE_COLLECTION_SOUS:   📷 Polaroids trouvés
COMPTE_VIDE:              Aucune miniature trouvée pour l'instant
```

---

## MESSAGES DE RETOUR (toast bienvenue)

```
RETOUR_MESSAGE:   Bon retour {PSEUDO} ! Il te reste {N} balise{S} à trouver.
```

---

## ERREURS / SYSTÈME

```
ERR_TROP_LOIN:       Tu es à {N}m — trop loin pour révéler. Approche-toi à moins de {R}m.
ERR_TOUS_TROUVES:    Tu as révélé toutes les balises ! 🏆
ERR_INVITÉ:          Mode invité : connecte-toi pour révéler des balises.
ERR_INTROUVABLE:     Polaroid introuvable — il a peut-être été retiré.
ERR_PAS_ACTIF:       Cette balise ou miniature n'est pas encore active.
ERR_RESEAU:          Révélation impossible pour le moment. Réessaie dans quelques secondes.
```
