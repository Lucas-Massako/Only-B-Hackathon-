import React, { useEffect, useState } from 'react';

interface Props {
  from: number;
  onDone: () => void;
}

export default function Countdown({ from, onDone }: Props) {
  const [count, setCount] = useState(from);

  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onDone]);

  const progress = count / from;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * progress;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <p style={styles.label}>La vidéo démarre dans…</p>

        <div style={styles.ring}>
          <svg width={130} height={130} style={{ transform: 'rotate(-90deg)' }}>
            {/* Track */}
            <circle cx={65} cy={65} r={radius} fill="none" stroke="#313244" strokeWidth={8} />
            {/* Progress */}
            <circle
              cx={65} cy={65} r={radius}
              fill="none"
              stroke="#cba6f7"
              strokeWidth={8}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.9s linear' }}
            />
          </svg>
          <span style={styles.number}>{count}</span>
        </div>

        <p style={styles.sub}>Préparez-vous !</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 5000,
    background: 'rgba(17,17,27,0.85)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 20,
    padding: '36px 48px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    boxShadow: '0 12px 48px rgba(0,0,0,.6)',
  },
  label: { margin: 0, color: '#cdd6f4', fontSize: 16, fontWeight: 600 },
  ring: { position: 'relative', width: 130, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  number: {
    position: 'absolute',
    fontSize: 52, fontWeight: 800, color: '#cba6f7',
    lineHeight: 1,
  },
  sub: { margin: 0, color: '#6c7086', fontSize: 13 },
};
