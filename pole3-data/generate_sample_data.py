"""
Génère des logs de visionnage réalistes pour la démo Pôle 3.
Simule 40 spectateurs regardant une vidéo de 600 secondes (10 min).
Les zones d'ennui sont à t=120-180s et t=380-440s.
"""
import json, random, time, os
from datetime import datetime, timedelta

random.seed(42)

VIDEO_DURATION = 600  # secondes
N_VIEWERS = 40
DROP_ZONES = [(120, 180, 0.35), (380, 440, 0.45)]  # (start, end, dropout_rate)

def simulate_viewer(viewer_id: str, room_id: str) -> dict:
    logs = []
    base_ts = datetime.now() - timedelta(minutes=random.randint(5, 60))

    current_time = 0.0

    # Événement play initial
    logs.append({
        "timestamp": int(base_ts.timestamp() * 1000),
        "event": "play",
        "currentTime": current_time,
        "viewerId": viewer_id,
    })

    t = 0.0
    while t < VIDEO_DURATION:
        # Avancer dans la vidéo (simulation continue)
        advance = random.uniform(10, 30)
        t += advance

        # Vérifier zones de décrochage
        dropped_out = False
        for z_start, z_end, rate in DROP_ZONES:
            if z_start <= t <= z_end and random.random() < rate:
                # Pause ou abandon dans cette zone
                logs.append({
                    "timestamp": int((base_ts + timedelta(seconds=t)).timestamp() * 1000),
                    "event": "pause",
                    "currentTime": round(t, 1),
                    "viewerId": viewer_id,
                })

                if random.random() < 0.4:
                    # Abandon définitif
                    dropped_out = True
                    break
                else:
                    # Reprend ou seek en avant
                    skip = random.uniform(5, 30)
                    t += skip
                    logs.append({
                        "timestamp": int((base_ts + timedelta(seconds=t)).timestamp() * 1000),
                        "event": "seek",
                        "currentTime": round(t, 1),
                        "viewerId": viewer_id,
                    })
                    logs.append({
                        "timestamp": int((base_ts + timedelta(seconds=t + 1)).timestamp() * 1000),
                        "event": "play",
                        "currentTime": round(t, 1),
                        "viewerId": viewer_id,
                    })

        if dropped_out:
            break

        # Pauses naturelles aléatoires (faible probabilité)
        if random.random() < 0.05:
            logs.append({
                "timestamp": int((base_ts + timedelta(seconds=t)).timestamp() * 1000),
                "event": "pause",
                "currentTime": round(t, 1),
                "viewerId": viewer_id,
            })
            logs.append({
                "timestamp": int((base_ts + timedelta(seconds=t + random.uniform(2, 8))).timestamp() * 1000),
                "event": "play",
                "currentTime": round(t, 1),
                "viewerId": viewer_id,
            })

        # Replay (seek arrière) - signe d'intérêt
        if random.random() < 0.03 and t > 30:
            seek_back = random.uniform(10, 30)
            logs.append({
                "timestamp": int((base_ts + timedelta(seconds=t)).timestamp() * 1000),
                "event": "seek",
                "currentTime": round(t - seek_back, 1),
                "viewerId": viewer_id,
            })

    return {
        "roomId": room_id,
        "viewerId": viewer_id,
        "role": "viewer",
        "logs": logs,
        "videoDuration": VIDEO_DURATION,
    }


def main():
    room_id = "DEMO42"
    sessions = []

    for i in range(N_VIEWERS):
        viewer_id = f"viewer-{i+1:03d}"
        session = simulate_viewer(viewer_id, room_id)
        sessions.append(session)

    output = {
        "roomId": room_id,
        "exportedAt": datetime.now().isoformat(),
        "videoDuration": VIDEO_DURATION,
        "sessions": sessions,
    }

    os.makedirs("sample_data", exist_ok=True)
    with open("sample_data/viewing_logs.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"✅ Généré {N_VIEWERS} sessions → sample_data/viewing_logs.json")

    # Aussi générer un log individuel au format Watch Together (pour compatibilité)
    wt_format = {
        "roomId": room_id,
        "role": "presenter",
        "logs": sessions[0]["logs"][:20],
    }
    with open("sample_data/watch_together_export.json", "w") as f:
        json.dump(wt_format, f, indent=2)
    print("✅ Généré sample_data/watch_together_export.json (format Watch Together)")


if __name__ == "__main__":
    main()
