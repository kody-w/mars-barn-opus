"""Accessible self-contained HTML for mission-readiness cohorts."""
from __future__ import annotations

import json
from html import escape
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


def _escape(value: object) -> str:
    return escape(str(value), quote=True)


def _percent(value: object) -> str:
    return f"{float(value) * 100:.1f}%"


def _metric_card(
    label: str,
    before: Optional[object],
    after: object,
) -> str:
    before_detail = (
        f'<span class="before">before: {_escape(before)}</span>'
        if before is not None else ""
    )
    return (
        '<div class="metric">'
        f'<span class="metric-label">{_escape(label)}</span>'
        f'<strong>{_escape(after)}</strong>'
        f"{before_detail}"
        "</div>"
    )


def _curve_points(
    curve: Sequence[Dict],
    max_sol: int,
    width: int,
    height: int,
) -> str:
    left, top, right, bottom = 58, 24, 18, 42
    plot_width = width - left - right
    plot_height = height - top - bottom
    points = []
    for point in curve:
        sol = max(0.0, min(float(max_sol), float(point["sol"])))
        fraction = max(0.0, min(1.0, float(point["fraction"])))
        x = left + sol / max(1, max_sol) * plot_width
        y = top + (1.0 - fraction) * plot_height
        points.append(f"{x:.2f},{y:.2f}")
    return " ".join(points)


