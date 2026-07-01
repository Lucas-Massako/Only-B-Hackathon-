"""
Streamix — Pôle 3 : Dashboard Analytics
Lancer : streamlit run dashboard.py
"""

import streamlit as st
import pandas as pd
import numpy as np
import requests
import plotly.graph_objects as go
import plotly.express as px
from pipeline import run_pipeline
import tempfile, json, os

SERVER = "http://localhost:4000"

st.set_page_config(page_title="Streamix Analytics", page_icon="🎬", layout="wide")

st.markdown("""
<style>
[data-testid="stAppViewContainer"],
[data-testid="stMain"], .main, .block-container { background: #11111b !important; }
[data-testid="stSidebar"]                       { background: #1e1e2e !important; }

p, li, label, div[data-testid="stMarkdownContainer"] p { color: #cdd6f4 !important; }
h1, h2, h3, h4, h5, h6          { color: #ffffff !important; }
span                             { color: #cdd6f4; }

[data-testid="stSidebar"] *      { color: #cdd6f4 !important; }

div[data-testid="metric-container"] {
    background: #1e1e2e !important;
    border: 1px solid #313244 !important;
    border-radius: 12px !important;
    padding: 16px !important;
}
[data-testid="stMetricLabel"]  { color: #6c7086 !important; font-size: 0.8rem !important; }
[data-testid="stMetricValue"]  { color: #ffffff !important; }

.stButton > button {
    background: #313244 !important; color: #cdd6f4 !important;
    border: 1px solid #45475a !important; border-radius: 8px !important;
}
.stButton > button:hover { background: #45475a !important; }

[data-testid="stAlert"] p { color: #ffffff !important; }
[data-testid="stFileUploader"] label { color: #cdd6f4 !important; }
[data-testid="stFileUploader"] section {
    border-color: #45475a !important; background: #1e1e2e !important;
}
[data-testid="stFileUploader"] span { color: #6c7086 !important; }

.stRadio label, .stCheckbox label { color: #cdd6f4 !important; }
hr { border-color: #313244 !important; }
</style>
""", unsafe_allow_html=True)

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🎬 Streamix")
    st.caption("Pôle 3 — Analytics · ESTIAM × 42c 2026")
    st.divider()

    # Sessions depuis le serveur
    sessions_list, groups = [], {}
    try:
        r = requests.get(f"{SERVER}/logs", timeout=2)
        sessions_list = r.json().get("sessions", [])
        for s in sessions_list:
            key = (s.get("roomId", "?"), s.get("videoName", "?"))
            groups.setdefault(key, []).append(s)
    except:
        st.warning("⚠️ Serveur non connecté (port 4000)")

    uploaded = st.file_uploader("Importer un JSON", type="json")

    selected_room = selected_video_name = None

    if groups:
        st.subheader("📂 Vidéos")
        radio_labels = [
            f"{vn}  [{rid}]"
            for (rid, vn) in groups.keys()
        ]
        idx = st.radio("", range(len(radio_labels)),
                       format_func=lambda i: radio_labels[i],
                       index=st.session_state.get("sel_idx", 0))
        st.session_state["sel_idx"] = idx
        selected_room, selected_video_name = list(groups.keys())[idx]

        st.divider()
        if st.button("🗑️ Supprimer cette session", use_container_width=True):
            try:
                requests.delete(f"{SERVER}/logs/room/{selected_room}", timeout=3)
                st.session_state.pop("sel_idx", None)
                st.cache_data.clear()
                st.rerun()
            except:
                st.error("Erreur suppression")

    st.divider()
    show_security = st.checkbox("Alertes sécurité (Pôle 2)", value=True)

# ── Chargement & fusion ───────────────────────────────────────────────────────
raw_data = None

if uploaded:
    raw_data = json.load(uploaded)
elif selected_room and groups:
    try:
        key = (selected_room, selected_video_name)
        merged_viewers = {}
        best_duration = 0
        for s in groups[key]:
            d = requests.get(f"{SERVER}/logs/{s['filename']}", timeout=3).json()
            best_duration = max(best_duration, d.get("videoDuration", 0))
            for v in d.get("viewers", []):
                vid = v["viewerId"]
                if vid not in merged_viewers:
                    merged_viewers[vid] = {**v, "events": []}
                existing = {e["ts"] for e in merged_viewers[vid]["events"]}
                for e in v.get("events", []):
                    if e["ts"] not in existing:
                        merged_viewers[vid]["events"].append(e)
                        existing.add(e["ts"])
        for v in merged_viewers.values():
            v["events"].sort(key=lambda e: e["ts"])
        raw_data = {
            "schemaVersion": "1.0",
            "roomId": selected_room,
            "videoName": selected_video_name,
            "videoDuration": best_duration,
            "viewers": list(merged_viewers.values()),
        }
    except Exception as ex:
        st.error(f"Erreur chargement : {ex}")

if raw_data is None:
    demo = "sample_data/viewing_logs.json"
    if os.path.exists(demo):
        raw_data = json.load(open(demo))
        st.info("ℹ️ Données de démo — lance Watch Together pour voir tes vraies données.")
    else:
        st.warning("Aucune donnée. Lance Watch Together et charge une vidéo.")
        st.stop()

