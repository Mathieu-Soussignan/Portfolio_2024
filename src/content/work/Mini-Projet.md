---
title: Application Coûts Médicaux
publishDate: 2024-03-28 00:00:00
img: /assets/medical-costs-thumbnail.jpg
img_alt: Aperçu de l'application de gestion et prédiction des coûts médicaux
description: |
  Application complète en trois volets pour gérer, prédire et orchestrer les charges médicales. Composée de deux API en FastAPI et d’une interface Streamlit, le tout déployé avec Docker Compose.
tags:
  - FastAPI
  - Streamlit
  - Docker
  - Machine Learning
  - API REST
  - Projet IA
---

## À propos du projet

Ce projet complet, développé dans le cadre de ma formation en intelligence artificielle, combine data engineering, machine learning et déploiement d’applications pour répondre à une problématique métier concrète : la gestion et la prédiction des frais médicaux.

Il se structure autour de trois services :

### 🔹 Projet 1 – API de gestion des données médicales

- API REST développée avec FastAPI.
- Gestion des entités : `Sex`, `Smoker`, `Region`, `Patient`, `AppUser`.
- Base de données relationnelle avec SQLite + SQLAlchemy.
- Génération de données de test via Faker.
- Intégration continue avec Pytest + GitHub Actions.

### 🔹 Projet 2 – API de prédiction

- Entraînement de modèles ML (régression linéaire, Random Forest...).
- Évaluation : RMSE, MAE, R².
- Suivi d’expériences avec MLflow.
- Export du pipeline (préprocesseur + modèle) pour la mise en production.
- API FastAPI avec endpoint `/predict`.

### 🔹 Projet 3 – Interface utilisateur et orchestration

- Application en **Streamlit**.
- Orchestration des appels vers les APIs des projets 1 et 2.
- Formulaire interactif pour prédiction en ligne.
- Import/export CSV pour prédiction en masse.
- Visualisation des résultats avec **Altair**.
- Journalisation avec **Loguru**.

---

## Fonctionnalités principales

- 🔍 **Prédictions en temps réel ou par fichier CSV**
- 📊 **Visualisation des charges médicales prévues**
- 🧠 **Benchmarking et comparaison de modèles IA**
- 🚪 **Pipeline ML complet déployé et exploitable**
- 🛠️ **API documentées et testées**
- 🚀 **Déploiement unifié avec Docker Compose**

---

## Technologies utilisées

- **FastAPI** · **Streamlit** · **SQLite** · **SQLAlchemy**
- **Scikit-learn** · **MLflow** · **Altair**
- **Docker / Docker Compose**
- **Loguru** · **Pytest**

---

## Aperçu de l’architecture

```
[Streamlit UI]
     |
     |------> [API Gestion - Projet 1 : port 8001]
     |
     |------> [API Prédiction - Projet 2 : port 8002]
```

---

## Lancer le projet

```bash
git clone https://github.com/Mathieu-Soussignan/mini-projet-1
cd mini-projet-1
docker-compose up --build
```

- 🌐 [http://localhost:8501](http://localhost:8501) : Interface Streamlit
- 📡 [http://localhost:8001](http://localhost:8001) : API de gestion
- 🧠 [http://localhost:8002](http://localhost:8002) : API de prédiction

---

## Leçons tirées

- Mise en œuvre concrète du **cycle de vie d’un projet IA**
- Communication entre **microservices** avec Streamlit + FastAPI
- Manipulation avancée de Docker pour la production locale
- Mise en place d’un environnement modulaire et maintenable

---

## Voir le projet

- [Dépôt GitHub](https://github.com/Mathieu-Soussignan/mini-projet-1)

---