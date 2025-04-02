---
title: StoryMaker – Générateur d'Histoires IA
publishDate: 2024-04-12 00:00:00
img: /assets/storymaker-thumbnail.jpg
img_alt: Capture de l'application StoryMaker en Streamlit
description: |
  Application IA de génération d’histoires personnalisées en français. Interface en Streamlit, backend en FastAPI et génération via le modèle LLaMA avec Ollama.
tags:
  - IA
  - FastAPI
  - Ollama
  - NLP
---

## À propos du projet

**StoryMaker** est une application web conçue pour permettre la génération d'histoires captivantes en français grâce à l'intelligence artificielle. Le projet vise à rendre la création de récits accessible et personnalisable, aussi bien pour les amateurs que pour les auteurs à la recherche d’inspiration.

Développée dans le cadre d’un projet IA avec mon binôme **Yamine Aissani**, cette application met l'accent sur l'interaction homme-machine à travers une interface intuitive et un backend robuste communiquant avec le modèle **LLaMA** via **Ollama**.

### Fonctionnalités principales

- 🎭 **Choix du genre** : Aventure, Fantastique, Comédie, Horreur, Science-fiction.
- 📝 **Longueur personnalisable** : de 100 à 400 mots.
- 📚 **Prompts prédéfinis** pour inspirer l’utilisateur.
- 📊 **Statistiques** : mots, caractères, mots-clés fréquents.
- 💾 **Historique** : sauvegarde et accès aux anciennes histoires.
- 📥 **Téléchargement** des histoires en `.pdf` ou `.txt`.
- ⚙️ **Backend FastAPI** connecté à **Ollama** pour la génération textuelle.
- 📈 **Visualisation de données** avec `matplotlib`.
- 📃 **Génération de PDF** stylisés via `fpdf`.

### Technologies utilisées

- **Frontend** : Streamlit
- **Backend** : FastAPI
- **Modèle IA** : LLaMA via Ollama (serveur local)
- **Librairies Python** : Matplotlib, FPDF, Pillow
- **Déploiement local** : Ngrok, possibilité d’hébergement cloud

### Architecture technique

```plaintext
Streamlit (interface utilisateur)
        ↓
    FastAPI (API REST)
        ↓
   Ollama (serveur IA avec LLaMA)
```

### Leçons tirées

- Mise en place d’une communication stable entre Frontend (Streamlit) et Backend (FastAPI).
- Exploitation d’un modèle IA local avec Ollama.
- Gestion des formats d’export (.pdf, .txt) et statistiques NLP simples.

### Voir le projet

- [Code source GitHub](https://github.com/Mathieu-Soussignan/Text_generator)