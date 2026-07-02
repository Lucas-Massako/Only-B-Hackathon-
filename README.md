# 🎬 Streamix — Hackathon ESTIAM × 42c 2026

> **Équipe Only B** — Sujet B (tous les 3 pôles)

Streamix est une plateforme B2B de vidéo synchronisée avec protection anti-scraping et analytics d'audience en temps réel.

Le projet est organisé autour de 3 pôles complémentaires :

* **Pôle 1 : Watch Together** — expérience de visionnage synchronisé
* **Pôle 2 : Anti-Scraping Shield** — détection des menaces et comportements frauduleux
* **Pôle 3 : Audience Analytics** — analyse des comportements utilisateurs et visualisation des données

---

# Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        STREAMIX                             │
│                                                             │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │   Pôle 1        │  │   Pôle 2     │  │   Pôle 3      │   │
│  │ Watch Together  │  │ Anti-Scrape  │  │ Analytics     │   │
│  │ React + WS      │  │ FastAPI      │  │ Streamlit     │   │
│  │ :3000 / :4000   │  │ :8000        │  │ :8501         │   │
│  └─────────────────┘  └──────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

# Les 3 Pôles

| Pôle                                                        | Sujet                           | Stack                                 | Port        |
| ----------------------------------------------------------- | ------------------------------- | ------------------------------------- | ----------- |
| [Pôle 1 — Watch Together](./watch-together/README.md)       | Salle de visionnage synchronisé | React, TypeScript, WebSocket, Node.js | 3000 / 4000 |
| [Pôle 2 — Anti-Scraping Shield](./pole2-security/README.md) | Détection de fraude & scraping  | FastAPI, Python                       | 8000        |
| [Pôle 3 — Audience Analytics](./pole3-data/README.md)       | Dashboard analytique temps réel | Streamlit, scikit-learn, Plotly       | 8501        |

---

# Lancement rapide

## Pré-requis

* Node.js ≥ 18
* Python 3.12
* npm

---

## 1. Pôle 1 — Watch Together

```bash
cd watch-together/server
npm install
node index.js
```

Dans un second terminal :

```bash
cd watch-together
npm install
npm start
```

---

## 2. Pôle 2 — Anti-Scraping Shield

```bash
cd pole2-security

pip3 install -r requirements.txt

uvicorn main:app --port 8000 --reload
```

Le service est accessible :

```
http://localhost:8000
```

Documentation automatique :

```
http://localhost:8000/docs
```

---

## 3. Pôle 3 — Analytics Dashboard

```bash
cd pole3-data

pip3 install -r requirements.txt

streamlit run dashboard.py --server.port 8501
```

---

# Flux de données

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
      ↓
Alertes sécurité depuis Pôle 2
```

---

# Fonctionnalités clés

* Synchronisation temps réel des utilisateurs
* Countdown de 3 secondes avant lecture
* Upload local ou URL YouTube
* Un seul présentateur par salle
* Rétention calculée par seconde de vidéo
* Prédiction de zones d'ennui via IsolationForest
* Détection de comportements suspects via le Pôle 2
* Génération d'événements de sécurité

---

# Détails des pôles

# 🎬 Pôle 1 — Watch Together

> Salle de visionnage vidéo **synchronisé en temps réel** avec contrôle présentateur.

---

## Concept

Un présentateur partage une vidéo (URL YouTube ou fichier local) avec des spectateurs dans une room. Chaque action (play, pause, seek) est répercutée sur tous les clients avec un countdown de 3 secondes pour une synchronisation parfaite.

---

## Stack technique

| Composant | Techno |
|-----------|--------|
| Front-end | React 18, TypeScript |
| WebSocket | ws (Node.js) |
| API HTTP | Express.js |
| Lecteur vidéo | YouTube IFrame API + HLS.js |
| Upload | multer (2 Go max) |
| Logs | JSON auto-sauvegardés toutes les 1s |

---

## Structure

```
watch-together/
├── src/
│   ├── App.tsx              # Logique principale, WS, enregistrement events
│   ├── components/
│   │   └── VideoPlayer.tsx  # Lecteur unifié YouTube + HTML5
│   └── index.tsx
└── server/
    ├── index.js             # WS server + Express API
    ├── uploads/             # Vidéos uploadées (gitignored)
    └── logs/                # Sessions JSON (gitignored)
