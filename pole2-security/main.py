from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from collections import defaultdict
import time
import ipaddress
import json
from datetime import datetime

app = FastAPI(title="Anti-Scraping & Fraud Shield — Streamix Pôle 2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── STOCKAGE EN MÉMOIRE ────────────────────────────────────────────────────────
# { user_id: {"last_ip": str, "last_time": float} }
session_history = {}

# { ip: [timestamp1, timestamp2, ...] } (fenêtre glissante)
rate_limiting_cache = defaultdict(list)

# Journal des événements de sécurité (exposé à l'API pour le dashboard)
security_events: list[dict] = []

MAX_EVENTS = 200  # garde les 200 derniers événements


def log_event(rule: str, level: str, user_id: str, ip: str, detail: str):
    event = {
        "timestamp": datetime.utcnow().isoformat(),
        "rule": rule,
        "level": level,   # "BLOCK" | "WARN" | "INFO"
        "user_id": user_id,
        "ip": ip,
        "detail": detail,
    }
    security_events.append(event)
    if len(security_events) > MAX_EVENTS:
        security_events.pop(0)
    print(f"[{level}] {rule} | user={user_id} ip={ip} | {detail}")


# ── BASE DE RÉPUTATION IP ──────────────────────────────────────────────────────
# En production : charger un CSV d'ASN VPN/datacenter (ex. ipinfo.io)
KNOWN_VPN_IPS = {
    "185.200.118.4": "Datacenter-NordVPN",
    "104.28.0.1":    "Datacenter-Cloudflare",
    "10.8.0.1":      "Datacenter-OpenVPN",
}

DATACENTER_RANGES = [
    ipaddress.ip_network("185.200.118.0/24"),   # NordVPN
    ipaddress.ip_network("104.28.0.0/16"),       # Cloudflare
]


def check_ip_reputation(ip_str: str) -> tuple[bool, str]:
    try:
        user_ip = ipaddress.ip_address(ip_str)
        if ip_str in KNOWN_VPN_IPS:
            return True, KNOWN_VPN_IPS[ip_str]
        for net in DATACENTER_RANGES:
            if user_ip in net:
                return True, f"Datacenter-{net}"
        return False, "Residential-ISP"
    except ValueError:
        return False, "Unknown"


# ── MIDDLEWARE ANTI-FRAUDE ─────────────────────────────────────────────────────
@app.middleware("http")
async def anti_fraud_layer(request: Request, call_next):
    # Routes exclues (santé, dashboard, events)
    excluded = {"/", "/health", "/events", "/docs", "/openapi.json", "/redoc"}
    if request.url.path in excluded:
        return await call_next(request)

    user_id = request.headers.get("X-User-Id", "anonymous")
    client_ip = request.headers.get("X-Forwarded-For", request.client.host)
    current_time = time.time()

    # RULE 1 — VPN / Proxy ─────────────────────────────────────────────────────
    is_vpn, asn_name = check_ip_reputation(client_ip)
    if is_vpn:
        log_event("VPN_BLOCK", "BLOCK", user_id, client_ip,
                  f"IP appartient à {asn_name}")
        return JSONResponse(
            status_code=403,
            content={"error": "Connexion VPN/Proxy interdite", "asn": asn_name},
        )

    # RULE 2 — Sessions simultanées / vitesse de déplacement ──────────────────
    if user_id != "anonymous" and user_id in session_history:
        old = session_history[user_id]
        if old["last_ip"] != client_ip:
            delta = current_time - old["last_time"]
            if delta < 10:
                log_event("ACCOUNT_SHARING", "BLOCK", user_id, client_ip,
                          f"Changement d'IP en {delta:.2f}s (prev={old['last_ip']})")
                return JSONResponse(
                    status_code=403,
                    content={"error": "Activité simultanée anormale détectée",
                             "delta_seconds": round(delta, 2)},
                )
            else:
                log_event("IP_CHANGE", "WARN", user_id, client_ip,
                          f"Changement d'IP normal en {delta:.0f}s")

    if user_id != "anonymous":
        session_history[user_id] = {"last_ip": client_ip, "last_time": current_time}

    # RULE 3 — Rate limiting / scraping (5 req / 5 s par IP) ──────────────────
    timestamps = rate_limiting_cache[client_ip]
    timestamps = [t for t in timestamps if current_time - t < 5]
    timestamps.append(current_time)
    rate_limiting_cache[client_ip] = timestamps

    if len(timestamps) > 5:
        log_event("RATE_LIMIT", "BLOCK", user_id, client_ip,
                  f"{len(timestamps)} requêtes en 5s — scraping probable")
        return JSONResponse(
            status_code=429,
            content={"error": "Trop de requêtes — scraping détecté",
                     "requests_in_window": len(timestamps)},
        )

    log_event("PASS", "INFO", user_id, client_ip,
              f"Requête autorisée → {request.url.path}")
    return await call_next(request)


# ── ROUTES ────────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def home():
    return """
<html>
<head>
  <title>Streamix Security Shield</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #11111b; color: #cdd6f4; padding: 40px; }
    h1 { color: #cba6f7; } code { background: #313244; padding: 2px 6px; border-radius: 4px; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg);
      font-size: 4rem; color: rgba(255,255,255,0.04); pointer-events: none; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="watermark">USER_DEMO · 127.0.0.1</div>
  <h1>🛡️ Streamix — Anti-Scraping & Fraud Shield</h1>
  <p>API de sécurité active. Endpoints disponibles :</p>
  <ul>
    <li><code>GET /video/segment</code> — segment vidéo protégé (header <code>X-User-Id</code> requis)</li>
    <li><code>GET /events</code> — journal des événements de sécurité (JSON)</li>
    <li><code>GET /health</code> — statut du service</li>
    <li><code>GET /docs</code> — Swagger UI</li>
  </ul>
</body>
</html>
"""


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "sessions_tracked": len(session_history),
        "ips_tracked": len(rate_limiting_cache),
        "events_logged": len(security_events),
    }


@app.get("/events")
async def get_events(limit: int = 50):
    """Journal des événements de sécurité — utilisé par le dashboard Pôle 3."""
    return {"events": security_events[-limit:]}


@app.post("/threat")
async def report_threat(request: Request):
    """Reçoit les événements de sécurité détectés côté navigateur."""
    user_id = request.headers.get("X-User-Id", "anonymous")
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    client_ip = request.headers.get("X-Forwarded-For", request.client.host)
    log_event(
        rule=body.get("type", "BROWSER_THREAT"),
        level="WARN",
        user_id=user_id,
        ip=client_ip,
        detail=body.get("detail", "") + f" | room={body.get('roomId', '?')}",
    )
    return {"status": "logged"}


@app.get("/video/segment")
async def get_segment(request: Request):
    """Route protégée simulant un segment HLS."""
    user_id = request.headers.get("X-User-Id", "anonymous")
    if user_id == "anonymous":
        return JSONResponse(status_code=401,
                            content={"error": "Authentification requise (header X-User-Id)"})
    return {
        "status": "success",
        "user": user_id,
        "segment": "00234.ts",
        "expires_in": 30,
        "data": "BASE64_VIDEO_STREAM_PLACEHOLDER",
    }
