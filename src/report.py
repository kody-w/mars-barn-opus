"""Mars Barn Opus — HTML Report Generator

Produces a self-contained HTML report for simulation runs.
Timeline charts, resource graphs, event log, and final scoreboard.
All rendered with inline SVG — zero external dependencies.
"""
from __future__ import annotations

import json
from typing import Dict, List


def generate_report(results: Dict, title: str = "Mars Barn Opus") -> str:
    """Generate a complete HTML report from simulation results.

    Works with both single-colony and multi-colony results.
    """
    if results.get("mode") == "single":
        return _single_colony_report(results, title)
    elif "colonies" in results:
        return _multi_colony_report(results, title)
    elif results.get("mode") == "benchmark":
        return _benchmark_report(results, title)
    return "<html><body>Unknown result format</body></html>"


def _svg_bar_chart(data: List[tuple], width: int = 600, height: int = 300,
                   color: str = "#58a6ff", label: str = "") -> str:
    """Generate an SVG horizontal bar chart."""
    if not data:
        return ""
    max_val = max(v for _, v in data) or 1
    bar_height = min(30, (height - 40) // len(data))
    gap = 4

    bars = []
    for i, (name, value) in enumerate(data):
        y = 30 + i * (bar_height + gap)
        bar_w = max(2, int((value / max_val) * (width - 180)))
        bars.append(
            f'<rect x="150" y="{y}" width="{bar_w}" height="{bar_height}" '
            f'fill="{color}" rx="3"/>'
            f'<text x="145" y="{y + bar_height - 5}" fill="#c9d1d9" '
            f'font-size="12" text-anchor="end">{name}</text>'
            f'<text x="{152 + bar_w}" y="{y + bar_height - 5}" fill="#8b949e" '
            f'font-size="11">{value:.1f}</text>'
        )

    total_h = 30 + len(data) * (bar_height + gap) + 10
    return (
        f'<svg width="{width}" height="{total_h}" xmlns="http://www.w3.org/2000/svg">'
        f'<text x="{width//2}" y="20" fill="#e0e0e0" font-size="14" '
        f'text-anchor="middle" font-weight="bold">{label}</text>'
        + "".join(bars)
        + '</svg>'
    )


def _svg_line_chart(series: Dict[str, List[float]], width: int = 700,
                    height: int = 250, label: str = "") -> str:
    """Generate an SVG multi-line chart."""
    if not series:
        return ""
    colors = ["#58a6ff", "#3fb950", "#f0883e", "#da3633", "#a371f7",
              "#f778ba", "#79c0ff", "#7ee787", "#d29922", "#8b949e"]
    max_val = max(max(vals) for vals in series.values() if vals) or 1
    max_len = max(len(vals) for vals in series.values())

    lines_svg = []
    legend = []
    for idx, (name, vals) in enumerate(series.items()):
        color = colors[idx % len(colors)]
        points = []
        for i, v in enumerate(vals):
            x = 50 + int(i / max(1, max_len - 1) * (width - 80))
            y = height - 30 - int(v / max_val * (height - 60))
            points.append(f"{x},{y}")
        if points:
            lines_svg.append(
                f'<polyline points="{" ".join(points)}" fill="none" '
                f'stroke="{color}" stroke-width="2"/>'
            )
        legend.append(
            f'<text x="{60 + idx * 90}" y="{height - 5}" fill="{color}" '
            f'font-size="10">{name}</text>'
        )

    return (
        f'<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">'
        f'<text x="{width//2}" y="18" fill="#e0e0e0" font-size="14" '
        f'text-anchor="middle" font-weight="bold">{label}</text>'
        f'<line x1="50" y1="25" x2="50" y2="{height-30}" stroke="#30363d"/>'
        f'<line x1="50" y1="{height-30}" x2="{width-30}" y2="{height-30}" stroke="#30363d"/>'
        + "".join(lines_svg) + "".join(legend)
        + '</svg>'
    )


def _system_health_bar(name: str, value: float) -> str:
    """Render a single system health bar as HTML."""
    pct = int(value * 100)
    color = "#3fb950" if pct > 70 else ("#d29922" if pct > 30 else "#da3633")
    return (
        f'<div style="margin:4px 0;display:flex;align-items:center">'
        f'<span style="width:100px;color:#8b949e">{name}</span>'
        f'<div style="flex:1;background:#21262d;border-radius:4px;height:16px">'
        f'<div style="width:{pct}%;background:{color};border-radius:4px;height:100%"></div>'
        f'</div>'
        f'<span style="width:50px;text-align:right;color:#c9d1d9;font-size:12px">{pct}%</span>'
        f'</div>'
    )


CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,
'Segoe UI',Helvetica,Arial,sans-serif;padding:20px}
.container{max-width:800px;margin:0 auto}
h1{color:#fff;font-size:28px;margin:20px 0 5px}
h2{color:#58a6ff;font-size:20px;margin:30px 0 10px;border-bottom:1px solid #21262d;
padding-bottom:8px}
h3{color:#e0e0e0;font-size:16px;margin:20px 0 8px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;
margin:15px 0}
.stat{display:inline-block;margin:10px 20px 10px 0}
.stat-value{font-size:28px;font-weight:bold;color:#58a6ff}
.stat-label{font-size:12px;color:#8b949e;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #21262d}
th{color:#8b949e;font-size:12px;text-transform:uppercase}
.alive{color:#3fb950}.dead{color:#da3633}
.tag{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;
margin:2px 4px}
.tag-trade{background:#1f3a1f;color:#3fb950}
.tag-sabotage{background:#3a1f1f;color:#da3633}
.tag-event{background:#1f2d3a;color:#58a6ff}
.tag-death{background:#3a1f1f;color:#f0883e}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #21262d;
color:#484f58;font-size:12px;text-align:center}
"""


def _multi_colony_report(results: Dict, title: str) -> str:
    """Generate multi-colony HTML report."""
    colonies = results.get("colonies", {})
    timeline = results.get("timeline", [])

    # Sort by survival
    ranked = sorted(colonies.items(),
                    key=lambda x: (-x[1]["survived_sols"], -x[1]["reputation"]))

    # Header stats
    total_sols = max((d["survived_sols"] for d in colonies.values()), default=0)
    alive_count = sum(1 for d in colonies.values() if d["alive"])
    total_trades = sum(d["trades_completed"] for d in colonies.values())

    # Build survival bar chart
    survival_data = [(name, data["survived_sols"]) for name, data in ranked]
    survival_chart = _svg_bar_chart(survival_data, label="Survival (sols)",
                                     color="#58a6ff")

    # Reputation bar chart
    rep_data = [(name, data["reputation"]) for name, data in ranked]
    rep_chart = _svg_bar_chart(rep_data, label="Final Reputation",
                                color="#a371f7")

    # Colony cards
    colony_cards = []
    for rank, (name, data) in enumerate(ranked, 1):
        status_class = "alive" if data["alive"] else "dead"
        status_text = "SURVIVED" if data["alive"] else f"DEAD (sol {data['survived_sols']})"
        cause = f" &mdash; {data['cause_of_death']}" if data.get("cause_of_death") else ""

        systems_html = ""
        if "final_resources" in data:
            r = data["final_resources"]
            systems_html = f"""
            <h3>Final Resources</h3>
            <table>
            <tr><td>O2</td><td>{r.get('o2_kg', 0):.1f} kg</td>
                <td>H2O</td><td>{r.get('h2o_liters', 0):.1f} L</td></tr>
            <tr><td>Food</td><td>{r.get('food_kcal', 0):.0f} kcal</td>
                <td>Power</td><td>{r.get('power_kwh', 0):.1f} kWh</td></tr>
            </table>"""

        colony_cards.append(f"""
        <div class="card">
            <h3>#{rank} {name}
                <span class="{status_class}" style="float:right">{status_text}{cause}</span>
            </h3>
            <div>
                <span class="stat"><span class="stat-value">{data['survived_sols']}</span>
                    <br><span class="stat-label">Sols</span></span>
                <span class="stat"><span class="stat-value">{data['reputation']:.2f}</span>
                    <br><span class="stat-label">Reputation</span></span>
                <span class="stat"><span class="stat-value">{data['trades_completed']}</span>
                    <br><span class="stat-label">Trades</span></span>
                <span class="stat"><span class="stat-value">{data['morale']:.0%}</span>
                    <br><span class="stat-label">Morale</span></span>
                <span class="stat"><span class="stat-value">{data['sols_on_rations']}</span>
                    <br><span class="stat-label">Ration Sols</span></span>
            </div>
            {systems_html}
        </div>""")

    # Event timeline (last 20 significant events)
    events_html = ""
    significant = []
    for sol_data in timeline:
        for e in sol_data.get("events", []):
            significant.append(("event", sol_data["sol"], e.get("description", e.get("type", ""))))
        for t in sol_data.get("trades", []):
            significant.append(("trade", sol_data["sol"], f"{t['from']} → {t['to']}"))
        for s in sol_data.get("sabotages", []):
            tag = "DETECTED" if s.get("detected") else "SUCCESS"
            significant.append(("sabotage", sol_data["sol"], f"{s['attacker']} → {s['target']} ({tag})"))
        for d in sol_data.get("deaths", []):
            significant.append(("death", sol_data["sol"], f"{d['colony']}: {d.get('cause', 'unknown')}"))

    if significant:
        recent = significant[-30:]
        rows = []
        for etype, sol, desc in recent:
            tag_class = f"tag-{etype}"
            rows.append(f'<tr><td>{sol}</td><td><span class="tag {tag_class}">{etype}</span></td>'
                       f'<td>{desc}</td></tr>')
        events_html = f"""
        <h2>Event Log (last {len(recent)})</h2>
        <div class="card">
            <table><tr><th>Sol</th><th>Type</th><th>Details</th></tr>
            {"".join(rows)}
            </table>
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title} — Simulation Report</title>
<style>{CSS}</style></head>
<body><div class="container">
<h1>{title}</h1>
<p style="color:#8b949e">Multi-colony simulation &mdash; {len(colonies)} colonies, seed {results.get('seed', '?')}</p>

<div class="card">
    <span class="stat"><span class="stat-value">{total_sols}</span>
        <br><span class="stat-label">Max Survival</span></span>
    <span class="stat"><span class="stat-value">{alive_count}/{len(colonies)}</span>
        <br><span class="stat-label">Survived</span></span>
    <span class="stat"><span class="stat-value">{total_trades}</span>
        <br><span class="stat-label">Total Trades</span></span>
</div>

<h2>Survival Leaderboard</h2>
<div class="card">{survival_chart}</div>

<h2>Reputation</h2>
<div class="card">{rep_chart}</div>

<h2>Colony Details</h2>
{"".join(colony_cards)}

{events_html}

<div class="footer">
    Generated by Mars Barn Opus &mdash; 1vsM Protocol<br>
    One AI vs the swarm. The code is the argument.
</div>
</div></body></html>"""


def _single_colony_report(results: Dict, title: str) -> str:
    """Generate single-colony HTML report."""
    state = results.get("final_state", {})
    r = state.get("resources", {})
    s = state.get("systems", {})

    systems_bars = "".join(_system_health_bar(name, val) for name, val in s.items())

    events = results.get("event_log", [])
    events_rows = ""
    for e in events[-20:]:
        events_rows += (f'<tr><td>{e.get("started", "?")}</td>'
                       f'<td>{e.get("ended", "?")}</td>'
                       f'<td>{e.get("type", "?")}</td>'
                       f'<td>{e.get("severity", 0):.2f}</td></tr>')

    status = "SURVIVED" if results["alive"] else "DEAD"
    cause = f" &mdash; {results['cause_of_death']}" if results.get("cause_of_death") else ""

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title} — Single Colony Report</title>
<style>{CSS}</style></head>
<body><div class="container">
<h1>{title}</h1>
<p style="color:#8b949e">Single colony &mdash; {results.get('archetype', '?')} governor, seed {results.get('seed', '?')}</p>

<div class="card">
    <span class="stat"><span class="stat-value">{results['survived_sols']}</span>
        <br><span class="stat-label">Sols Survived</span></span>
    <span class="stat"><span class="stat-value {'alive' if results['alive'] else 'dead'}">{status}</span>
        <br><span class="stat-label">Status{cause}</span></span>
    <span class="stat"><span class="stat-value">{state.get('cumulative_radiation_msv', 0):.0f}</span>
        <br><span class="stat-label">Radiation (mSv)</span></span>
    <span class="stat"><span class="stat-value">{state.get('morale', 0):.0%}</span>
        <br><span class="stat-label">Morale</span></span>
</div>

<h2>Final Resources</h2>
<div class="card">
    <table>
    <tr><td>O2</td><td>{r.get('o2_kg', 0):.1f} kg</td>
        <td>H2O</td><td>{r.get('h2o_liters', 0):.1f} L</td></tr>
    <tr><td>Food</td><td>{r.get('food_kcal', 0):.0f} kcal</td>
        <td>Power</td><td>{r.get('power_kwh', 0):.1f} kWh</td></tr>
    </table>
</div>

<h2>System Health</h2>
<div class="card">{systems_bars}</div>

<h2>Event History</h2>
<div class="card">
    <table><tr><th>Start</th><th>End</th><th>Type</th><th>Severity</th></tr>
    {events_rows}
    </table>
</div>

<div class="footer">
    Generated by Mars Barn Opus &mdash; 1vsM Protocol
</div>
</div></body></html>"""


def _benchmark_report(results: Dict, title: str) -> str:
    """Generate benchmark HTML report."""
    archetypes = results.get("archetypes", {})
    ranked = sorted(archetypes.items(), key=lambda x: -x[1]["avg_survival"])

    chart_data = [(name, data["avg_survival"]) for name, data in ranked]
    chart = _svg_bar_chart(chart_data, label="Average Survival (sols)")

    rows = []
    for rank, (name, data) in enumerate(ranked, 1):
        rows.append(f"""<tr>
            <td>{rank}</td><td><strong>{name}</strong></td>
            <td>{data['avg_survival']:.0f}</td>
            <td>{data['min_survival']}</td><td>{data['max_survival']}</td>
            <td>{data['survival_rate']}</td>
            <td style="color:#8b949e">{data['description']}</td>
        </tr>""")

    winner = ranked[0]
    loser = ranked[-1]
    spread = winner[1]["avg_survival"] - loser[1]["avg_survival"]

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title} — Benchmark Report</title>
<style>{CSS}</style></head>
<body><div class="container">
<h1>{title} &mdash; Benchmark</h1>
<p style="color:#8b949e">10 archetypes &times; 5 seeds &times; 500 sols</p>

<div class="card">
    <span class="stat"><span class="stat-value">{winner[0]}</span>
        <br><span class="stat-label">Champion</span></span>
    <span class="stat"><span class="stat-value">{winner[1]['avg_survival']:.0f}</span>
        <br><span class="stat-label">Best Avg</span></span>
    <span class="stat"><span class="stat-value">{spread:.0f}</span>
        <br><span class="stat-label">Spread (sols)</span></span>
</div>

<h2>Survival by Archetype</h2>
<div class="card">{chart}</div>

<h2>Full Results</h2>
<div class="card">
    <table>
    <tr><th>#</th><th>Archetype</th><th>Avg</th><th>Min</th><th>Max</th>
        <th>Rate</th><th>Description</th></tr>
    {"".join(rows)}
    </table>
</div>

<div class="footer">
    Generated by Mars Barn Opus &mdash; 1vsM Protocol<br>
    One AI vs the swarm. The code is the argument.
</div>
</div></body></html>"""