def _survival_chart(
    before: Optional[Dict],
    after: Dict,
) -> str:
    width, height = 820, 310
    max_sol = int(after["configuration"]["max_sols"])
    after_points = _curve_points(
        after["survival_curve"],
        max_sol,
        width,
        height,
    )
    before_polyline = ""
    if before is not None:
        before_points = _curve_points(
            before["survival_curve"],
            max_sol,
            width,
            height,
        )
        before_polyline = (
            f'<polyline points="{_escape(before_points)}" '
            'fill="none" stroke="#f97316" stroke-width="3"/>'
        )

    grid = []
    for fraction in (0.0, 0.25, 0.5, 0.75, 1.0):
        y = 24 + (1.0 - fraction) * 244
        grid.append(
            f'<line x1="58" y1="{y:.1f}" x2="802" y2="{y:.1f}" '
            'stroke="#263043" stroke-width="1"/>'
            f'<text x="50" y="{y + 4:.1f}" text-anchor="end">'
            f"{_escape(_percent(fraction))}</text>"
        )
    for sol in (0, max_sol // 4, max_sol // 2, max_sol * 3 // 4, max_sol):
        x = 58 + sol / max(1, max_sol) * 744
        grid.append(
            f'<text x="{x:.1f}" y="292" text-anchor="middle">'
            f"{_escape(sol)}</text>"
        )

    if before is not None:
        description = (
            '<desc id="survival-desc">Fraction of deterministic runs retained '
            'through each mission sol. Orange is before and cyan is after.</desc>'
        )
        legend_before = (
            '<span><i class="swatch before-line"></i>Before</span>'
        )
        legend_after = (
            '<span><i class="swatch after-line"></i>After</span>'
        )
    else:
        description = (
            '<desc id="survival-desc">Fraction of deterministic runs retained '
            'through each mission sol. Cyan is the cohort.</desc>'
        )
        legend_before = ""
        legend_after = (
            '<span><i class="swatch after-line"></i>Cohort</span>'
        )
    return (
        '<figure class="chart">'
        '<svg viewBox="0 0 820 310" role="img" '
        'aria-labelledby="survival-title survival-desc">'
        '<title id="survival-title">Survival retention curve</title>'
        + description
        + "".join(grid)
        + before_polyline
        + f'<polyline points="{_escape(after_points)}" fill="none" '
        'stroke="#22d3ee" stroke-width="3"/>'
        '<text x="430" y="306" text-anchor="middle">Mission sol</text>'
        '</svg>'
        f'<figcaption>{legend_before}'
        f"{legend_after}</figcaption>"
        "</figure>"
    )


def _curve_fallback(before: Optional[Dict], after: Dict) -> str:
    before_by_sol = {
        int(point["sol"]): point
        for point in before.get("survival_curve", [])
    } if before is not None else {}
    rows = []
    for point in after["survival_curve"]:
        sol = int(point["sol"])
        if before is not None:
            before_value = (
                _percent(before_by_sol[sol]["fraction"])
                if sol in before_by_sol else "not supplied"
            )
            rows.append(
                "<tr>"
                f"<td>{_escape(sol)}</td>"
                f"<td>{_escape(before_value)}</td>"
                f"<td>{_escape(_percent(point['fraction']))}</td>"
                "</tr>"
            )
        else:
            rows.append(
                "<tr>"
                f"<td>{_escape(sol)}</td>"
                f"<td>{_escape(_percent(point['fraction']))}</td>"
                "</tr>"
            )
    headings = (
        "<thead><tr><th>Sol</th><th>Before retained</th>"
        "<th>After retained</th></tr></thead><tbody>"
        if before is not None else
        "<thead><tr><th>Sol</th><th>Retained</th></tr></thead><tbody>"
    )
    return (
        '<details><summary>Survival curve table</summary>'
        '<div class="table-scroll"><table>'
        + headings
        + "".join(rows)
        + "</tbody></table></div></details>"
    )


def _cause_chart(before: Optional[Dict], after: Dict) -> str:
    before_causes = (
        before.get("cause_distribution", {})
        if before is not None else {}
    )
    after_causes = after.get("cause_distribution", {})
    causes = sorted(set(before_causes) | set(after_causes))
    max_count = max(
        [1]
        + [int(value) for value in before_causes.values()]
        + [int(value) for value in after_causes.values()]
    )
    row_height = 58
    height = 42 + row_height * len(causes)
    elements = []
    rows = []
    for index, cause in enumerate(causes):
        after_count = int(after_causes.get(cause, 0))
        y = 30 + index * row_height
        after_width = after_count / max_count * 520
        if before is not None:
            before_count = int(before_causes.get(cause, 0))
            before_width = before_count / max_count * 520
            elements.extend([
                f'<text x="170" y="{y + 18}" text-anchor="end">'
                f"{_escape(cause)}</text>",
                f'<rect x="180" y="{y}" width="{before_width:.2f}" '
                'height="16" rx="3" fill="#f97316"><title>'
                f"{_escape(f'Before {cause}: {before_count}')}"
                "</title></rect>",
                f'<rect x="180" y="{y + 21}" width="{after_width:.2f}" '
                'height="16" rx="3" fill="#22d3ee"><title>'
                f"{_escape(f'After {cause}: {after_count}')}"
                "</title></rect>",
            ])
            rows.append(
                "<tr>"
                f"<td>{_escape(cause)}</td>"
                f"<td>{_escape(before_count)}</td>"
                f"<td>{_escape(after_count)}</td>"
                "</tr>"
            )
        else:
            elements.extend([
                f'<text x="170" y="{y + 18}" text-anchor="end">'
                f"{_escape(cause)}</text>",
                f'<rect x="180" y="{y}" width="{after_width:.2f}" '
                'height="16" rx="3" fill="#22d3ee"><title>'
                f"{_escape(f'{cause}: {after_count}')}"
                "</title></rect>",
            ])
            rows.append(
                "<tr>"
                f"<td>{_escape(cause)}</td>"
                f"<td>{_escape(after_count)}</td>"
                "</tr>"
            )
    description = (
        '<desc id="cause-desc">Paired horizontal bars compare counts before '
        'and after. Orange is before and cyan is after.</desc>'
        if before is not None else
        '<desc id="cause-desc">Horizontal bars show cohort terminal counts. '
        'Cyan is the cohort.</desc>'
    )
    headings = (
        '<th>Before</th><th>After</th>'
        if before is not None else
        '<th>Count</th>'
    )
    return (
        '<figure class="chart">'
        f'<svg viewBox="0 0 760 {_escape(height)}" role="img" '
        'aria-labelledby="cause-title cause-desc">'
        '<title id="cause-title">Terminal cause distribution</title>'
        + description
        + "".join(elements)
        + "</svg></figure>"
        '<div class="table-scroll"><table><thead><tr><th>Cause</th>'
        + headings
        + '</tr></thead><tbody>'
        + "".join(rows)
        + "</tbody></table></div>"
    )


def _heat_class(rate: float) -> str:
    level = max(0, min(4, int(rate * 5)))
    return f"heat-{level}"


def _archetype_table(before: Optional[Dict], after: Dict) -> str:
    before_data = before.get("by_archetype", {}) if before else {}
    after_data = after.get("by_archetype", {})
    rows = []
    for archetype, current in after_data.items():
        after_rate = float(current["survival_rate"])
        if before is not None:
            prior = before_data.get(archetype, {})
            before_rate = float(prior.get(
                "survival_rate",
                prior.get("alive", 0) / max(1, prior.get("runs", 1)),
            ))
            rows.append(
                "<tr>"
                f"<th scope=\"row\">{_escape(archetype)}</th>"
                f"<td class=\"{_escape(_heat_class(before_rate))}\">"
                f"{_escape(_percent(before_rate))}</td>"
                f"<td class=\"{_escape(_heat_class(after_rate))}\">"
                f"{_escape(_percent(after_rate))}</td>"
                f"<td>{_escape(prior.get('rmst_sols', prior.get('mean_terminal_sol', '—')))}</td>"
                f"<td>{_escape(current['rmst_sols'])}</td>"
                f"<td>{_escape(current['min_terminal_sol'])}–"
                f"{_escape(current['max_terminal_sol'])}</td>"
                "</tr>"
            )
        else:
            rows.append(
                "<tr>"
                f"<th scope=\"row\">{_escape(archetype)}</th>"
                f"<td class=\"{_escape(_heat_class(after_rate))}\">"
                f"{_escape(_percent(after_rate))}</td>"
                f"<td>{_escape(current['rmst_sols'])}</td>"
                f"<td>{_escape(current['min_terminal_sol'])}–"
                f"{_escape(current['max_terminal_sol'])}</td>"
                "</tr>"
            )
    headings = (
        "<thead><tr><th>Archetype</th><th>Before alive</th>"
        "<th>After alive</th><th>Before RMST</th><th>After RMST</th>"
        "<th>After range</th></tr></thead><tbody>"
        if before is not None else
        "<thead><tr><th>Archetype</th><th>Alive</th>"
        "<th>RMST</th><th>Range</th></tr></thead><tbody>"
    )
    return (
        '<div class="table-scroll"><table class="heatmap">'
        + headings
        + "".join(rows)
        + "</tbody></table></div>"
    )


def _paths_table(label: str, paths: Sequence[Dict]) -> str:
    rows = []
    for rank, path in enumerate(paths[:10], 1):
        rows.append(
            "<tr>"
            f"<td>{_escape(rank)}</td>"
            f"<td>{_escape(path['path'])}</td>"
            f"<td>{_escape(path['count'])}</td>"
            f"<td>{_escape(_percent(path['fraction']))}</td>"
            f"<td>{_escape(path['evidence'])}</td>"
            "</tr>"
        )
    return (
        f"<h3>{_escape(label)}</h3>"
        '<div class="table-scroll"><table><thead><tr><th>Rank</th>'
        "<th>Observed path</th><th>Runs</th><th>Share</th>"
        "<th>Evidence label</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table></div>"
    )


def _dossiers(after: Dict) -> str:
    cards = []
    for run in after.get("representative_runs", []):
        milestone_rows = []
        for milestone in run.get("milestones", []):
            details = json.dumps(
                milestone.get("details", {}),
                sort_keys=True,
                separators=(",", ":"),
            )
            milestone_rows.append(
                "<tr>"
                f"<td>{_escape(milestone.get('sol', ''))}</td>"
                f"<td>{_escape(milestone.get('kind', ''))}</td>"
                f"<td>{_escape(milestone.get('label', ''))}</td>"
                f"<td><code>{_escape(details)}</code></td>"
                "</tr>"
            )
        status = "alive" if run["alive"] else run["terminal_cause"]
        cards.append(
            '<article class="dossier">'
            f"<h3>{_escape(run['archetype'])} · seed {_escape(run['seed'])}</h3>"
            f"<p><strong>{_escape(status)}</strong> at sol "
            f"{_escape(run['terminal_sol'])}</p>"
            f"<p class=\"path\">{_escape(run['observed_path'])}</p>"
            "<details><summary>Direct milestone evidence</summary>"
            '<div class="table-scroll"><table><thead><tr><th>Sol</th>'
            "<th>Kind</th><th>Observation</th><th>Details</th></tr></thead>"
            "<tbody>"
            + "".join(milestone_rows)
            + "</tbody></table></div></details></article>"
        )
    return "".join(cards)


def _provenance(before: Optional[Dict], after: Dict) -> str:
    rows = []
    if before is not None:
        provenance = before.get("provenance", {})
        established = provenance.get("established_reference", {})
        rows.extend([
            ("Before cohort", provenance.get("label", "not supplied")),
            ("Before outcomes", provenance.get("outcomes", "not supplied")),
            (
                "Established reference",
                established.get("source", "not supplied"),
            ),
        ])
    after_provenance = after.get("provenance", {})
    rows.extend([
        (
            "After model" if before is not None else "Cohort model",
            after_provenance.get("model", "not supplied"),
        ),
        (
            "Deterministic",
            after_provenance.get("deterministic", "not supplied"),
        ),
        (
            "Seeds",
            len(after.get("configuration", {}).get("seeds", [])),
        ),
        (
            "Archetypes",
            len(after.get("configuration", {}).get("archetypes", [])),
        ),
        (
            "Horizon",
            f"{after.get('configuration', {}).get('max_sols', '—')} sols",
        ),
    ])
    return (
        "<table><tbody>"
        + "".join(
            f"<tr><th scope=\"row\">{_escape(label)}</th>"
            f"<td>{_escape(value)}</td></tr>"
            for label, value in rows
        )
        + "</tbody></table>"
    )


CSS = """
:root{color-scheme:dark;--bg:#071018;--panel:#101c28;--line:#26384a;
--text:#dbeafe;--muted:#91a4b8;--cyan:#22d3ee;--orange:#f97316}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);
font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1180px;margin:auto;padding:24px}h1{font-size:clamp(2rem,6vw,4rem);
line-height:1;margin:.25em 0}h2{margin-top:2.2rem;border-bottom:1px solid var(--line);
padding-bottom:.35rem}h3{color:#bae6fd}.eyebrow,.note,.before{color:var(--muted)}
.notice{border-left:4px solid var(--orange);padding:12px 16px;background:#1e1820}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
gap:12px;margin:24px 0}.metric,.panel,.dossier{background:var(--panel);
border:1px solid var(--line);border-radius:10px;padding:16px}.metric strong{
display:block;font-size:1.8rem;color:var(--cyan)}.metric-label{display:block;
font-size:.75rem;text-transform:uppercase;letter-spacing:.08em}.before{display:block}
.chart{margin:0;background:#0b1621;border-radius:8px;padding:8px}.chart svg{
width:100%;height:auto;display:block}.chart text{fill:var(--muted);font-size:12px}
figcaption{display:flex;gap:18px;justify-content:center}.swatch{display:inline-block;
width:18px;height:3px;vertical-align:middle;margin-right:6px}.before-line{
background:var(--orange)}.after-line{background:var(--cyan)}
.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;
margin:8px 0}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);
vertical-align:top}thead th{color:#7dd3fc;font-size:.78rem;text-transform:uppercase}
code{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.78rem}.heat-0{background:#3f1d28}
.heat-1{background:#563424}.heat-2{background:#4d4a24}.heat-3{background:#225344}
.heat-4{background:#12664f}.path{color:#c4b5fd}.dossier{margin:12px 0}
details{margin:10px 0}summary{cursor:pointer;color:#7dd3fc}
@media print{body{background:white;color:#111}.metric,.panel,.dossier{break-inside:avoid}}
"""


def generate_mission_readiness_report(payload: Dict) -> str:
    """Render comparison or single-cohort mission-readiness output."""
    if payload.get("mode") == "mission_readiness_comparison":
        before = payload["baseline"]
        after = payload["after"]
        title = payload.get("title", "Extinction Cascade Observatory")
    else:
        before = None
        after = payload
        title = "Extinction Cascade Observatory"

    before_summary = before["summary"] if before else None
    after_summary = after["summary"]
    before_alive = (
        f"{before_summary['alive']}/{before_summary['runs']}"
        if before_summary else None
    )
    metrics = "".join([
        _metric_card(
            "Alive at horizon",
            before_alive,
            f"{after_summary['alive']}/{after_summary['runs']}",
        ),
        _metric_card(
            "Survival rate",
            _percent(before_summary["survival_rate"])
            if before_summary else None,
            _percent(after_summary["survival_rate"]),
        ),
        _metric_card(
            "RMST",
            f"{before_summary['rmst_sols']} sols"
            if before_summary else None,
            f"{after_summary['rmst_sols']} sols",
        ),
        _metric_card(
            "Median terminal sol",
            before_summary["p50_terminal_sol"]
            if before_summary else None,
            after_summary["p50_terminal_sol"],
        ),
    ])

    before_paths = before.get("cascade_paths", []) if before else []
    target = after.get("acceptance", {})
    target_text = (
        f"Survival band met: {target.get('survival_rate_in_band', 'not evaluated')}; "
        f"RMST band met: {target.get('rmst_in_band', 'not evaluated')}."
    )
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{_escape(title)}</title><style>{CSS}</style></head><body><main>"
        '<p class="eyebrow">Mars colony mission-readiness exercise</p>'
        f"<h1>{_escape(title)}</h1>"
        '<p class="notice"><strong>Evidence boundary:</strong> milestones are '
        "direct simulator state observations. Ranked chains are observed "
        "temporal associations; they do not establish scientific causation.</p>"
        f'<section class="metrics" aria-label="Headline metrics">{metrics}</section>'
        f'<p class="note">{_escape(target_text)}</p>'
        "<h2>Survival retention</h2>"
        f'<div class="panel">{_survival_chart(before, after)}'
        f"{_curve_fallback(before, after)}</div>"
        "<h2>Terminal cause distribution</h2>"
        f'<div class="panel">{_cause_chart(before, after)}</div>'
        "<h2>Archetype readiness heatmap</h2>"
        f'<div class="panel">{_archetype_table(before, after)}</div>'
        "<h2>Ranked observed cascade paths</h2>"
        f'<div class="panel">{_paths_table("Before", before_paths) if before else ""}'
        f'{_paths_table("After" if before else "Cohort", after.get("cascade_paths", []))}</div>'
        "<h2>Representative run dossiers</h2>"
        f"{_dossiers(after)}"
        "<h2>Cohort provenance</h2>"
        f'<div class="panel">{_provenance(before, after)}</div>'
        '<footer><p class="note">Self-contained report · no external assets · '
        "deterministic cohort output contains no wall-clock timestamp.</p></footer>"
        "</main></body></html>"
    )
