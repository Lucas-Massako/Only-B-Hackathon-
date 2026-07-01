import React, { useState } from 'react';
import { Role } from '../types';

interface Props {
  defaultRoom?: string;
  defaultRole?: Role;
  onJoin: (roomId: string, role: Role) => void;
}

export default function JoinScreen({ defaultRoom = '', defaultRole = 'viewer', onJoin }: Props) {
  const [roomId, setRoomId] = useState(defaultRoom || Math.random().toString(36).slice(2, 8).toUpperCase());
  const [role, setRole] = useState<Role>(defaultRole);

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logo}>🎬</div>
        <h1 style={styles.title}>Watch Together</h1>
        <p style={styles.sub}>Hackathon ESTIAM × 42c — Pôle 1 · Sujet B</p>

        <label style={styles.label}>ID de la salle</label>
        <input
          style={styles.input}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          placeholder="Ex : ABCD12"
        />

        <label style={styles.label}>Rôle</label>
        <div style={styles.roleRow}>
          {(['presenter', 'viewer'] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{ ...styles.roleBtn, ...(role === r ? styles.roleActive : {}) }}
            >
              {r === 'presenter' ? '🎬 Présentateur' : '👤 Spectateur'}
            </button>
          ))}
        </div>

        <button style={styles.joinBtn} onClick={() => onJoin(roomId.trim(), role)} disabled={!roomId.trim()}>
          Rejoindre
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#11111b' },
  card: { background: '#1e1e2e', borderRadius: 16, padding: 40, width: 360, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 8px 40px rgba(0,0,0,.5)' },
  logo: { fontSize: 40, textAlign: 'center' },
  title: { margin: 0, color: '#cdd6f4', textAlign: 'center', fontSize: 26 },
  sub: { margin: 0, color: '#585b70', fontSize: 12, textAlign: 'center' },
  label: { color: '#6c7086', fontSize: 12, marginBottom: -8 },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #313244', background: '#313244', color: '#cdd6f4', fontSize: 16, letterSpacing: 2 },
  roleRow: { display: 'flex', gap: 10 },
  roleBtn: { flex: 1, padding: '10px 0', borderRadius: 8, border: '2px solid #313244', background: '#313244', color: '#6c7086', cursor: 'pointer', fontSize: 13, transition: 'all .15s' },
  roleActive: { borderColor: '#7c3aed', color: '#cba6f7', background: '#2d1f5e' },
  joinBtn: { marginTop: 8, padding: '12px 0', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700 },
};
