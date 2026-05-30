# Idees En Attente

Ajoute une idee avec:
- npm run idee -- "/idee ton texte"

## Inbox
- [ ] 2026-05-27 18:12 - Mode 4: remplacer le seuil 'capturé' (<5m) par des zones de proximité, car le GPS bouge trop; forcer la recherche visuelle finale au lieu d'une capture automatique. (partiellement fait: Quête passe en 3 états stables + anti-jitter + blocage scan si GPS faible)
	- [ ] Revalider sur mobile réel (rue étroite + place dégagée) la stabilité des transitions loin/proche/scan.
	- [ ] Ajuster les seuils d'entrée/sortie par ville (petite densité vs centre urbain dense).
	- [x] Ajouter un réglage admin pour le seuil GPS max autorisant le scan (valeur actuelle: ±35m). (fait)
	- [ ] Ajouter une télémétrie légère des refus de scan (GPS instable / hors zone) pour calibrage.
	- [ ] Ajouter une validation serveur (RPC) de cohérence GPS au moment de la validation QR.
- [x] 2026-05-27 18:13 - Boussole: conserver uniquement la rose qui tourne, sans lettres de direction (N/E/S/O) pour éviter des indications trompeuses. (fait)
- [ ] 2026-05-27 18:24 - Flux Flash QR sans friction (découpé en sous-tâches)
	- [x] Afficher un message explicite quand un autre QR est reconnu (détail détecté vs attendu).
	- [x] Garantir l'ouverture du pop-up de récompense après scan Flash valide.
	- [x] Rendre les textes du bloc partage Flash configurables dans ui-copy.
	- [x] Ajouter une action "Reprendre la photo" claire après échec, sans fermer l'overlay.
	- [ ] Revalider le flux complet sur mobile réel (Flash trouvé -> photo -> récompense -> partage).
- [ ] 2026-05-29 09:57 - Il faudrait améliorer le design de l'image de partage. Quand on veut scanner un flash, il y a deux images: il faudrait n'en garder qu'une seule, celle qui montre qu'on scanne le QR code.
