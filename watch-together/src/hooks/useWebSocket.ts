import { useEffect, useRef, useCallback } from 'react';
import { WsMessage } from '../types';

const WS_URL = 'ws://localhost:4000';

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        onMessageRef.current(msg);
      } catch {}
    };

    return () => ws.close();
  }, []);

  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
