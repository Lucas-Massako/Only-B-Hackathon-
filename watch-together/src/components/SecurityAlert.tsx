import React, { useEffect, useState } from 'react';
import { CaptureEvent } from '../hooks/useScreenCaptureDetection';

interface Props {
  events: CaptureEvent[];
}

const ICONS: Record<string, string> = {
  SCREEN_SHARE: '📹',
  FOCUS_LOSS:   '👁️',
  PRINT:        '🖨️',
  DEVTOOLS:     '🔧',
};

const COLORS: Record<string, string> = {
  SCREEN_SHARE: '#f38ba8',
  FOCUS_LOSS:   '#fab387',
  PRINT:        '#f9e2af',
  DEVTOOLS:     '#89b4fa',
};

export default function SecurityAlert({ events }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (events.length > 0) setVisible(true);
  }, [events]);

  if (!visible || events.length === 0) return null;

  const last = events[events.length - 1];
  const color = COLORS[last.type] ?? '#cdd6f4';

  return (
    <div style={{ ...styles.wrap, borderColor: color }}>
      <div style={styles.header}>
        <span style={{ color }}>{ICONS[last.type]} Alerte sécurité</span>
        <button style={styles.close} onClick={() => setVisible(false)}>✕</button>
      </div>
      <p style={styles.detail}>{last.detail}</p>
      <p style={styles.count}>{events.length} événement(s) détecté(s) dans cette session</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
    background: '#1e1e2e', border: '1px solid', borderRadius: 10,
    padding: '12px 16px', width: 320, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontWeight: 700, fontSize: 13 },
  close: { background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 14 },
  detail: { color: '#cdd6f4', fontSize: 12, margin: '4px 0' },
  count: { color: '#6c7086', fontSize: 11, margin: 0 },
};
