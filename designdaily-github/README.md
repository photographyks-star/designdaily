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
| `manifest.json` | Config PWA (nom, icône, couleurs) |
| `sw.js` | Service Worker (cache offline) |
| `icon-48.png` | Favicon |
| `icon-192.png` | Icône app Android |
| `icon-512.png` | Icône splash screen |

## Mise à jour

Modifier `index.html` directement dans GitHub (icône crayon) → Commit → l'app se met à jour automatiquement en quelques secondes.