# ── Pipeline ──────────────────────────────────────────────────────────────────
@st.cache_data(ttl=15)
def get_results(data_str):
    data = json.loads(data_str)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w") as f:
        json.dump(data, f); tmp = f.name
    result = run_pipeline(tmp)
    os.unlink(tmp)
    return result

results   = get_results(json.dumps(raw_data))
retention = results["retention"]
dropoffs  = results["dropoffs"]
segments  = results["segments"]
duration  = results["duration"]

viewers_list = raw_data.get("viewers", raw_data.get("sessions", []))
all_events   = [
    {**e, "viewerId": v.get("viewerId", "?"), "role": v.get("role", "viewer")}
    for v in viewers_list
    for e in v.get("events", v.get("logs", []))
]

# ── Calculs KPIs ──────────────────────────────────────────────────────────────
n_spectateurs = len(viewers_list)
n_vues        = sum(1 for v in viewers_list if any(
    e.get("type", e.get("event")) == "play" for e in v.get("events", v.get("logs", []))
))

# Temps total regardé (somme des segments play→pause de tous les viewers)
total_watch = 0
for v in viewers_list:
    evts = sorted(v.get("events", v.get("logs", [])), key=lambda e: e.get("ts", e.get("timestamp", 0)))
    last_play = None
    for e in evts:
        t  = e.get("type", e.get("event", ""))
        ct = float(e.get("currentTime", 0))
        if t == "play":
            # 2e play sans pause → ferme l'intervalle précédent
            if last_play is not None:
                total_watch += abs(ct - last_play)
            last_play = ct
        elif t in ("pause", "end") and last_play is not None:
            total_watch += abs(ct - last_play)
            last_play = None
        # seek ignoré — le viewer continue de regarder
    if last_play is not None and duration > 0:
        total_watch += max(0, duration - last_play)

avg_ret   = np.mean(list(retention.values())) if retention else 0
mins_dur, secs_dur = divmod(int(duration), 60)
mins_wat, secs_wat = divmod(int(total_watch), 60)

# ══════════════════════════════════════════════════════════════════════════════
#  HEADER
# ══════════════════════════════════════════════════════════════════════════════
st.title("📊 Streamix — Audience Analytics")
st.markdown(f"""
<div style="background:#1e1e2e;border:1px solid #313244;border-radius:12px;
     padding:18px 24px;margin-bottom:20px;display:flex;align-items:center;gap:14px;">
  <span style="font-size:1.8rem;">🎞️</span>
  <div>
    <div style="color:#cba6f7;font-size:1.2rem;font-weight:700;">
      {raw_data.get('videoName','Vidéo')}
    </div>
    <div style="color:#6c7086;font-size:0.82rem;margin-top:3px;">
      Salle : {raw_data.get('roomId','—')}
    </div>
  </div>
</div>
""", unsafe_allow_html=True)

# ── KPIs ──────────────────────────────────────────────────────────────────────
k1, k2, k3, k4, k5 = st.columns(5)
k1.metric("⏱ Durée vidéo",       f"{mins_dur}min {secs_dur:02d}s")
k2.metric("▶️ Temps regardé",     f"{mins_wat}min {secs_wat:02d}s")
k3.metric("👁️ Vues",              str(n_vues))
k4.metric("👥 Spectateurs",       str(n_spectateurs))
k5.metric("📊 Rétention moy.",    f"{avg_ret:.0f}%")

st.divider()

# ══════════════════════════════════════════════════════════════════════════════
#  COURBE DE RÉTENTION
# ══════════════════════════════════════════════════════════════════════════════
st.subheader("📈 Courbe de rétention")

times = sorted(retention.keys())
vals  = [retention[t] for t in times]

fig = go.Figure()
for z in dropoffs:
    col = "rgba(243,139,168,0.18)" if z["severity"] == "high" else "rgba(250,179,135,0.12)"
    fig.add_vrect(x0=z["start"], x1=z["end"], fillcolor=col, layer="below", line_width=0,
                  annotation_text=f"⚠️ -{z['drop']}%", annotation_position="top left",
                  annotation_font=dict(color="#f38ba8", size=11))

fig.add_trace(go.Scatter(
    x=times, y=vals, mode="lines", name="Rétention",
    line=dict(color="#cba6f7", width=2.5),
    fill="tozeroy", fillcolor="rgba(203,166,247,0.1)",
    hovertemplate="t=%{x}s → %{y:.0f}% spectateurs<extra></extra>",
))
fig.add_hline(y=50, line_dash="dot", line_color="#45475a",
              annotation_text="50%", annotation_font_color="#585b70")
fig.update_layout(
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(30,30,46,0.5)",
    font=dict(color="#cdd6f4"),
    xaxis=dict(title="Temps (secondes)", gridcolor="#313244"),
    yaxis=dict(title="% spectateurs actifs", range=[0, 105], gridcolor="#313244"),
    margin=dict(l=0, r=0, t=10, b=0), height=300,
)
st.plotly_chart(fig, use_container_width=True)

