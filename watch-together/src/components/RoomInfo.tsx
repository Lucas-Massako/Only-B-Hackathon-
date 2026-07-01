import React from 'react';
import { RoomState, Role } from '../types';

interface Props {
  roomId: string;
  role: Role;
  state: RoomState | null;
}

export default function RoomInfo({ roomId, role, state }: Props) {
  const url = `${window.location.origin}?room=${roomId}&role=viewer`;

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        <span style={styles.label}>Room</span>
        <code style={styles.value}>{roomId}</code>
        <span style={{ ...styles.badge, background: role === 'presenter' ? '#7c3aed' : '#2563eb' }}>
          {role === 'presenter' ? '🎬 Présentateur' : '👤 Spectateur'}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Spectateurs connectés</span>
        <strong style={styles.count}>{state?.clientCount ?? 0}</strong>
      </div>
      {role === 'presenter' && (
        <div style={styles.shareWrap}>
          <span style={styles.label}>Lien d'invitation</span>
          <input readOnly style={styles.shareInput} value={url} onClick={(e) => (e.target as HTMLInputElement).select()} />
          <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(url)}>Copier</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { background: '#1e1e2e', borderRadius: 8, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  label: { color: '#6c7086', fontSize: 12, minWidth: 140 },
  value: { color: '#cdd6f4', fontSize: 13, background: '#313244', padding: '2px 8px', borderRadius: 4 },
  badge: { fontSize: 11, padding: '2px 10px', borderRadius: 20, color: '#fff', marginLeft: 'auto' },
  count: { color: '#a6e3a1', fontSize: 16 },
  shareWrap: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  shareInput: { flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #313244', background: '#313244', color: '#cdd6f4', fontSize: 11, minWidth: 0 },
  copyBtn: { padding: '4px 12px', borderRadius: 6, background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', cursor: 'pointer', fontSize: 12 },
};