```

---

## Lancement

```bash
# Terminal 1 — Serveur WebSocket + API
cd server
npm install
node index.js
# → http://localhost:4000

# Terminal 2 — Front React
cd ..
npm install
npm start
# → http://localhost:3000
```

---

## API HTTP (port 4000)

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/upload` | Upload d’un fichier vidéo |
| `POST` | `/logs` | Sauvegarde session de visionnage |
| `GET` | `/logs` | Liste toutes les sessions |
| `GET` | `/logs/:filename` | Détail d’une session |
| `DELETE` | `/logs/:filename` | Supprime une session |
| `GET` | `/health` | Santé du serveur |

---

## Schéma de données (v1.0)

```json
{
  "schemaVersion": "1.0",
  "sessionId": "uuid",
  "roomId": "room-abc",
  "videoName": "Titre de la vidéo",
  "videoDuration": 600.0,
  "recordedAt": "2026-07-01T...",
  "viewers": [
    {
      "viewerId": "uuid",
      "role": "presenter",
      "joinedAt": 1234567890,
      "events": [
        { "type": "play",  "currentTime": 0,   "ts": 1234567890 },
        { "type": "pause", "currentTime": 42.5, "ts": 1234567891 },
        { "type": "seek",  "currentTime": 10.0, "ts": 1234567892 }
      ]
    }
  ]
}
```

---

## Règles métier

- **1 seul présentateur par room** — le 2e reçoit une erreur et est refusé
- **Spectateurs illimités** par room
- **Auto-save** toutes les secondes (écrase le même fichier)
- **Seek ignoré** pour le calcul de rétention
- **Titre YouTube** récupéré via oEmbed automatiquement

---

## Messages WebSocket

| Type | Sens | Description |
|------|------|-------------|
| `join` | Client → Serveur | Rejoindre une room (role: presenter/viewer) |
| `joined` | Serveur → Client | Confirmation avec état de la room |
| `set_video` | Présentateur → Serveur | Partager une vidéo |
| `video_url` | Serveur → Viewers | Diffusion de la vidéo |
| `countdown_start` | Présentateur → Tous | Décompte avant play |
| `play` / `pause` / `seek` | Présentateur → Viewers | Synchronisation |
| `chat` | Tous → Tous | Message dans le chat |
| `error` | Serveur → Client | Erreur (ex: PRESENTER_TAKEN) |

---

# 🛡️ Pôle 2 — Anti-Scraping Shield

## Présentation

Le Pôle 2 correspond au système de cybersécurité du projet.

Il s'agit d'un service Python développé avec FastAPI permettant de détecter des comportements suspects sur une plateforme de streaming simulée.

Le système analyse les requêtes HTTP entrantes afin d'identifier :

* les connexions provenant d'adresses IP suspectes
* les changements rapides d'adresse IP
* les volumes anormaux de requêtes
* les événements de sécurité envoyés depuis une application cliente

Le service fonctionne comme un moteur d'analyse avec génération d'événements de sécurité.

---

## Objectifs

Le système vise à détecter plusieurs types de comportements frauduleux :

* utilisation d'infrastructures masquant l'origine réelle de l'utilisateur
* partage abusif d'un compte
* automatisation massive de requêtes
* comportements suspects remontés depuis le navigateur

---

## Architecture

