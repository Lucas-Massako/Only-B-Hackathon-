const express  = require('express');
const { WebSocketServer } = require('ws');
const http     = require('http');
const { v4: uuidv4 } = require('uuid');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json({ limit: '10mb' }));

// ── Fichiers statiques ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const LOGS_DIR    = path.join(__dirname, 'logs');
[UPLOADS_DIR, LOGS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
}, express.static(UPLOADS_DIR));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Upload vidéo ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_');
    cb(null, `${name}_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2 GB

app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  console.log(`[UPLOAD] ${req.file.originalname} → ${req.file.filename}`);
  res.json({ url, filename: req.file.filename, originalName: req.file.originalname });
});

// ── Sauvegarde des logs de visionnage ─────────────────────────────────────────
// Schéma : { schemaVersion, sessionId, roomId, videoName, videoDuration,
//            recordedAt, viewers:[{viewerId, role, events:[{type, currentTime, ts}]}] }
app.post('/logs', (req, res) => {
  const data = req.body;
  if (!data || !data.roomId) return res.status(400).json({ error: 'Invalid payload' });

  // Un fichier stable par sessionId — l'auto-save écrase le même fichier
  const sessionId = data.sessionId || `${data.roomId}_${Date.now()}`;
  const filename  = `session_${sessionId}.json`;
  fs.writeFileSync(path.join(LOGS_DIR, filename), JSON.stringify(data, null, 2));
  console.log(`[LOGS] Updated ${filename} (${data.viewers?.[0]?.events?.length ?? 0} events)`);
  res.json({ status: 'saved', filename });
});

// ── Suppression d'un fichier log ──────────────────────────────────────────────
app.delete('/logs/:filename', (req, res) => {
  const file = path.join(LOGS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  console.log(`[LOGS] Deleted ${req.params.filename}`);
  res.json({ status: 'deleted' });
});

// ── Suppression de toutes les sessions d'une room ─────────────────────────────
app.delete('/logs/room/:roomId', (req, res) => {
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
  let count = 0;
  files.forEach(f => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, f)));
      if (d.roomId === req.params.roomId) {
        fs.unlinkSync(path.join(LOGS_DIR, f));
        count++;
      }
    } catch {}
  });
  console.log(`[LOGS] Deleted ${count} files for room ${req.params.roomId}`);
  res.json({ status: 'deleted', count });
});

// ── Liste des sessions sauvegardées ───────────────────────────────────────────
app.get('/logs', (req, res) => {
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
  const sessions = files.map(f => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, f)));
      return { filename: f, roomId: d.roomId, videoName: d.videoName, recordedAt: d.recordedAt, viewers: d.viewers?.length ?? 0 };
    } catch { return { filename: f }; }
  }).reverse();
  res.json({ sessions });
});

app.get('/logs/:filename', (req, res) => {
  const file = path.join(LOGS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(file)));
});

// ── WebSocket rooms ───────────────────────────────────────────────────────────
const rooms = new Map();

function broadcast(room, message, excludeWs = null) {
  const payload = JSON.stringify(message);
  if (room.presenter && room.presenter !== excludeWs && room.presenter.readyState === 1)
    room.presenter.send(payload);
  room.clients.forEach((ws) => {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(payload);
  });
}

function getRoomState(room) {
  return { clientCount: room.clients.size, hasPresenter: !!room.presenter, videoUrl: room.videoUrl || null, videoName: room.videoName || null };
}

wss.on('connection', (ws) => {
  let clientId = uuidv4();
  let currentRoomId = null;
  let isPresenter = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, roomId, payload } = msg;

    if (type === 'join') {
      currentRoomId = roomId;
      if (!rooms.has(roomId))
        rooms.set(roomId, { presenter: null, clients: new Map(), videoUrl: null, videoName: null });
      const room = rooms.get(roomId);

      if (payload?.role === 'presenter' && !room.presenter) {
        isPresenter = true;
        room.presenter = ws;
        ws.send(JSON.stringify({ type: 'joined', clientId, role: 'presenter', state: getRoomState(room) }));
      } else if (payload?.role === 'presenter' && room.presenter) {
        // Salle déjà occupée par un présentateur → refus
        ws.send(JSON.stringify({ type: 'error', code: 'PRESENTER_TAKEN', message: 'Cette salle a déjà un présentateur. Rejoignez en tant que spectateur ou choisissez une autre salle.' }));
        ws.close();
        return;
      } else {
        isPresenter = false;
        room.clients.set(clientId, ws);
        ws.send(JSON.stringify({ type: 'joined', clientId, role: 'viewer', state: getRoomState(room) }));
        if (room.videoUrl)
          ws.send(JSON.stringify({ type: 'video_url', payload: { url: room.videoUrl, name: room.videoName } }));
      }
      broadcast(room, { type: 'room_state', state: getRoomState(room) }, ws);
      console.log(`[${roomId}] ${isPresenter ? 'Presenter' : 'Viewer'} joined (${clientId}). Clients: ${room.clients.size}`);
    }

    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (type === 'set_video' && isPresenter) {
      room.videoUrl  = payload.url;
      room.videoName = payload.name || 'Vidéo';
      broadcast(room, { type: 'video_url', payload: { url: payload.url, name: payload.name } }, ws);
    }

    if (type === 'countdown_start' && isPresenter)
      broadcast(room, { type: 'countdown_start', payload: { currentTime: payload.currentTime, seconds: payload.seconds || 3 } });

    if (type === 'play'  && isPresenter) broadcast(room, { type: 'play',  payload: { currentTime: payload.currentTime } }, ws);
    if (type === 'pause' && isPresenter) broadcast(room, { type: 'pause', payload: { currentTime: payload.currentTime } }, ws);
    if (type === 'seek'  && isPresenter) broadcast(room, { type: 'seek',  payload: { currentTime: payload.currentTime } }, ws);

    if (type === 'sync_request') {
      if (room.presenter?.readyState === 1)
        room.presenter.send(JSON.stringify({ type: 'sync_request', from: clientId }));
    }
    if (type === 'sync_response' && isPresenter) {
      const targetWs = room.clients.get(payload.to);
      if (targetWs?.readyState === 1)
        targetWs.send(JSON.stringify({ type: 'seek', payload: { currentTime: payload.currentTime } }));
    }
    if (type === 'chat') {
      broadcast(room, { type: 'chat', payload: { clientId, role: isPresenter ? 'presenter' : 'viewer', text: payload.text, timestamp: Date.now() } });
    }
  });

  ws.on('close', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (isPresenter) {
      room.presenter = null;
      broadcast(room, { type: 'presenter_left' });
      console.log(`[${currentRoomId}] Presenter disconnected`);
    } else {
      room.clients.delete(clientId);
      broadcast(room, { type: 'room_state', state: getRoomState(room) });
      console.log(`[${currentRoomId}] Viewer left (${clientId}). Clients: ${room.clients.size}`);
    }
    if (!room.presenter && room.clients.size === 0) {
      rooms.delete(currentRoomId);
      console.log(`[${currentRoomId}] Room deleted`);
    }
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: rooms.size }));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`WS + HTTP server on http://localhost:${PORT}`));
