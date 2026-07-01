import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (t: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
}

interface Props {
  src: string;
  isPresenter: boolean;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (currentTime: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

let ytApiLoaded = false;
function loadYtApi(): Promise<void> {
  if (ytApiLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => { ytApiLoaded = true; resolve(); };
  });
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(
  ({ src, isPresenter, onPlay, onPause, onSeek, onTimeUpdate }, ref) => {
    const videoRef       = useRef<HTMLVideoElement>(null);
    const hlsRef         = useRef<Hls | null>(null);
    const ytPlayerRef    = useRef<any>(null);
    const ytContainerRef = useRef<HTMLDivElement>(null);
    const ignoreRef      = useRef(false);
    const ytReadyRef     = useRef(false);
    const pendingTimeRef = useRef<number | null>(null); // seek+play queued before ready

    // Refs always up-to-date — safe to use inside useImperativeHandle closure
    const youtubeId      = src ? extractYoutubeId(src) : null;
    const isYoutubeRef   = useRef(!!youtubeId);
    isYoutubeRef.current = !!youtubeId;

    // ── Unified imperative handle ──────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      play: () => {
        console.log('[VideoPlayer] play() appelé — isYT:', isYoutubeRef.current, 'ytReady:', ytReadyRef.current);
        if (isYoutubeRef.current) {
          if (ytReadyRef.current) {
            ytPlayerRef.current?.playVideo();
          } else {
            pendingTimeRef.current = pendingTimeRef.current ?? 0; // queue it
          }
        } else {
          ignoreRef.current = true;
          videoRef.current?.play().finally(() => { ignoreRef.current = false; });
        }
      },
      pause: () => {
        if (isYoutubeRef.current) {
          ytPlayerRef.current?.pauseVideo();
        } else {
          ignoreRef.current = true;
          videoRef.current?.pause();
          ignoreRef.current = false;
        }
      },
      seekTo: (t: number) => {
        if (isYoutubeRef.current) {
          if (ytReadyRef.current) {
            ytPlayerRef.current?.seekTo(t, true);
          } else {
            pendingTimeRef.current = t; // will be consumed by onReady
          }
        } else if (videoRef.current) {
          ignoreRef.current = true;
          videoRef.current.currentTime = t;
          ignoreRef.current = false;
        }
      },
      getCurrentTime: () => {
        if (isYoutubeRef.current) return ytPlayerRef.current?.getCurrentTime?.() ?? 0;
        return videoRef.current?.currentTime ?? 0;
      },
      getDuration: () => {
        if (isYoutubeRef.current) return ytPlayerRef.current?.getDuration?.() ?? 0;
        return videoRef.current?.duration ?? 0;
      },
      isPaused: () => {
        if (isYoutubeRef.current) return ytPlayerRef.current?.getPlayerState?.() !== 1;
        return videoRef.current?.paused ?? true;
      },
    })); // no deps — always reads from refs

    // ── YouTube player init ────────────────────────────────────────────────────
    useEffect(() => {
      if (!youtubeId) return;
      let cancelled = false;

      ytReadyRef.current = false;
      pendingTimeRef.current = null;

      loadYtApi().then(() => {
        if (cancelled || !ytContainerRef.current) return;

        ytPlayerRef.current?.destroy();

        const divId = `yt-${youtubeId}`;
        const div   = document.createElement('div');
        div.id      = divId;
        ytContainerRef.current.innerHTML = '';
        ytContainerRef.current.appendChild(div);

        const YT = (window as any).YT;
        ytPlayerRef.current = new YT.Player(divId, {
          videoId: youtubeId,
          width: '100%',
          height: '100%',
          playerVars: { controls: isPresenter ? 1 : 0, disablekb: isPresenter ? 0 : 1, rel: 0 },
          events: {
            onReady: () => {
              console.log('[VideoPlayer] YT onReady — pending:', pendingTimeRef.current);
              ytReadyRef.current = true;
              if (pendingTimeRef.current !== null) {
                ytPlayerRef.current?.seekTo(pendingTimeRef.current, true);
                ytPlayerRef.current?.playVideo();
                pendingTimeRef.current = null;
              }
            },
            onStateChange: (e: any) => {
              if (!isPresenter) return;
              const t = ytPlayerRef.current?.getCurrentTime?.() ?? 0;
              if (e.data === YT.PlayerState.PLAYING) onPlay(t);
              if (e.data === YT.PlayerState.PAUSED)  onPause(t);
            },
          },
        });
      });

      return () => { cancelled = true; };
    }, [youtubeId]); // eslint-disable-line

    // ── YT seek detection interval (presenter only) ────────────────────────────
    useEffect(() => {
      if (!youtubeId || !isPresenter) return;
      let last = 0;
      const id = setInterval(() => {
        const p = ytPlayerRef.current;
        if (!p || typeof p.getCurrentTime !== 'function') return;
        try {
          const t = p.getCurrentTime();
          if (Math.abs(t - last) > 2 && p.getPlayerState() !== 1) onSeek(t);
          onTimeUpdate?.(t, p.getDuration?.() ?? 0);
          last = t;
        } catch {}
      }, 1000);
      return () => clearInterval(id);
    }, [youtubeId, isPresenter]); // eslint-disable-line

    // ── HTML5 / HLS setup ─────────────────────────────────────────────────────
    useEffect(() => {
      if (youtubeId) return;
      const video = videoRef.current;
      if (!video || !src) return;

      hlsRef.current?.destroy();
      if (src.includes('.m3u8') && Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        video.src = src;
      }
      return () => hlsRef.current?.destroy();
    }, [src, youtubeId]);

    // ── HTML5 events (presenter only) ─────────────────────────────────────────
    useEffect(() => {
      if (youtubeId) return;
      const video = videoRef.current;
      if (!video || !isPresenter) return;

      const onPlayEvt   = () => { if (!ignoreRef.current) onPlay(video.currentTime); };
      const onPauseEvt  = () => { if (!ignoreRef.current) onPause(video.currentTime); };
      const onSeekedEvt = () => { if (!ignoreRef.current) onSeek(video.currentTime); };
      const onTimeUpd   = () => onTimeUpdate?.(video.currentTime, video.duration);

      video.addEventListener('play',       onPlayEvt);
      video.addEventListener('pause',      onPauseEvt);
      video.addEventListener('seeked',     onSeekedEvt);
      video.addEventListener('timeupdate', onTimeUpd);
      return () => {
        video.removeEventListener('play',       onPlayEvt);
        video.removeEventListener('pause',      onPauseEvt);
        video.removeEventListener('seeked',     onSeekedEvt);
        video.removeEventListener('timeupdate', onTimeUpd);
      };
    }, [youtubeId, isPresenter]); // eslint-disable-line

    if (youtubeId) {
      return (
        <div
          ref={ytContainerRef}
          style={{ width: '100%', height: '100%', pointerEvents: isPresenter ? 'auto' : 'none' }}
        />
      );
    }

    return (
      <video
        ref={videoRef}
        controls={isPresenter}
        style={{ width: '100%', height: '100%', background: '#000' }}
        playsInline
      />
    );
  }
);

export default VideoPlayer;
