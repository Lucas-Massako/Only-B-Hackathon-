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
