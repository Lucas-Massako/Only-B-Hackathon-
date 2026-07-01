import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, onSend }: Props) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div style={styles.panel}>
      <h3 style={styles.title}>Chat</h3>
      <div style={styles.messages}>
        {messages.map((m, i) => (
          <div key={i} style={styles.message}>
            <span style={{ ...styles.badge, background: m.role === 'presenter' ? '#7c3aed' : '#2563eb' }}>
              {m.role === 'presenter' ? '🎬' : '👤'} {m.clientId.slice(0, 6)}
            </span>
            <span style={styles.text}>{m.text}</span>
            <span style={styles.time}>{new Date(m.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message..."
        />
        <button type="submit" style={styles.btn}>Envoyer</button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e2e', borderRadius: 8, padding: 12 },
  title: { margin: '0 0 8px', color: '#cdd6f4', fontSize: 14, fontWeight: 700 },
  messages: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 },
  message: { display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' },
  badge: { fontSize: 10, padding: '2px 6px', borderRadius: 4, color: '#fff', whiteSpace: 'nowrap' },
  text: { color: '#cdd6f4', fontSize: 13, flex: 1 },
  time: { color: '#585b70', fontSize: 10, whiteSpace: 'nowrap' },
  form: { display: 'flex', gap: 6 },
  input: { flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #313244', background: '#313244', color: '#cdd6f4', fontSize: 13 },
  btn: { padding: '6px 12px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 },
};
