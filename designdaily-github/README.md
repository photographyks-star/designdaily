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

## Collecte automatique des articles (recommandé)

Un navigateur n'a pas le droit de lire directement les sites d'actualité : l'app passait par des relais publics gratuits, qui sont aujourd'hui presque tous fermés ou en panne. La collecte automatique les remplace : toutes les 30 minutes, GitHub va chercher les articles et les publie dans un fichier que l'app télécharge.

Mise en place (une seule fois, dépôt **public**) :

1. Uploader dans le dépôt : `sources.json` et le dossier `collecte/` (en plus des fichiers de l'app).
2. Créer le fichier de l'automatisation : **Add file → Create new file**, nom du fichier
   `.github/workflows/collecte.yml` (taper le nom complet, barres obliques comprises),
   y coller tout le contenu de `collecte/A-COPIER-workflow.txt`, puis **Commit changes**.
3. Onglet **Actions** du dépôt : la tâche « Collecte des articles » démarre toute seule et dure environ une minute. Une coche verte = réussi.
4. Dans l'app, onglet Explorer → « Collecte automatique » : saisir `pseudo/nom-du-depot`, puis **Enregistrer**.
   (Inutile si l'app est ouverte depuis l'adresse `pseudo.github.io/nom-du-depot` : le dépôt est reconnu tout seul.)

Ajouter ou retirer une source collectée : modifier `sources.json` dans GitHub (icône crayon). La collecte se relance aussitôt.
Les sources ajoutées seulement dans l'app continuent de passer par les relais publics.

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
| `sources.json` | Liste des sources lues par la collecte automatique |
| `collecte/collecte.mjs` | Programme de collecte (exécuté par GitHub) |
| `collecte/A-COPIER-workflow.txt` | Contenu à coller dans `.github/workflows/collecte.yml` |

## Mise à jour

Remplacer les fichiers du dépôt (Add file → Upload files → Commit), puis attendre une à deux minutes.
À l'ouverture suivante avec du réseau, l'app charge la nouvelle version. Sans réseau, elle ouvre la dernière version gardée sur l'appareil.
