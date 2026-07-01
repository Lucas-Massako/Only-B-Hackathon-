import { useEffect, useRef, useCallback } from 'react';

export interface CaptureEvent {
  type: 'SCREEN_SHARE' | 'FOCUS_LOSS' | 'PRINT' | 'DEVTOOLS';
  timestamp: number;
  detail: string;
}

interface Options {
  userId: string;
  roomId: string;
  onThreat: (event: CaptureEvent) => void;
}

export function useScreenCaptureDetection({ userId, roomId, onThreat }: Options) {
  const reportedRef = useRef<Set<string>>(new Set());

  const report = useCallback((event: CaptureEvent) => {
    // Déduplique les événements identiques sur 5s
    const key = `${event.type}-${Math.floor(event.timestamp / 5000)}`;
    if (reportedRef.current.has(key)) return;
    reportedRef.current.add(key);

    console.warn(`[SECURITY] ${event.type}:`, event.detail);
    onThreat(event);

    // Envoie au backend pole2-security pour journalisation
    fetch('http://localhost:8000/threat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ ...event, roomId }),
    }).catch(() => {});
  }, [userId, roomId, onThreat]);

  useEffect(() => {
    // ── TECHNIQUE 1 : Partage d'écran via l'API Screen Capture ─────────────
    // Surveille si getDisplayMedia est appelé (ex. OBS, navigateur partage onglet)
    const originalGetDisplayMedia =
      navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);

    if (navigator.mediaDevices?.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = async (constraints) => {
        report({
          type: 'SCREEN_SHARE',
          timestamp: Date.now(),
          detail: 'Tentative de capture d\'écran via getDisplayMedia détectée',
        });
        // On laisse quand même passer pour ne pas bloquer le navigateur
        return originalGetDisplayMedia(constraints);
      };
    }

    // ── TECHNIQUE 2 : Perte de focus / bascule vers outil de capture ────────
    let focusLossTime: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        focusLossTime = Date.now();
      } else if (focusLossTime) {
        const duration = Date.now() - focusLossTime;
        // Bascule très courte (< 800ms) = probable raccourci de capture (Cmd+Shift+4, etc.)
        if (duration < 800) {
          report({
            type: 'FOCUS_LOSS',
            timestamp: Date.now(),
            detail: `Bascule de fenêtre suspecte (${duration}ms) — possible raccourci capture`,
          });
        }
        focusLossTime = null;
      }
    };

    // ── TECHNIQUE 3 : Impression / export PDF (souvent utilisé pour capturer) ─
    const handleBeforePrint = () => {
      report({
        type: 'PRINT',
        timestamp: Date.now(),
        detail: 'Tentative d\'impression / export PDF détectée',
      });
    };

    // ── TECHNIQUE 4 : Détection ouverture DevTools (changement de taille fenêtre) ─
    let devtoolsOpen = false;
    const detectDevTools = () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const isOpen = widthDiff > threshold || heightDiff > threshold;
      if (isOpen && !devtoolsOpen) {
        devtoolsOpen = true;
        report({
          type: 'DEVTOOLS',
          timestamp: Date.now(),
          detail: 'Ouverture des DevTools détectée (possible inspection du stream)',
        });
      } else if (!isOpen) {
        devtoolsOpen = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeprint', handleBeforePrint);
    const devToolsInterval = setInterval(detectDevTools, 1000);

    return () => {
      // Restaure getDisplayMedia original
      if (originalGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeprint', handleBeforePrint);
      clearInterval(devToolsInterval);
    };
  }, [report]);
}
