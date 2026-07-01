# 🎬 Streamix — Hackathon ESTIAM × 42c 2026

> **Équipe Only B** — Sujet B (tous les 3 pôles)

Streamix est une plateforme B2B de vidéo synchronisée avec protection anti-scraping et analytics d'audience en temps réel.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        STREAMIX                             │
│                                                             │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │   Pôle 1        │  │   Pôle 2     │  │   Pôle 3      │ │
│  │  Watch Together │  │  Anti-Scrape │  │  Analytics    │ │
│  │  React + WS     │  │  FastAPI     │  │  Streamlit    │ │
│  │  :3000 / :4000  │  │  :8000       │  │  :8501        │ │
│  └─────────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Les 3 Pôles

| Pôle | Sujet | Stack | Port |
|------|-------|-------|------|
| [Pôle 1 — Watch Together](./watch-together/README.md) | Salle de visionnage synchronisé | React, TypeScript, WebSocket, Node.js | 3000 / 4000 |
| [Pôle 2 — Anti-Scraping Shield](./pole2-security/README.md) | Détection de fraude & scraping | FastAPI, Python | 8000 |
| [Pôle 3 — Audience Analytics](./pole3-data/README.md) | Dashboard analytique temps réel | Streamlit, scikit-learn, Plotly | 8501 |

---

## Lancement rapide

### Pré-requis
- Node.js ≥ 18
- Python 3.12
- npm

### 1. Pôle 1 — Watch Together

```bash
# Serveur WebSocket + API
cd watch-together/server
npm install
node index.js

# Front React (dans un second terminal)
cd watch-together
npm install
npm start
```

### 2. Pôle 2 — Anti-Scraping

```bash
cd pole2-security
pip3 install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

### 3. Pôle 3 — Analytics Dashboard

```bash
cd pole3-data
pip3 install -r requirements.txt
streamlit run dashboard.py --server.port 8501
```

---

## Flux de données

```
Présentateur → upload vidéo/URL
      ↓
WebSocket Room (:4000)
      ↓
Spectateurs synchronisés (:3000)
      ↓
Events enregistrés (play/pause/seek)
      ↓
Auto-save JSON → /server/logs/
      ↓
Dashboard Streamlit (:8501) ← pipeline scikit-learn
```

---

## Fonctionnalités clés

- **Synchronisation temps réel** : countdown 3s avant chaque play
- **Upload local ou URL YouTube**
- **1 seul présentateur par salle** (règle enforced côté serveur)
- **Rétention calculée** par seconde de vidéo
- **Prédiction de zones d'ennui** via IsolationForest
- **Alertes sécurité** intégrées depuis le Pôle 2

---

## Équipe

**Only B** — Hackathon ESTIAM × 42c — Juillet 2026

| Prénom | Nom | Niveau | Filière |
|--------|-----|--------|---------|
| Benjamin Léo | CHASSIER | ESTIAM 3 | E3 DAD Paris |
| Charlène | MELIN | ESTIAM 4 | E4 BDAI Paris |
| Dorian Patrick Jean | LENOIR | ESTIAM 4 | E4 WMD Paris |
| Fergal | NDAMVU NGOMA SUNDA | ESTIAM 3 | E3 CCSN Paris |
| Finaritra Nirina Fitia | RAVELONARIVO | ESTIAM 4 | E4 BDAI Paris |
| Lucas Benoît | MASSAKO | ESTIAM 3 | E3 DAD Paris |
| Maxime Jules-Elliott | FELTRIN | ESTIAM 5 | E5 CCSN Paris |
| Ousmane Mamadou | DJIRE | ESTIAM 5 | E5 BDAI Paris |
| Quentin | GAUTIER | ESTIAM 5 | E5 WMD Paris |
| Sidy | DIALLO | ESTIAM 5 | E5 BDAI Paris |
| Svel David | KOUA | ESTIAM 4 | E4 WMD Paris |
| Thibault Bruno | DRUELLE | ESTIAM 4 | E4 BDAI Paris |
| Thomas | DOMMANGET | ESTIAM 5 | E5 SAP ERP Cloud & Data Paris |
| Yanis | MEKKAOUI | ESTIAM 5 | E5 CCSN Paris |
| Yao Ibrahim | LASSIDAN | ESTIAM 4 | E4 CCSN Paris |

> Chef de groupe : **Thomas DOMMANGET**