st.divider()

# ══════════════════════════════════════════════════════════════════════════════
#  PRÉDICTION ZONES DE DÉCROCHAGE
# ══════════════════════════════════════════════════════════════════════════════
st.subheader("🤖 Prédiction des zones de décrochage")

col_drop, col_pred = st.columns(2)

with col_drop:
    st.markdown("**Zones détectées**")
    if dropoffs:
        for z in dropoffs:
            t_s, t_e = z["start"], z["end"]
            badge = "🔴" if z["severity"] == "high" else "🟠"
            st.markdown(f"{badge} **{t_s//60}:{t_s%60:02d} → {t_e//60}:{t_e%60:02d}** — chute de **{z['drop']}%**")
            st.progress(min(z["drop"] / 30.0, 1.0))
    else:
        st.success("Aucune zone critique détectée ✅")

with col_pred:
    st.markdown("**Score d'ennui par segment (IsolationForest)**")
    boring = segments[segments["boredom_score"] > 0.4].sort_values("boredom_score", ascending=True)
    if not boring.empty:
        fig2 = go.Figure(go.Bar(
            x=boring["boredom_score"], y=boring["label"],
            orientation="h",
            marker=dict(color=boring["boredom_score"],
                        colorscale=[[0,"#a6e3a1"],[0.5,"#fab387"],[1,"#f38ba8"]],
                        showscale=False),
            hovertemplate="%{y}<br>Score ennui : %{x:.0%}<extra></extra>",
        ))
        fig2.update_layout(
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(30,30,46,0.5)",
            font=dict(color="#cdd6f4"),
            xaxis=dict(title="Score d'ennui", range=[0,1], gridcolor="#313244",
                       tickformat=".0%"),
            yaxis=dict(gridcolor="#313244"),
            margin=dict(l=0, r=0, t=5, b=0), height=260,
        )
        st.plotly_chart(fig2, use_container_width=True)
    else:
        st.success("Contenu très engageant ✅")

st.divider()

# ══════════════════════════════════════════════════════════════════════════════
#  TIMELINE DES INTERACTIONS
# ══════════════════════════════════════════════════════════════════════════════
st.subheader("🕐 Timeline des interactions")

if all_events:
    df_ev = pd.DataFrame([{
        "viewer":      e.get("viewerId", "?"),
        "type":        e.get("type", e.get("event", "?")),
        "currentTime": round(float(e.get("currentTime", 0)), 1),
    } for e in all_events])

    color_map = {"play": "#a6e3a1", "pause": "#f38ba8", "seek": "#89b4fa", "end": "#fab387"}
    fig3 = px.scatter(
        df_ev, x="currentTime", y="viewer", color="type",
        color_discrete_map=color_map,
        labels={"currentTime": "Position dans la vidéo (s)", "viewer": "Spectateur", "type": "Action"},
        hover_data=["currentTime"],
    )
    fig3.update_traces(marker=dict(size=10, opacity=0.85))
    fig3.update_layout(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(30,30,46,0.5)",
        font=dict(color="#cdd6f4"),
        xaxis=dict(gridcolor="#313244"),
        yaxis=dict(gridcolor="#313244"),
        legend=dict(font=dict(color="#cdd6f4"), orientation="h", y=1.15),
        margin=dict(l=0, r=0, t=30, b=0), height=220,
    )
    st.plotly_chart(fig3, use_container_width=True)
else:
    st.info("Aucune interaction enregistrée pour cette session.")

# ══════════════════════════════════════════════════════════════════════════════
#  ALERTES SÉCURITÉ PÔLE 2
# ══════════════════════════════════════════════════════════════════════════════
if show_security:
    st.divider()
    st.subheader("🛡️ Alertes sécurité — Pôle 2")
    try:
        evts = [e for e in requests.get("http://localhost:8000/events?limit=20", timeout=2)
                .json().get("events", []) if e.get("rule") != "PASS"]
        if evts:
            c1, c2 = st.columns([3, 1])
            with c1:
                st.dataframe(
                    pd.DataFrame(evts)[["timestamp","rule","level","user_id","detail"]].tail(10),
                    use_container_width=True, height=180,
                )
            with c2:
                counts = pd.Series([e["rule"] for e in evts]).value_counts()
                fig4 = px.pie(values=counts.values, names=counts.index,
                              color_discrete_sequence=["#f38ba8","#fab387","#89b4fa","#a6e3a1"])
                fig4.update_layout(paper_bgcolor="rgba(0,0,0,0)",
                                   font=dict(color="#cdd6f4"),
                                   margin=dict(l=0,r=0,t=0,b=0), height=180,
                                   legend=dict(font=dict(color="#cdd6f4")))
                st.plotly_chart(fig4, use_container_width=True)
        else:
            st.info("Aucune alerte active — tout est normal.")
    except:
        st.warning("⚠️ Service Pôle 2 non disponible (port 8000)")

st.divider()
st.caption("Streamix Analytics · Pôle 3 IA & Data · Hackathon ESTIAM × 42c 2026")
