import React, { useState, useRef, useCallback, useEffect } from 'react';
import JoinScreen from './components/JoinScreen';
import VideoPlayer, { VideoPlayerHandle } from './components/VideoPlayer';
import ChatPanel from './components/ChatPanel';
import RoomInfo from './components/RoomInfo';
import Countdown from './components/Countdown';
import SecurityWatermark from './components/SecurityWatermark';
import SecurityAlert from './components/SecurityAlert';
import { useWebSocket } from './hooks/useWebSocket';
import { useScreenCaptureDetection, CaptureEvent } from './hooks/useScreenCaptureDetection';
import { Role, RoomState, ChatMessage, WsMessage } from './types';

const SERVER = 'http://localhost:4000';

// ── Schéma de données Pôle 3 ─────────────────────────────────────────────────
interface ViewingEvent {
  type: 'play' | 'pause' | 'seek' | 'end';
  currentTime: number;
  ts: number; // unix ms
}

interface ViewerSession {
  viewerId: string;
  role: 'presenter' | 'viewer';
  joinedAt: string; // ISO
  events: ViewingEvent[];
}

interface SessionLog {
  schemaVersion: '1.0';
  sessionId: string;
  roomId: string;
  videoName: string;
  videoDuration: number;
  recordedAt: string;
  viewers: ViewerSession[];
}

