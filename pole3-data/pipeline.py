"""
Streamix — Pôle 3 : Pipeline d'analyse de rétention
-----------------------------------------------------
Entrée  : logs JSON (format Watch Together ou multi-sessions)
Sorties :
  - retention_curve      : dict {second -> pct_viewers_still_watching}
  - dropoff_zones        : liste de segments à forte chute
  - segment_scores       : score d'engagement [0..1] par tranche de 30s
  - boredom_predictions  : IsolationForest → anomalies de décrochage
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler
from typing import Optional


# ── Chargement ────────────────────────────────────────────────────────────────

def load_logs(path: str) -> tuple[list[dict], int]:
    """Charge les logs et retourne (all_events, video_duration).
    Supporte 3 formats :
      - schemaVersion 1.0 : { viewers: [{viewerId, events:[]}] }
      - multi-sessions démo : { sessions: [{viewerId, logs:[]}] }
      - legacy single : { logs: [] }
    """
    data = json.loads(Path(path).read_text())
    duration = int(data.get("videoDuration", 600) or 600)
    events = []

    if "viewers" in data:
        # Schéma v1.0 (Watch Together réel)
        for v in data["viewers"]:
            vid = v.get("viewerId", "viewer-001")
            for e in v.get("events", []):
                events.append({**e, "viewerId": vid})

    elif "sessions" in data:
        # Format multi-sessions (generate_sample_data.py)
        for s in data["sessions"]:
            vid = s.get("viewerId", "viewer-001")
            for e in s.get("logs", []):
                events.append({**e, "viewerId": vid})

    else:
        # Legacy single viewer
        for e in data.get("logs", []):
            events.append({**e, "viewerId": e.get("viewerId", "viewer-001")})

    return events, duration


# ── Rétention ─────────────────────────────────────────────────────────────────

def compute_retention_curve(events: list[dict], duration) -> dict[int, float]:
    duration = int(duration)
    """
    Pour chaque seconde t, calcule le % de viewers encore actifs.
    Un viewer est actif à t s'il a joué la vidéo à t (sans pause prolongée).
    """
    viewers = {}
    # Trier par timestamp (ts ou timestamp selon le schéma)
    for e in sorted(events, key=lambda x: x.get("ts", x.get("timestamp", 0))):
        vid = e.get("viewerId", "viewer-unknown")
        if vid not in viewers:
            viewers[vid] = {"last_play": None, "watched": set()}

        # Schéma v1 : "type" | ancien schéma démo : "event"
        etype = e.get("type", e.get("event", ""))
        ct    = float(e.get("currentTime", 0))

        if etype == "play":
            # Si déjà en train de jouer (2e play sans pause), ferme l'intervalle précédent
            if viewers[vid]["last_play"] is not None:
                start = viewers[vid]["last_play"]
                for s in range(int(min(start, ct)), int(max(start, ct)) + 1):
                    viewers[vid]["watched"].add(s)
            viewers[vid]["last_play"] = ct

        elif etype in ("pause", "end"):
            # Ferme l'intervalle de visionnage
            start = viewers[vid]["last_play"]
            if start is not None:
                for s in range(int(min(start, ct)), int(max(start, ct)) + 1):
                    viewers[vid]["watched"].add(s)
            viewers[vid]["last_play"] = None

        # seek = ignoré pour la rétention (le viewer continue de regarder)

    # Flush les sessions encore en play sans pause finale
    for vid, state in viewers.items():
        if state["last_play"] is not None:
            for s in range(int(state["last_play"]), duration + 1):
                viewers[vid]["watched"].add(s)

    total = max(len(viewers), 1)
    retention = {}
    for t in range(duration + 1):
        active = sum(1 for v in viewers.values() if t in v["watched"])
        retention[t] = round(active / total * 100, 1)

    return retention


# ── Zones de décrochage ───────────────────────────────────────────────────────

def detect_dropoff_zones(
    retention: dict[int, float],
    min_drop: float = 5.0,
    window: int = 30,
) -> list[dict]:
    """
    Identifie les segments de `window` secondes où la rétention chute de plus de `min_drop` %.
    """
    times = sorted(retention.keys())
    zones = []
    i = 0
    while i < len(times) - window:
        t_start = times[i]
        t_end   = times[i + window]
        drop    = retention[t_start] - retention[t_end]
        if drop >= min_drop:
            zones.append({
                "start": t_start,
                "end":   t_end,
                "drop":  round(drop, 1),
                "severity": "high" if drop >= 15 else "medium",
            })
            i += window  # sauter la fenêtre pour éviter les doublons
        else:
            i += 5  # avancer de 5s
    return zones


# ── Score d'engagement par segment ───────────────────────────────────────────

def compute_segment_scores(events: list[dict], duration, seg_size: int = 30) -> pd.DataFrame:
    duration = int(duration)
    """
    Pour chaque segment de `seg_size` secondes, calcule :
      - n_pauses   : pauses dans ce segment (signe de distraction)
      - n_replays  : seeks en arrière (signe d'intérêt)
      - n_skips    : seeks en avant (signe d'ennui)
      - engagement : score composite [0..1] (1 = très engagé)
    """
    rows = []
    for seg_start in range(0, duration, seg_size):
        seg_end = seg_start + seg_size
        seg_events = [e for e in events if seg_start <= e.get("currentTime", 0) < seg_end]

        etype   = lambda e: e.get("type", e.get("event", ""))
        pauses  = sum(1 for e in seg_events if etype(e) == "pause")
        seeks   = [e for e in seg_events if etype(e) == "seek"]
        replays = sum(1 for e in seeks if e.get("currentTime", 0) < seg_start + seg_size / 2)
        skips   = len(seeks) - replays

        # Score brut : replays augmentent, pauses/skips diminuent
        raw = max(0, 10 + replays * 3 - pauses * 2 - skips * 4)
        rows.append({
            "segment_start": seg_start,
            "segment_end":   seg_end,
            "label":         f"{seg_start//60}:{seg_start%60:02d}–{seg_end//60}:{seg_end%60:02d}",
            "n_pauses":      pauses,
            "n_replays":     replays,
            "n_skips":       skips,
            "raw_score":     raw,
        })

    df = pd.DataFrame(rows)
    scaler = MinMaxScaler()
    df["engagement"] = scaler.fit_transform(df[["raw_score"]]).round(3)
    return df


# ── Prédiction d'anomalies (IsolationForest) ─────────────────────────────────

def predict_boredom_zones(segment_scores: pd.DataFrame) -> pd.DataFrame:
    """
    Utilise IsolationForest pour détecter les segments atypiques (ennui / pic d'intérêt).
    Retourne le DataFrame enrichi avec `anomaly` (-1 = zone anormale) et `boredom_score`.
    """
    features = segment_scores[["n_pauses", "n_skips", "engagement"]].values

    if len(features) < 4:
        segment_scores["anomaly"] = 0
        segment_scores["boredom_score"] = 0.5
        return segment_scores

    model = IsolationForest(contamination=0.2, random_state=42)
    segment_scores = segment_scores.copy()
    segment_scores["anomaly"] = model.fit_predict(features)

    # Score de probabilité d'ennui : score_samples → normalisé en [0,1]
    raw_scores = model.score_samples(features)
    scaler = MinMaxScaler()
    # Inverser : un score bas (anomalie) → boredom élevé
    segment_scores["boredom_score"] = 1 - scaler.fit_transform(raw_scores.reshape(-1, 1)).flatten()
    segment_scores["boredom_score"] = segment_scores["boredom_score"].round(3)

    return segment_scores


# ── Rapport texte ──────────────────────────────────────────────────────────────

def print_report(retention: dict, dropoffs: list, segments: pd.DataFrame):
    print("\n" + "="*60)
    print("  STREAMIX — RAPPORT RÉTENTION & ENGAGEMENT")
    print("="*60)

    avg_ret = np.mean(list(retention.values()))
    print(f"\n📊 Rétention moyenne  : {avg_ret:.1f}%")
    print(f"   Rétention finale   : {retention[max(retention)]:.1f}%")

    print(f"\n🔴 Zones de décrochage détectées ({len(dropoffs)}) :")
    for z in dropoffs:
        t_s, t_e = z['start'], z['end']
        print(f"   {t_s//60}:{t_s%60:02d} → {t_e//60}:{t_e%60:02d}  chute={z['drop']}%  [{z['severity'].upper()}]")

    print(f"\n😴 Segments les plus ennuyeux (boredom_score > 0.6) :")
    boring = segments[segments["boredom_score"] > 0.6].sort_values("boredom_score", ascending=False)
    for _, row in boring.iterrows():
        print(f"   {row['label']}  boredom={row['boredom_score']:.2f}  skips={row['n_skips']}")

    print(f"\n🔥 Segments les plus engageants (engagement > 0.7) :")
    hot = segments[segments["engagement"] > 0.7].sort_values("engagement", ascending=False)
    for _, row in hot.iterrows():
        print(f"   {row['label']}  engagement={row['engagement']:.2f}  replays={row['n_replays']}")

    print("\n" + "="*60)


# ── Point d'entrée ─────────────────────────────────────────────────────────────

def run_pipeline(log_path: str) -> dict:
    events, duration = load_logs(log_path)
    duration         = int(duration) if duration else 600
    retention        = compute_retention_curve(events, duration)
    dropoffs         = detect_dropoff_zones(retention)
    segments         = compute_segment_scores(events, duration)
    segments         = predict_boredom_zones(segments)

    print_report(retention, dropoffs, segments)

    return {
        "retention":  retention,
        "dropoffs":   dropoffs,
        "segments":   segments,
        "duration":   duration,
        "n_events":   len(events),
    }


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "sample_data/viewing_logs.json"
    run_pipeline(path)
