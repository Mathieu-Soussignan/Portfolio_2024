---
title: Prédict Car
publishDate: 2025-04-02 00:00:00
img: /assets/predict-car-thumbnail.jpg
img_alt: Aperçu de l'application Prédict Car
description: |
  Application de prédiction des prix des voitures d'occasion combinant React, FastAPI et modèles de machine learning. Une UX soignée avec authentification, visualisations interactives et classification des offres.
tags:
  - IA
  - React
  - FastAPI
  - Machine Learning
  - Data Visualisation
  - Authentification
---

## À propos du projet

**Prédict Car** est une application conçue pour estimer le prix d'une voiture d'occasion et déterminer si l'offre est une « Bonne affaire » ou non. Pensée dans le cadre d'une formation en développement IA, cette solution mêle performance, accessibilité, et modernité, en intégrant :

- un backend FastAPI,  
- un frontend React moderne avec Material UI,  
- deux modèles de machine learning (Random Forest et régression logistique).

Elle s'adresse aussi bien aux utilisateurs occasionnels qu’aux passionnés du marché de l’automobile.

### Fonctionnalités principales

- 🔍 **Recherche intelligente** : prédiction du prix selon des critères précis (kilométrage, année, marque, modèle, etc.).
- ✅ **Évaluation d’offres** : classification automatique en « Bonne affaire » ou « Mauvaise affaire ».
- 📊 **Visualisations dynamiques** : affichage interactif des tendances via Plotly.
- 👤 **Gestion utilisateurs** : inscription, connexion, déconnexion avec sécurisation JWT.
- ⏳ **Expérience fluide** : animation au logout, barre de progression pour les prédictions.

### Technologies utilisées

- **Frontend** : React, Vite.js, Material UI, Plotly  
- **Backend** : FastAPI, SQLite, SQLAlchemy  
- **Machine Learning** : Random Forest amélioré, Régression Logistique  
- **Autres** : JWT, scripts Python, notebooks d’analyse, tests unitaires, dockerisation possible

## Aperçu du projet

- **Formulaire de prédiction** :  
  ![](/assets/predict-car-form.jpg)

- **Résultat interactif** :  
  ![](/assets/predict-car-result.jpg)

- **Authentification et gestion utilisateur** :  
  ![](/assets/predict-car-auth.jpg)

## Démarche et conception

Le projet a suivi une approche collaborative rigoureuse. Après avoir nettoyé et exploré les données (notebooks), les modèles ont été testés, comparés (voir tableau ci-dessous), et le meilleur a été intégré à l’API. L’interface React a été pensée pour offrir une UX claire et fluide, même sur mobile.

| Modèle                  | RMSE    | R²   | Commentaire                         |
|------------------------|---------|------|-------------------------------------|
| Random Forest          | 2440.84 | 0.88 | Correct, mais moins précis          |
| **Random Forest amélioré** | **2258.58** | **0.89** | ✅ Modèle retenu, meilleur équilibre |
| XGBoost                | 2384.68 | 0.88 | Plus lent, peu de gain              |
| CatBoost               | 2674.20 | 0.93 | Trop lourd pour ce projet           |

## Architecture du projet

- `api/` : endpoints FastAPI pour prédiction, auth, gestion voitures  
- `models/` : entraînement et sauvegarde `.pkl`  
- `notebooks/` : explorations Jupyter  
- `voiture-prediction/` : interface React  
- `scripts/`, `sql/`, `tests/`, `database/` : outils et base

## Accès rapide

1. Cloner le repo
```bash
git clone https://github.com/Mathieu-Soussignan/voitures-occasion.git
cd voitures-occasion
```

2. Lancer l’API FastAPI
```bash
    pip install -r requirements.txt
    python create_db.py
    uvicorn main:app --reload --port 8000
```

3. Lancer le frontend
```bash
    cd voiture-prediction
    npm install
    npm run dev
```
## Crédits
Projet mené en trio dans le cadre d’une formation IA chez Simplon :
- Mathieu Soussignan
- Sébastien Rapuzzi
- Yasmine Aissani

## Auteur
- [Mathieu Soussignan](https://www.mathieu-soussignan.com).