```
                 Utilisateur
                     |
                     |
                     v
            Requête HTTP entrante
                     |
                     v
        +-----------------------------+
        |       FastAPI Backend       |
        |                             |
        |     Middleware sécurité     |
        |                             |
        |      - Vérification IP      |
        |      - Analyse session      |
        |      - Rate limiting        |
        |      - Logs sécurité        |
        +-----------------------------+
                        |
          +-------------+----------+
          |                        |
          v                        v
 Requête autorisée          Menace détectée
          |                        |
          v                        v
 Ressource protégée        Événement sécurité
```

---

## Technologies utilisées

### Langage

* Python

### Framework

* FastAPI

### Librairies principales

* FastAPI
* Uvicorn
* ipaddress
* datetime
* collections

### Concepts cybersécurité utilisés

* IP Reputation
* Détection comportementale
* Rate limiting
* Analyse de sessions
* Journalisation sécurité

---

## Fonctionnalités implémentées

## 1. Détection VPN / Proxy

Le système vérifie l'adresse IP du client lors de chaque requête.

La fonction :

```python
check_ip_reputation()
```

analyse si l'adresse IP appartient à :

* une liste d'IP VPN connues
* des plages IP correspondant à des datacenters

Les listes utilisées sont :

```python
KNOWN_VPN_IPS
DATACENTER_RANGES
```

Lorsqu'une IP est détectée comme suspecte :

```
Requête utilisateur
        ↓
Analyse IP
        ↓
IP suspecte détectée
        ↓
VPN_BLOCK
        ↓
HTTP 403
```

---

## 2. Détection de partage de compte

Le système conserve un historique des connexions utilisateurs.

Les informations stockées :

* identifiant utilisateur
* dernière adresse IP
* heure de dernière connexion

Stockage utilisé :

```python
session_history
```

Une alerte est générée lorsqu'un utilisateur change d'adresse IP très rapidement.

Règle :

```
Changement IP + moins de 10 secondes = comportement suspect
```

Réponse :

```
HTTP 403
```

---

## 3. Détection de scraping

Le système surveille le nombre de requêtes envoyées depuis une même adresse IP.

Le mécanisme utilise :

```python
rate_limiting_cache
```

Règle :

```
Plus de 5 requêtes en moins de 5 secondes
= scraping probable détecté
```

En cas de dépassement :

* un événement sécurité est créé
* la requête est bloquée

Réponse :

```
HTTP 429
```

---

## 4. Journalisation des événements

Tous les événements détectés sont enregistrés.

Chaque événement contient :

* timestamp
* règle déclenchée
* niveau de sécurité
* utilisateur
* adresse IP
* détail

Exemple :

```json
{
    "timestamp": "2026-07-01T10:20:30",
    "rule": "RATE_LIMIT",
    "level": "BLOCK",
    "user_id": "user123",
    "ip": "192.168.1.10",
    "detail": "10 requêtes en 5s — scraping probable"
}
```

Le système conserve :

```python
MAX_EVENTS = 200
```

événements maximum.

---

## 5. Réception d'événements navigateur

Le backend expose une route permettant de recevoir des événements provenant d'une application cliente.

Endpoint :

```
POST /threat
```

Exemple :

```json
{
    "type": "SCREEN_CAPTURE",
    "detail": "Tentative détectée",
    "roomId": "123"
}
```

Ces événements sont ajoutés au journal sécurité.

---

# API Pôle 2

## Accueil

```
GET /
```

Retourne une page présentant le service.

---

## Health Check

```
GET /health
```

Retourne :

* état du service
* nombre de sessions suivies
* nombre d'IP surveillées
* nombre d'événements enregistrés

---

## Liste des événements

```
GET /events
```

Retourne les événements sécurité.

Paramètre :

```
limit
```

---

## Déclaration d'une menace

```
POST /threat
```

Permet de recevoir un événement externe.

---

## Accès vidéo protégé

```
GET /video/segment
```

L'accès nécessite :

Header :

```
X-User-Id
```

Sans authentification :

```
HTTP 401
```

---

## Règles de détection

