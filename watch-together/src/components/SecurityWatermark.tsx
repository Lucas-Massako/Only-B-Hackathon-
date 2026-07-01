import React, { useEffect, useRef } from 'react';

interface Props {
  userId: string;
  roomId: string;
}

export default function SecurityWatermark({ userId, roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const label = `${userId.slice(0, 8)} · ${roomId} · ${new Date().toISOString().slice(0, 16)}`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6);

    const cols = Math.ceil(canvas.width / 280) + 2;
    const rows = Math.ceil(canvas.height / 120) + 2;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        ctx.fillText(label, c * 280, r * 120);
      }
    }
    ctx.restore();
  }, [userId, roomId]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        userSelect: 'none',
      }}
    />
  );
}
