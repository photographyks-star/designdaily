# DesignDaily — PWA

Appli de veille design automobile & IA, installable comme application native.

## Déploiement GitHub Pages

1. Uploader tous ces fichiers dans un dépôt GitHub public
2. Settings → Pages → Branch: main / (root) → Save
3. Attendre 2 min → accéder à `https://TON-PSEUDO.github.io/NOM-DU-REPO`

## Installation sur téléphone

**Android (Chrome)**
- Ouvrir l'URL → attendre la bannière "Installer DesignDaily"
- Ou : menu ⋮ → "Ajouter à l'écran d'accueil"

**iPhone (Safari)**
- Ouvrir l'URL → bouton Partage → "Sur l'écran d'accueil"

## Fichiers

| Fichier | Rôle |
|---------|------|
| `index.html` | Application complète |
| `manifest.json` | Config PWA (nom, icônes, couleurs, captures) |
| `sw.js` | Service Worker (ouverture sans connexion, mise à jour) |
| `icon-48.png` | Favicon |
| `icon-192.png` | Icône app Android |
| `icon-512.png` | Icône splash screen |
| `screenshot-*.png` | Captures d'écran déclarées dans le manifeste |

## Mise à jour

Remplacer les fichiers du dépôt (Add file → Upload files → Commit), puis attendre une à deux minutes.
À l'ouverture suivante avec du réseau, l'app charge la nouvelle version. Sans réseau, elle ouvre la dernière version gardée sur l'appareil.
