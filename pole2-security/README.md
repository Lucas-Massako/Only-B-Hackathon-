# 🛡️ Pôle 2 — Anti-Scraping & Fraud Shield

> Middleware FastAPI de détection de fraude, scraping et comportements suspects.

---

## Concept

Une couche de sécurité placée devant la plateforme Streamix pour détecter et bloquer les comportements malveillants : bots, scrapers, tentatives de téléchargement non autorisé, et patterns d'accès suspects.

---

## Stack technique

| Composant | Techno |
|-----------|--------|
| API | FastAPI (Python 3.12) |
| Détection | Heuristiques + scoring |
| Format | REST JSON |

---

## Lancement

```bash
cd pole2-security
pip3 install -r requirements.txt
uvicorn main:app --port 8000 --reload
# → http://localhost:8000
```

---

## Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/alerts` | Liste des alertes détectées |
| `POST` | `/analyze` | Analyser une requête suspecte |

---

## Intégration avec le Dashboard (Pôle 3)

Le dashboard Streamlit interroge automatiquement le port 8000 pour afficher les alertes sécurité en temps réel dans la section "Alertes de sécurité".

```python
# dashboard.py
resp = requests.get("http://localhost:8000/alerts", timeout=2)
alerts = resp.json().get("alerts", [])
```

---

## Types de menaces détectées

- Scraping automatisé (user-agents suspects, fréquence anormale)
- Tentatives de téléchargement de flux HLS
- Accès multiples depuis la même IP
- Patterns de comportement non-humain
