---
title: CreatorComptability V2
publishDate: 2026-07-20 00:00:00
img: /assets/creator-comptability-thumbnail.jpg
img_alt: Aperçu du Cockpit Financier CreatorComptability V2
description: |
  Le système d'exploitation financier & Copilot IA d'élite conçu sur-mesure pour les créateurs de contenu, streamers, vidéastes et solopreneurs digitaux. Combinaison de Vue.js 3.5, FastAPI, Mistral AI (Pixtral 12B) et conformité Factur-X 2026.
tags:
  - SaaS
  - FullStack
  - Mistral AI
  - Python
  - Vue.js
  - FastAPI
---

## À propos du projet

**CreatorComptability V2** est un cockpit financier augmenté par l'intelligence artificielle au design Cyber-Luxe & Glassmorphism. Pensé pour libérer les créateurs de contenu, streamers et solopreneurs digitaux de la phobie administrative, l'application automatise l'ensemble du suivi de trésorerie, la simulation fiscale et l’analyse de rentabilité par contenu.

### Fonctionnalités principales

- 🛡️ **Météo Fiscale & Réserve URSSAF** : Simulation dynamique multi-régimes (Micro-BNC, Micro-BIC, IS), calcul du salaire net réel disponible et jauge de trésorerie de sécurité.
- 📊 **Calculateur de Marge Nette par Projet** : Suivi automatisé du Chiffre d'Affaires, des coûts de production (monteur, matériel, sponsors) et du taux de marge % par vidéo ou opération Twitch/YouTube.
- 🤖 **Studio OCR & Rapprochement Bancaire IA** : Extraction intelligente de factures & reçus via **Mistral AI (Pixtral 12B)** avec score de confiance et rapprochement bancaire autonome.
- 📜 **Factur-X 2026 & Exports Légaux DGFiP** : Génération de factures certifiées PDF+XML (Factur-X 2026) et exports réglementaires en 1 clic (FEC, Livre des Recettes, Registre des Achats).
- 🧠 **Mistral AI Executive Advisor** : Audit financier continu et conseils stratégiques en temps réel sur la santé financière et les seuils de franchise de TVA.

### Technologies utilisées

- **Frontend** : Vue.js 3.5 (Composition API), TypeScript, Vite 8.1, Pinia 3.0, WebKit Normalization.
- **Backend** : Python 3.12, FastAPI 0.110, Pydantic V2, Supabase (PostgreSQL & Auth).
- **IA & Document Processing** : Mistral AI API (Pixtral 12B), ReportLab & PyPDF2 (Moteur hybride Factur-X), Pandas & NumPy.
- **Qualité & Tests** : Suite complète Pytest (78/78 tests validés, 100% Passed).

## Aperçu du projet

- **Dashboard SaaS & Cockpit Financier** :  
  ![Aperçu de CreatorComptability V2](/assets/creator-comptability-thumbnail.jpg)

## Architecture & Conception

L'application repose sur une architecture découplée haute performance :
- Un client **Vue 3.5** et **Pinia** assurant une navigation fluide et réactive sans rechargement de page.
- Un backend **FastAPI 0.110** traitant les données analytiques vectorisées avec **Pandas** et gérant la validation stricte via **Pydantic V2**.
- Une intégration de **Mistral AI (Pixtral 12B)** pour le traitement multimodal et l'extraction intelligente de reçus.
- Un pipeline de génération hybride PDF/XML conforme à la norme **Factur-X 2026**.

## Suite de Tests & Fiabilité

Le projet intègre une couverture de tests unitaires et d'intégration automatisée avec Pytest (78 tests validés sur l'ensemble des modules : Auth, OCR, Dépenses, Revenus, Factures, Exports FEC, Monitoring).

## Découvrir le projet

- 🚀 [Tester l'application en direct (Vercel)](https://creator-comptability-v2-livid.vercel.app/)
- 💻 [Consulter le code source sur GitHub](https://github.com/Mathieu-Soussignan/Creator_comptability_v2)

---

## Auteur

- [Mathieu Soussignan](https://www.mathieu-soussignan.com) — Data Engineer & Développeur IA chez Keyrus