function generateId() {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

function App() {
  const params  = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room') || '';
  const urlRole = (params.get('role') as Role) || 'viewer';

  const [joined,         setJoined]         = useState(false);
  const [roomId,         setRoomId]          = useState('');
  const [role,           setRole]            = useState<Role>('viewer');
  const [roomState,      setRoomState]       = useState<RoomState | null>(null);
  const [videoUrl,       setVideoUrl]        = useState('');
  const [videoName,      setVideoName]       = useState('');
  const [videoInput,     setVideoInput]      = useState('');
  const [chatMessages,   setChatMessages]    = useState<ChatMessage[]>([]);
  const [securityEvents, setSecurityEvents]  = useState<CaptureEvent[]>([]);
  const [countdown,      setCountdown]       = useState<{ seconds: number; currentTime: number } | null>(null);
  const [uploading,      setUploading]       = useState(false);
  const [logsSaved,      setLogsSaved]       = useState(false);

  const playerRef       = useRef<VideoPlayerHandle>(null);
  const countingDownRef = useRef(false);
  const skipNextPlayRef = useRef(false);
  const sessionIdRef    = useRef(generateId());
  const joinedAtRef     = useRef(new Date().toISOString());
  const viewerIdRef     = useRef('');
  const roleRef         = useRef<'presenter' | 'viewer'>('viewer');
  const eventsRef       = useRef<ViewingEvent[]>([]);
  const videoNameRef    = useRef('');
  const roomIdRef       = useRef('');

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'joined':
        break;
      case 'room_state':
        if (msg.state) setRoomState(msg.state);
        break;
      case 'video_url': {
        const p = msg.payload as any;
        setVideoUrl(p.url);
        setVideoName(p.name || 'Vidéo');
        videoNameRef.current = p.name || 'Vidéo';
        break;
      }
      case 'countdown_start':
        console.log('[WS] countdown_start reçu', msg.payload);
        setCountdown({
          seconds:     (msg.payload as any).seconds,
          currentTime: (msg.payload as any).currentTime,
        });
        break;
      case 'play':
        console.log('[WS] play reçu', msg.payload, 'playerRef:', !!playerRef.current);
        playerRef.current?.seekTo((msg.payload as any).currentTime);
        playerRef.current?.play();
        eventsRef.current.push({ type: 'play', currentTime: (msg.payload as any).currentTime, ts: Date.now() });
        break;
      case 'pause':
        playerRef.current?.seekTo((msg.payload as any).currentTime);
        playerRef.current?.pause();
        eventsRef.current.push({ type: 'pause', currentTime: (msg.payload as any).currentTime, ts: Date.now() });
        break;
      case 'seek':
        playerRef.current?.seekTo((msg.payload as any).currentTime);
        eventsRef.current.push({ type: 'seek', currentTime: (msg.payload as any).currentTime, ts: Date.now() });
        break;
      case 'error':
        alert((msg as any).message || 'Erreur de connexion.');
        setJoined(false);
        break;

      case 'presenter_left':
        alert('Le présentateur a quitté la session.');
        break;
      case 'sync_request':
        send({ type: 'sync_response', payload: { to: msg.from!, currentTime: playerRef.current?.getCurrentTime() ?? 0 } });
        break;
      case 'chat':
        setChatMessages((prev) => [...prev, msg.payload as unknown as ChatMessage]);
        break;
      default:
        break;
    }
  }, []);

  const { send } = useWebSocket(handleWsMessage);

  useScreenCaptureDetection({
    userId: joined ? roomId + '-' + role : 'anonymous',
    roomId,
    onThreat: (evt) => setSecurityEvents((prev) => [...prev, evt]),
  });

  // ── Enregistrement des événements (schéma Pôle 3) ─────────────────────────
  const recordEvent = useCallback((type: ViewingEvent['type'], currentTime: number) => {
    eventsRef.current.push({ type, currentTime, ts: Date.now() });
  }, []);

  // ── Sauvegarde automatique des logs sur le serveur ─────────────────────────
  const saveLogs = useCallback(async () => {
    if (eventsRef.current.length === 0) return;
    // Durée réelle de la vidéo (pas la position courante)
    const duration = playerRef.current?.getDuration() ?? playerRef.current?.getCurrentTime() ?? 0;
    const payload: SessionLog = {
      schemaVersion: '1.0',
      sessionId:     sessionIdRef.current,
      roomId:        roomIdRef.current,
      videoName:     videoNameRef.current || 'Vidéo',
      videoDuration: duration,
      recordedAt:    new Date().toISOString(),
      viewers: [{
        viewerId:  viewerIdRef.current,
        role:      roleRef.current,
        joinedAt:  joinedAtRef.current,
        events:    [...eventsRef.current],
      }],
    };
    try {
      await fetch(`${SERVER}/logs`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      setLogsSaved(true);
      setTimeout(() => setLogsSaved(false), 3000);
    } catch {}
  }, []);

  // ── Auto-save toutes les 30s quand une session est active ─────────────────
  useEffect(() => {
    if (!joined || !videoUrl) return;
    const id = setInterval(() => {
      if (eventsRef.current.length > 0) saveLogs();
    }, 1_000);
    return () => clearInterval(id);
  }, [joined, videoUrl, saveLogs]);

  // ── Rejoindre ─────────────────────────────────────────────────────────────
  const handleJoin = (rid: string, r: Role) => {
    const vid = r === 'presenter' ? 'presenter' : `viewer-${generateId()}`;
    viewerIdRef.current = vid;
    roleRef.current     = r as 'presenter' | 'viewer';
    roomIdRef.current   = rid;
    setRoomId(rid);
    setRole(r);
    send({ type: 'join', roomId: rid, payload: { role: r } });
    setJoined(true);
  };

  // ── Upload fichier local ───────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res  = await fetch(`${SERVER}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      const url  = data.url as string;
      const name = file.name;
      videoNameRef.current = name;
      eventsRef.current    = [];
      countingDownRef.current = false;
      setCountdown(null);
      setVideoUrl(url);
      setVideoName(name);
      send({ type: 'set_video', payload: { url, name } });
    } catch (err) {
      alert('Erreur upload : ' + err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // ── URL manuelle ──────────────────────────────────────────────────────────
  const handleSetVideo = async () => {
    if (!videoInput.trim()) return;
    const url = videoInput.trim();
    let name  = url.split('/').pop() || 'Vidéo';

    // Récupère le vrai titre YouTube via oEmbed (sans clé API)
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      try {
        const res  = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        const data = await res.json();
        name = data.title || `YouTube — ${ytMatch[1]}`;
      } catch {
        name = `YouTube — ${ytMatch[1]}`;
      }
    }

    videoNameRef.current    = name;
    eventsRef.current       = [];
    countingDownRef.current = false;
    setCountdown(null);
    setVideoUrl(url);
    setVideoName(name);
    send({ type: 'set_video', payload: { url, name } });
  };

  // ── Contrôles play/pause ──────────────────────────────────────────────────
  const handlePlay = (currentTime: number) => {
    if (skipNextPlayRef.current) { skipNextPlayRef.current = false; return; }
    if (countingDownRef.current) return;
    recordEvent('play', currentTime);
    countingDownRef.current = true;
    send({ type: 'countdown_start', payload: { currentTime, seconds: 3 } });
  };

  const handlePause = (currentTime: number) => {
    if (countingDownRef.current) return;
    recordEvent('pause', currentTime);
    send({ type: 'pause', payload: { currentTime } });
    saveLogs(); // auto-save à chaque pause
  };

  const handleCountdownDone = () => {
    const t = countdown!.currentTime;
    setCountdown(null);
    countingDownRef.current = false;
    skipNextPlayRef.current = true;
    playerRef.current?.seekTo(t);
    playerRef.current?.play();
    send({ type: 'play', payload: { currentTime: t } });
  };

  const handleSeek = (currentTime: number) => {
    recordEvent('seek', currentTime);
    send({ type: 'seek', payload: { currentTime } });
  };

  // ── Quitter ───────────────────────────────────────────────────────────────
  const handleLeave = async () => {
    recordEvent('end', playerRef.current?.getCurrentTime() ?? 0);
    await saveLogs();
    setJoined(false);
    setRoomId('');
    setVideoUrl('');
    setVideoName('');
    setVideoInput('');
    setChatMessages([]);
    setRoomState(null);
    eventsRef.current = [];
  };

  if (!joined) {
    return <JoinScreen defaultRoom={urlRoom} defaultRole={urlRole} onJoin={handleJoin} />;
  }

  return (
    <div style={styles.root}>
      <SecurityWatermark userId={role + '-' + roomId} roomId={roomId} />
      <SecurityAlert events={securityEvents} />
      {countdown && (
        <Countdown
          from={countdown.seconds}
          onDone={role === 'presenter' ? handleCountdownDone : () => setCountdown(null)}
        />
      )}

      <header style={styles.header}>
        <span style={styles.headerLogo}>🎬 Watch Together</span>
        <span style={styles.headerSub}>Hackathon ESTIAM × 42c · Pôle 1 · Sujet B</span>
        <button onClick={handleLeave} style={styles.leaveBtn}>← Menu principal</button>
      </header>

      <main style={styles.main}>
        <div style={styles.left}>
          <RoomInfo roomId={roomId} role={role} state={roomState} />

          {role === 'presenter' && (
            <div style={styles.urlBar}>
              {/* Upload local */}
              <label style={styles.uploadBtn}>
                {uploading ? '⏳ Upload…' : '📁 Fichier local'}
                <input
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              {/* URL manuelle */}
              <input
                style={styles.urlInput}
                placeholder="ou URL vidéo (MP4, .m3u8, YouTube)…"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetVideo()}
              />
              <button style={styles.urlBtn} onClick={handleSetVideo}>Charger</button>
            </div>
          )}

          {videoName && (
            <div style={styles.videoLabel}>
              🎞️ <strong style={{ color: '#cba6f7' }}>{videoName}</strong>
            </div>
          )}

          <div style={styles.playerWrap}>
            {videoUrl ? (
              <VideoPlayer
                ref={playerRef}
                src={videoUrl}
                isPresenter={role === 'presenter'}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
                onTimeUpdate={() => {}}
              />
            ) : (
              <div style={styles.noVideo}>
                {role === 'presenter'
                  ? 'Chargez une vidéo (fichier local ou URL) ci-dessus'
                  : 'En attente du présentateur…'}
              </div>
            )}
          </div>

          {role === 'viewer' && (
            <p style={styles.hint}>Les contrôles sont désactivés. Le présentateur pilote votre lecteur en temps réel.</p>
          )}
        </div>

        <div style={styles.right}>
          <ChatPanel
            messages={chatMessages}
            onSend={(text) => send({ type: 'chat', payload: { text } })}
          />
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root:       { minHeight: '100vh', background: '#11111b', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' },
  header:     { padding: '12px 24px', background: '#1e1e2e', borderBottom: '1px solid #313244', display: 'flex', alignItems: 'center', gap: 12 },
  headerLogo: { color: '#cdd6f4', fontWeight: 700, fontSize: 18 },
  headerSub:  { color: '#585b70', fontSize: 12 },
  savedBadge: { color: '#a6e3a1', fontSize: 12, marginLeft: 4 },
  saveBtn:    { marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, background: '#1e3a5f', color: '#89b4fa', border: '1px solid #2563eb', cursor: 'pointer', fontSize: 12 },
  leaveBtn:   { padding: '6px 14px', borderRadius: 8, background: 'transparent', color: '#6c7086', border: '1px solid #45475a', cursor: 'pointer', fontSize: 13 },
  main:       { flex: 1, display: 'flex', gap: 16, padding: 16, overflow: 'hidden' },
  left:       { flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  right:      { width: 300, flexShrink: 0 },
  urlBar:     { display: 'flex', gap: 8, alignItems: 'center' },
  uploadBtn:  { padding: '8px 14px', borderRadius: 8, background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' as const },
  urlInput:   { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #313244', background: '#1e1e2e', color: '#cdd6f4', fontSize: 13 },
  urlBtn:     { padding: '8px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 },
  videoLabel: { color: '#6c7086', fontSize: 13 },
  playerWrap: { borderRadius: 8, overflow: 'hidden', background: '#000', aspectRatio: '16/9' },
  noVideo:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#585b70', fontSize: 14, aspectRatio: '16/9' },
  hint:       { color: '#585b70', fontSize: 12, margin: 0 },
};

export default App;