| Règle           | Description                   | Action       |
| --------------- | ----------------------------- | ------------ |
| VPN_BLOCK       | IP VPN ou datacenter détectée | HTTP 403     |
| ACCOUNT_SHARING | Changement IP rapide          | HTTP 403     |
| RATE_LIMIT      | Trop de requêtes              | HTTP 429     |
| PASS            | Requête normale               | Autorisation |

---

## Limites actuelles

Le système utilise un stockage en mémoire :

* session_history
* rate_limiting_cache
* security_events

Les données sont perdues après redémarrage.

Améliorations possibles :

* base de données pour les événements
* stockage partagé pour les sessions
* API externe de réputation IP

---

# 📊 Pôle 3 — Audience Analytics Dashboard

> Pipeline d'analyse de rétention + dashboard Streamlit temps réel.

---

## Concept

Les données d'interaction (play/pause/seek) collectées par le Pôle 1 sont analysées par un pipeline scikit-learn pour produire des métriques d'engagement : courbe de rétention, zones de décrochage, prédiction d'ennui via IsolationForest.

---

## Stack technique

| Composant | Techno |
|-----------|--------|
| Dashboard | Streamlit |
| Pipeline ML | scikit-learn (IsolationForest) |
| Visualisations | Plotly |
| Data | pandas, numpy |

---

## Lancement

```bash
cd pole3-data
pip3 install -r requirements.txt
streamlit run dashboard.py --server.port 8501
# → http://localhost:8501
```

---

## Structure

```
pole3-data/
├── dashboard.py          # App Streamlit (UI)
├── pipeline.py           # Pipeline ML (rétention, zones, IsolationForest)
├── generate_sample_data.py  # Générateur de données de démo
├── requirements.txt
└── sample_data/
    └── viewing_logs.json    # Données de démo (40 viewers, 600s)
```

---

## Pipeline ML (`pipeline.py`)

### 1. `load_logs(path)`
Charge un fichier JSON de session. Supporte 3 formats :
- **Schema v1.0** (Watch Together) : `{ viewers: [{events:[]}] }`
- **Multi-sessions démo** : `{ sessions: [{logs:[]}] }`
- **Legacy** : `{ logs: [] }`

### 2. `compute_retention_curve(events, duration)`
Pour chaque seconde `t`, calcule le % de viewers qui regardaient à ce moment.
- Play → ouvre un intervalle de visionnage
- Pause/End → ferme l'intervalle
- Seek → ignoré (le viewer continue de regarder)

### 3. `detect_dropoff_zones(retention)`
Identifie les segments de 30s avec une chute de rétention > 5%.

### 4. `compute_segment_scores(events, duration)`
Score d'engagement par tranche de 30s basé sur pauses, replays et skips.

### 5. `predict_boredom_zones(segments)`
IsolationForest sur `[n_pauses, n_skips, engagement]` → détecte les segments anormaux (ennui ou pic d'intérêt).

---

## Métriques affichées

| Métrique | Description |
|----------|-------------|
| Durée vidéo | Durée totale de la vidéo |
| Temps visionné | Somme des intervalles play→pause (seeks exclus) |
| Vues | Nombre total d'events enregistrés |
| Viewers | Nombre de viewers uniques |
| Rétention moy. | % moyen de viewers encore actifs sur toute la vidéo |
| Zones de décrochage | Segments avec forte chute de rétention |
| Score d'ennui | Probabilité de désengagement par segment (IsolationForest) |

---

## Données de démo

```bash
python3 generate_sample_data.py
# Génère sample_data/viewing_logs.json
# 40 viewers, vidéo de 600s, 3 zones de décrochage artificielles
```

---

## Flux de données

```
Watch Together (:4000/logs)
        ↓
  GET /logs (liste sessions)
  GET /logs/:filename (détail)
        ↓
  pipeline.py (load → retention → dropoffs → ML)
        ↓
  dashboard.py (Streamlit → Plotly)
```


---

# Équipe

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

Chef de groupe : **Thomas DOMMANGET**
