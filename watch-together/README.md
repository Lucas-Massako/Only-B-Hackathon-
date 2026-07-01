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
