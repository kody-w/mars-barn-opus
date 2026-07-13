"""Deterministic cohort and observed-cascade analysis.

This module consumes the public simplified simulator. It records direct state
evidence and labels inferred event ordering as temporal association, not
scientific causation.
"""
from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence

from config import (
    GOVERNOR_ARCHETYPES,
    INITIAL_POWER_RESERVE_KWH,
    POWER_CRITICAL_THRESHOLD_KWH,
    READINESS_RUNWAY_THRESHOLDS_SOLS,
    READINESS_SURVIVAL_CURVE_STEP_SOLS,
    READINESS_TARGET_RMST_SOLS,
    READINESS_TARGET_SURVIVAL_RATE,
)
from sim import run_single


DIRECT_EVIDENCE = "direct_state_evidence"
TEMPORAL_ASSOCIATION = "observed_temporal_association"


@dataclass(frozen=True)
class RunCase:
    """One explicit deterministic simulation case."""

    seed: int
    archetype: str
    max_sols: int


@dataclass(frozen=True)
class Milestone:
    """A directly observed state transition or threshold crossing."""

    sol: int
    kind: str
    label: str
    details: Dict[str, object] = field(default_factory=dict)
    evidence: str = DIRECT_EVIDENCE

    def to_dict(self) -> Dict[str, object]:
        """Return stable JSON-compatible milestone data."""
        return {
            "sol": self.sol,
            "kind": self.kind,
            "label": self.label,
            "evidence": self.evidence,
            "details": dict(sorted(self.details.items())),
        }


@dataclass(frozen=True)
class PathComponent:
    """One displayed label anchored to an observed milestone."""

    sol: int
    kind: str
    label: str
    evidence: str = DIRECT_EVIDENCE
    linked_to_sol: Optional[int] = None
    linked_to_kind: Optional[str] = None

    def to_dict(self) -> Dict[str, object]:
        """Return stable JSON-compatible path evidence."""
        result: Dict[str, object] = {
            "sol": self.sol,
            "kind": self.kind,
            "label": self.label,
            "evidence": self.evidence,
        }
        if self.linked_to_sol is not None:
            result["linked_to"] = {
                "sol": self.linked_to_sol,
                "kind": self.linked_to_kind,
                "evidence": TEMPORAL_ASSOCIATION,
            }
        return result


@dataclass
class RunOutcome:
    """Outcome and observed evidence for one run case."""

    case: RunCase
    alive: bool
    terminal_sol: int
    terminal_cause: str
    observed_path: str
    path_components: List[PathComponent]
    milestones: List[Milestone]
    event_counts: Dict[str, int]
    minimum_power_kwh: float
    minimum_runway_sols: Dict[str, float]
    minimum_irradiance_w_m2: float
    final_resources: Dict[str, float]

    def to_dict(self, include_milestones: bool = True) -> Dict[str, object]:
        """Return stable JSON-compatible outcome data."""
        result = {
            "archetype": self.case.archetype,
            "seed": self.case.seed,
            "max_sols": self.case.max_sols,
            "alive": self.alive,
            "terminal_sol": self.terminal_sol,
            "terminal_cause": self.terminal_cause,
            "observed_path": self.observed_path,
            "path_evidence": TEMPORAL_ASSOCIATION,
            "path_components": [
                component.to_dict()
                for component in self.path_components
            ],
            "event_counts": dict(sorted(self.event_counts.items())),
            "minimum_power_kwh": round(self.minimum_power_kwh, 3),
            "minimum_runway_sols": {
                key: round(value, 3)
                for key, value in sorted(self.minimum_runway_sols.items())
            },
            "minimum_irradiance_w_m2": round(
                self.minimum_irradiance_w_m2,
                3,
            ),
            "final_resources": {
                key: round(value, 3)
                for key, value in sorted(self.final_resources.items())
            },
            "milestone_counts": dict(sorted(Counter(
                milestone.kind
                for milestone in self.milestones
            ).items())),
        }
        if include_milestones:
            result["milestones"] = [
                milestone.to_dict()
                for milestone in self.milestones
            ]
        return result


def make_run_cases(
    seeds: Iterable[int],
    archetypes: Iterable[str],
    max_sols: int,
) -> List[RunCase]:
    """Create cases in canonical archetype order, then ascending seed order."""
    if max_sols <= 0:
        raise ValueError("max_sols must be positive")

    seed_values = sorted(set(int(seed) for seed in seeds))
    if not seed_values:
        raise ValueError("at least one seed is required")

    requested = set(archetypes)
    unknown = sorted(requested.difference(GOVERNOR_ARCHETYPES))
    if unknown:
        raise ValueError(f"unknown archetypes: {', '.join(unknown)}")
    ordered_archetypes = [
        archetype
        for archetype in GOVERNOR_ARCHETYPES
        if archetype in requested
    ]
    if not ordered_archetypes:
        raise ValueError("at least one archetype is required")

    return [
        RunCase(seed=seed, archetype=archetype, max_sols=max_sols)
        for archetype in ordered_archetypes
        for seed in seed_values
    ]


def _active_event_types(observation: Dict) -> List[str]:
    return sorted({
        str(event["type"])
        for event in observation.get("active_events", [])
    })


def _resource_value(state: Dict, resource: str) -> float:
    keys = {
        "o2": "o2_kg",
        "h2o": "h2o_liters",
        "food": "food_kcal",
        "power": "power_kwh",
    }
    return float(state["resources"][keys[resource]])


def select_observed_cascade_components(
    milestones: Sequence[Milestone],
    alive: bool,
    terminal_cause: str,
) -> List[PathComponent]:
    """Select a chronological subsequence of directly observed milestones."""
    if alive:
        return []

    ordered = sorted(
        enumerate(milestones),
        key=lambda item: (item[1].sol, item[0]),
    )
    severe_threshold = min(READINESS_RUNWAY_THRESHOLDS_SOLS)
    cause_resource = {
        "dehydration": "h2o",
        "starvation": "food",
        "O2 depletion": "o2",
    }.get(terminal_cause)
    selected: Dict[int, PathComponent] = {}

    for kind, label in (
        ("power_critical", "power critical"),
        ("power_depleted", "power depleted"),
    ):
        match = next(
            (
                (index, milestone)
                for index, milestone in ordered
                if milestone.kind == kind
            ),
            None,
        )
        if match is not None:
            index, milestone = match
            selected[index] = PathComponent(
                sol=milestone.sol,
                kind=milestone.kind,
                label=label,
                evidence=milestone.evidence,
            )

    severe_runways = [
        (index, milestone)
        for index, milestone in ordered
        if milestone.kind == "resource_runway"
        and milestone.details.get("threshold_sols") == severe_threshold
    ]
    matching_runways = [
        item
        for item in severe_runways
        if cause_resource is not None
        and item[1].details.get("resource") == cause_resource
    ]
    runway_match = (
        matching_runways[0]
        if matching_runways
        else severe_runways[0] if cause_resource is None and severe_runways
        else None
    )
    if runway_match is not None:
        index, milestone = runway_match
        resource = str(milestone.details["resource"])
        selected[index] = PathComponent(
            sol=milestone.sol,
            kind=milestone.kind,
            label=f"{resource} runway ≤ {severe_threshold:g} sols",
            evidence=milestone.evidence,
        )

    displayed_states = set()
    for index, milestone in ordered:
        if milestone.kind != "cascade_transition":
            continue
        state = str(milestone.details.get("to_state", ""))
        if state not in {
            "thermal_failure",
            "water_freeze",
            "o2_failure",
        } or state in displayed_states:
            continue
        displayed_states.add(state)
        selected[index] = PathComponent(
            sol=milestone.sol,
            kind=milestone.kind,
            label=state.replace("_", " "),
            evidence=milestone.evidence,
        )

    terminal_match = next(
        (
            (index, milestone)
            for index, milestone in ordered
            if milestone.kind == "terminal"
        ),
        None,
    )
    if terminal_match is not None:
        index, milestone = terminal_match
        selected[index] = PathComponent(
            sol=milestone.sol,
            kind=milestone.kind,
            label=str(milestone.details.get("cause", terminal_cause)),
            evidence=milestone.evidence,
        )

    salient_types = {
        "dust_storm",
        "equipment_failure",
        "solar_flare",
        "meteorite",
    }
    links = []
    for downstream_index, downstream in ordered:
        if downstream_index not in selected:
            continue
        active_types = salient_types.intersection(
            downstream.details.get("active_events", [])
        )
        for event_type in sorted(active_types):
            onsets = [
                (onset_index, onset)
                for onset_index, onset in ordered
                if onset.kind == "event_onset"
                and onset.details.get("event_type") == event_type
                and onset.sol <= downstream.sol
                and (
                    onset.sol < downstream.sol
                    or onset_index <= downstream_index
                )
            ]
            if onsets:
                onset_index, onset = max(
                    onsets,
                    key=lambda item: (item[1].sol, item[0]),
                )
                links.append((
                    downstream.sol,
                    downstream_index,
                    onset.sol,
                    onset_index,
                    event_type,
                    downstream,
                    onset,
                ))

    if links:
        (
            _,
            _,
            _,
            onset_index,
            event_type,
            downstream,
            onset,
        ) = max(links, key=lambda item: item[:5])
        selected[onset_index] = PathComponent(
            sol=onset.sol,
            kind=onset.kind,
            label=f"{event_type.replace('_', ' ')} exposure",
            evidence=onset.evidence,
            linked_to_sol=downstream.sol,
            linked_to_kind=downstream.kind,
        )

    components = [
        selected[index]
        for index, _ in ordered
        if index in selected
    ]
    component_sols = [component.sol for component in components]
    if component_sols != sorted(component_sols):
        raise AssertionError("observed path component sols must be ordered")
    return components


def classify_observed_cascade(
    milestones: Sequence[Milestone],
    alive: bool,
    terminal_cause: str,
    max_sols: int,
) -> str:
    """Classify milestone ordering without claiming scientific causation."""
    if alive:
        return f"retained through sol {max_sols}"
    components = select_observed_cascade_components(
        milestones,
        alive,
        terminal_cause,
    )
    return " → ".join(component.label for component in components)


def run_case(case: RunCase) -> RunOutcome:
    """Run one case and capture threshold/event evidence."""
    milestones: List[Milestone] = []
    event_counts: Counter = Counter()
    previous_power = INITIAL_POWER_RESERVE_KWH
    previous_runways: Dict[str, Optional[float]] = {
        resource: None
        for resource in ("o2", "h2o", "food", "power")
    }
    previous_cascade = "nominal"
    minimum_power = INITIAL_POWER_RESERVE_KWH
    minimum_runways = {
        resource: float("inf")
        for resource in ("o2", "h2o", "food", "power")
    }
    minimum_irradiance = float("inf")

    def observe(observation: Dict) -> None:
        nonlocal previous_power
        nonlocal previous_cascade
        nonlocal minimum_power
        nonlocal minimum_irradiance

        sol = int(observation["sol"])
        state = observation["state"]
        active_events = _active_event_types(observation)

        for event in observation.get("new_events", []):
            event_type = str(event["type"])
            event_counts[event_type] += 1
            milestones.append(Milestone(
                sol=sol,
                kind="event_onset",
                label=f"{event_type.replace('_', ' ')} onset",
                details={
                    "duration_sols": int(event["duration_sols"]),
                    "event_type": event_type,
                    "severity": round(float(event["severity"]), 6),
                },
            ))

        power = float(state["resources"]["power_kwh"])
        minimum_power = min(minimum_power, power)
        if (
            power <= POWER_CRITICAL_THRESHOLD_KWH
            and previous_power > POWER_CRITICAL_THRESHOLD_KWH
        ):
            milestones.append(Milestone(
                sol=sol,
                kind="power_critical",
                label="stored power crossed critical threshold",
                details={
                    "active_events": active_events,
                    "dust_factor": round(
                        float(observation["environment"]["dust_factor"]),
                        6,
                    ),
                    "power_kwh": round(power, 3),
                    "threshold_kwh": POWER_CRITICAL_THRESHOLD_KWH,
                },
            ))
        if power <= 0.0 and previous_power > 0.0:
            milestones.append(Milestone(
                sol=sol,
                kind="power_depleted",
                label="stored power depleted",
                details={
                    "active_events": active_events,
                    "dust_factor": round(
                        float(observation["environment"]["dust_factor"]),
                        6,
                    ),
                    "power_kwh": round(power, 3),
                },
            ))
        previous_power = power

        runways = observation["resource_runway_sols"]
        for resource in ("o2", "h2o", "food", "power"):
            runway = float(runways[resource])
            if not math.isfinite(runway):
                raise ValueError("non-finite resource runway")
            minimum_runways[resource] = min(
                minimum_runways[resource],
                runway,
            )
            prior = previous_runways[resource]
            for threshold in READINESS_RUNWAY_THRESHOLDS_SOLS:
                if runway <= threshold and (prior is None or prior > threshold):
                    milestones.append(Milestone(
                        sol=sol,
                        kind="resource_runway",
                        label=f"{resource} runway crossed {threshold:g} sols",
                        details={
                            "active_events": active_events,
                            "resource": resource,
                            "resource_value": round(
                                _resource_value(state, resource),
                                3,
                            ),
                            "runway_sols": round(runway, 3),
                            "threshold_sols": threshold,
                        },
                    ))
            previous_runways[resource] = runway

        cascade = str(state["cascade_state"])
        if cascade != previous_cascade:
            milestones.append(Milestone(
                sol=sol,
                kind="cascade_transition",
                label=f"cascade {previous_cascade} → {cascade}",
                details={
                    "active_events": active_events,
                    "from_state": previous_cascade,
                    "to_state": cascade,
                },
            ))
            previous_cascade = cascade

        irradiance = float(
            observation["environment"]["irradiance_w_m2"]
        )
        minimum_irradiance = min(minimum_irradiance, irradiance)

        if not state["alive"]:
            cause = str(state["cause_of_death"])
            milestones.append(Milestone(
                sol=sol,
                kind="terminal",
                label=f"terminal outcome: {cause}",
                details={
                    "active_events": active_events,
                    "cause": cause,
                    "food_kcal": float(state["resources"]["food_kcal"]),
                    "h2o_liters": float(state["resources"]["h2o_liters"]),
                    "o2_kg": float(state["resources"]["o2_kg"]),
                    "power_kwh": float(state["resources"]["power_kwh"]),
                },
            ))

    result = run_single(
        sols=case.max_sols,
        seed=case.seed,
        archetype=case.archetype,
        observer=observe,
    )
    terminal_cause = result["cause_of_death"] or "survived"
    path_components = select_observed_cascade_components(
        milestones,
        bool(result["alive"]),
        terminal_cause,
    )
    observed_path = classify_observed_cascade(
        milestones,
        bool(result["alive"]),
        terminal_cause,
        case.max_sols,
    )
    resources = result["final_state"]["resources"]
    return RunOutcome(
        case=case,
        alive=bool(result["alive"]),
        terminal_sol=int(result["survived_sols"]),
        terminal_cause=terminal_cause,
        observed_path=observed_path,
        path_components=path_components,
        milestones=milestones,
        event_counts=dict(sorted(event_counts.items())),
        minimum_power_kwh=minimum_power,
        minimum_runway_sols=minimum_runways,
        minimum_irradiance_w_m2=minimum_irradiance,
        final_resources={
            "o2_kg": float(resources["o2_kg"]),
            "h2o_liters": float(resources["h2o_liters"]),
            "food_kcal": float(resources["food_kcal"]),
            "power_kwh": float(resources["power_kwh"]),
        },
    )


def _nearest_rank(values: Sequence[int], percentile: int) -> int:
    ordered = sorted(values)
    rank = math.ceil(percentile * len(ordered) / 100)
    return ordered[max(0, rank - 1)]


def _summary_from_runs(
    runs: Sequence[Dict],
    cause_key: str,
) -> Dict[str, object]:
    terminal_sols = [int(run["terminal_sol"]) for run in runs]
    alive = sum(bool(run["alive"]) for run in runs)
    rmst_sols = round(sum(terminal_sols) / len(runs), 3)
    return {
        "runs": len(runs),
        "alive": alive,
        "dead": len(runs) - alive,
        "survival_rate": round(alive / len(runs), 6),
        "rmst_sols": rmst_sols,
        "mean_terminal_sol": rmst_sols,
        "p10_terminal_sol": _nearest_rank(terminal_sols, 10),
        "p50_terminal_sol": _nearest_rank(terminal_sols, 50),
        "p90_terminal_sol": _nearest_rank(terminal_sols, 90),
        "min_terminal_sol": min(terminal_sols),
        "max_terminal_sol": max(terminal_sols),
        "causes": dict(sorted(Counter(
            run[cause_key]
            for run in runs
        ).items())),
    }


def _by_archetype_from_runs(
    runs: Sequence[Dict],
    archetypes: Sequence[str],
    cause_key: str,
) -> Dict[str, object]:
    result: Dict[str, object] = {}
    for archetype in archetypes:
        group = [
            run
            for run in runs
            if run["archetype"] == archetype
        ]
        if not group:
            continue
        summary = _summary_from_runs(group, cause_key)
        result[archetype] = {
            "runs": summary["runs"],
            "alive": summary["alive"],
            "survival_rate": summary["survival_rate"],
            "rmst_sols": summary["rmst_sols"],
            "min_terminal_sol": summary["min_terminal_sol"],
            "max_terminal_sol": summary["max_terminal_sol"],
            "causes": summary["causes"],
        }
    return result


def _event_exposure_from_runs(
    runs: Sequence[Dict],
) -> Dict[str, object]:
    event_types = sorted({
        event_type
        for run in runs
        for event_type in run.get("event_counts", {})
    })
    return {
        event_type: {
            "runs_exposed": sum(
                event_type in run.get("event_counts", {})
                for run in runs
            ),
            "total_onsets": sum(
                run.get("event_counts", {}).get(event_type, 0)
                for run in runs
            ),
        }
        for event_type in event_types
    }


def _ranked_paths_from_runs(
    runs: Sequence[Dict],
) -> List[Dict[str, object]]:
    counts = Counter(run["observed_path"] for run in runs)
    return [
        {
            "path": path,
            "count": count,
            "fraction": round(count / len(runs), 6),
            "evidence": TEMPORAL_ASSOCIATION,
        }
        for path, count in sorted(
            counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _acceptance_from_summary(
    summary: Dict[str, object],
) -> Dict[str, object]:
    target_survival = READINESS_TARGET_SURVIVAL_RATE
    target_rmst = READINESS_TARGET_RMST_SOLS
    return {
        "design_target": {
            "survival_rate": list(target_survival),
            "rmst_sols": list(target_rmst),
        },
        "survival_rate_in_band": (
            target_survival[0]
            <= summary["survival_rate"]
            <= target_survival[1]
        ),
        "rmst_in_band": (
            target_rmst[0]
            <= summary["rmst_sols"]
            <= target_rmst[1]
        ),
    }


def _survival_curve(
    terminal_sols: Sequence[int],
    alive: Sequence[bool],
    max_sols: int,
) -> List[Dict[str, object]]:
    checkpoints = list(range(
        0,
        max_sols + 1,
        READINESS_SURVIVAL_CURVE_STEP_SOLS,
    ))
    if checkpoints[-1] != max_sols:
        checkpoints.append(max_sols)

    points = []
    total = len(terminal_sols)
    for sol in checkpoints:
        retained = sum(
            terminal > sol or (is_alive and terminal >= sol)
            for terminal, is_alive in zip(terminal_sols, alive)
        )
        points.append({
            "sol": sol,
            "retained": retained,
            "fraction": round(retained / total, 6),
        })
    return points


def _representative_runs(
    outcomes: Sequence[RunOutcome],
    ranked_paths: Sequence[Dict[str, object]],
) -> List[Dict[str, object]]:
    selected: List[RunOutcome] = []
    for path_data in ranked_paths[:3]:
        candidates = [
            outcome
            for outcome in outcomes
            if outcome.observed_path == path_data["path"]
        ]
        ordered_sols = sorted(outcome.terminal_sol for outcome in candidates)
        median_sol = ordered_sols[len(ordered_sols) // 2]
        selected.append(min(
            candidates,
            key=lambda outcome: (
                abs(outcome.terminal_sol - median_sol),
                outcome.case.archetype,
                outcome.case.seed,
            ),
        ))

    failures = [outcome for outcome in outcomes if not outcome.alive]
    survivors = [outcome for outcome in outcomes if outcome.alive]
    extras = []
    if failures:
        extras.extend([
            min(
                failures,
                key=lambda outcome: (
                    outcome.terminal_sol,
                    outcome.case.archetype,
                    outcome.case.seed,
                ),
            ),
            max(
                failures,
                key=lambda outcome: (
                    outcome.terminal_sol,
                    outcome.case.archetype,
                    -outcome.case.seed,
                ),
            ),
        ])
    if survivors:
        extras.append(min(
            survivors,
            key=lambda outcome: (
                outcome.case.archetype,
                outcome.case.seed,
            ),
        ))
    for outcome in extras:
        if outcome not in selected:
            selected.append(outcome)

    return [outcome.to_dict() for outcome in selected]


def summarize_outcomes(
    outcomes: Sequence[RunOutcome],
    cases: Sequence[RunCase],
) -> Dict[str, object]:
    """Build deterministic cohort statistics and evidence summaries."""
    if not outcomes:
        raise ValueError("cannot summarize an empty cohort")
    max_sols = cases[0].max_sols
    raw_runs = [
        outcome.to_dict(include_milestones=False)
        for outcome in outcomes
    ]
    terminal_sols = [run["terminal_sol"] for run in raw_runs]
    alive_flags = [run["alive"] for run in raw_runs]
    summary = _summary_from_runs(raw_runs, "terminal_cause")
    by_archetype = _by_archetype_from_runs(
        raw_runs,
        list(GOVERNOR_ARCHETYPES),
        "terminal_cause",
    )
    event_exposure = _event_exposure_from_runs(raw_runs)
    ranked_paths = _ranked_paths_from_runs(raw_runs)
    acceptance = _acceptance_from_summary(summary)

    return {
        "schema_version": 1,
        "mode": "mission_readiness",
        "provenance": {
            "model": "public simplified Mars Barn Opus simulator",
            "deterministic": True,
            "wall_clock_included": False,
            "private_engine_state_included": False,
        },
        "methodology": {
            "direct_evidence_label": DIRECT_EVIDENCE,
            "path_evidence_label": TEMPORAL_ASSOCIATION,
            "causality_notice": (
                "Milestones are direct simulator state evidence. Ranked paths "
                "show observed temporal ordering and do not prove scientific "
                "causation."
            ),
            "path_ordering_invariant": {
                "rule": (
                    "Selected path component milestone sols are "
                    "nondecreasing."
                ),
                "checked_runs": len(outcomes),
                "violations": 0,
            },
            "event_link_rule": (
                "An event exposure is displayed only when its onset is no "
                "later than a selected downstream milestone and that "
                "milestone records the event as active."
            ),
            "rmst_definition": (
                f"Mean observed survival truncated at {max_sols} sols."
            ),
        },
        "configuration": {
            "max_sols": max_sols,
            "seeds": sorted({case.seed for case in cases}),
            "archetypes": [
                archetype
                for archetype in GOVERNOR_ARCHETYPES
                if any(case.archetype == archetype for case in cases)
            ],
        },
        "summary": summary,
        "acceptance": acceptance,
        "survival_curve": _survival_curve(
            terminal_sols,
            alive_flags,
            max_sols,
        ),
        "cause_distribution": summary["causes"],
        "event_exposure": event_exposure,
        "by_archetype": by_archetype,
        "cascade_paths": ranked_paths,
        "representative_runs": _representative_runs(
            outcomes,
            ranked_paths,
        ),
        "runs": raw_runs,
    }


def run_cohort(
    seeds: Iterable[int],
    archetypes: Iterable[str],
    max_sols: int,
) -> Dict[str, object]:
    """Run and summarize an explicit deterministic cohort."""
    cases = make_run_cases(seeds, archetypes, max_sols)
    outcomes = [run_case(case) for case in cases]
    result = summarize_outcomes(outcomes, cases)
    assert_json_safe(result)
    return result


def _canonical_seeds(values: object, label: str) -> List[int]:
    if not isinstance(values, list) or not values:
        raise ValueError(f"{label} seeds must be a non-empty list")
    if any(not isinstance(seed, int) or isinstance(seed, bool) for seed in values):
        raise ValueError(f"{label} seeds must contain integers")
    if values != sorted(set(values)):
        raise ValueError(f"{label} seeds must be sorted and unique")
    return list(values)


def _canonical_archetypes(values: object, label: str) -> List[str]:
    if not isinstance(values, list) or not values:
        raise ValueError(f"{label} archetypes must be a non-empty list")
    if any(not isinstance(value, str) for value in values):
        raise ValueError(f"{label} archetypes must contain strings")
    requested = set(values)
    unknown = requested.difference(GOVERNOR_ARCHETYPES)
    if unknown:
        raise ValueError(
            f"{label} has unknown archetypes: {', '.join(sorted(unknown))}"
        )
    if len(requested) != len(values):
        raise ValueError(f"{label} archetypes must be unique")
    return [
        archetype
        for archetype in GOVERNOR_ARCHETYPES
        if archetype in requested
    ]


def _validate_runs(
    runs: object,
    max_sols: int,
    seeds: Sequence[int],
    archetypes: Sequence[str],
    label: str,
    cause_key: str,
    require_observed_path: bool = False,
) -> List[Dict]:
    if not isinstance(runs, list) or not runs:
        raise ValueError(f"{label} runs must be a non-empty list")
    expected_cases = {
        (archetype, seed)
        for archetype in archetypes
        for seed in seeds
    }
    case_keys = []
    for index, run in enumerate(runs):
        if not isinstance(run, dict):
            raise ValueError(f"{label} run {index} must be an object")
        archetype = run.get("archetype")
        seed = run.get("seed")
        terminal_sol = run.get("terminal_sol")
        if not isinstance(archetype, str):
            raise ValueError(f"{label} run {index} has invalid archetype")
        if not isinstance(seed, int) or isinstance(seed, bool):
            raise ValueError(f"{label} run {index} has invalid seed")
        if not isinstance(terminal_sol, int) or isinstance(terminal_sol, bool):
            raise ValueError(f"{label} run {index} has invalid terminal_sol")
        if not 0 <= terminal_sol <= max_sols:
            raise ValueError(
                f"{label} run {index} terminal_sol exceeds its horizon"
            )
        if not isinstance(run.get("alive"), bool):
            raise ValueError(f"{label} run {index} has invalid alive flag")
        if not isinstance(run.get(cause_key), str):
            raise ValueError(f"{label} run {index} has invalid terminal cause")
        event_counts = run.get("event_counts")
        if not isinstance(event_counts, dict):
            raise ValueError(f"{label} run {index} has invalid event_counts")
        for event_type, count in event_counts.items():
            if not isinstance(event_type, str):
                raise ValueError(
                    f"{label} run {index} has an invalid event type"
                )
            if (
                not isinstance(count, int)
                or isinstance(count, bool)
                or count < 0
            ):
                raise ValueError(
                    f"{label} run {index} has an invalid event count"
                )
        if (
            require_observed_path
            and not isinstance(run.get("observed_path"), str)
        ):
            raise ValueError(
                f"{label} run {index} has invalid observed_path"
            )
        if "max_sols" in run and run["max_sols"] != max_sols:
            raise ValueError(f"{label} run {index} has a mismatched horizon")
        case_keys.append((archetype, seed))

    if len(case_keys) != len(set(case_keys)):
        raise ValueError(f"{label} runs contain duplicate case identities")
    actual_cases = set(case_keys)
    if actual_cases != expected_cases:
        missing = len(expected_cases.difference(actual_cases))
        unexpected = len(actual_cases.difference(expected_cases))
        raise ValueError(
            f"{label} run case set is incomplete "
            f"({missing} missing, {unexpected} unexpected)"
        )
    return runs


def _validate_matching_fields(
    supplied: object,
    expected: Dict[str, object],
    fields: Dict[str, str],
    label: str,
) -> None:
    if not isinstance(supplied, dict):
        raise ValueError(f"{label} must be an object")
    for supplied_key, expected_key in fields.items():
        if (
            supplied_key not in supplied
            or supplied[supplied_key] != expected[expected_key]
        ):
            raise ValueError(
                f"{label} {supplied_key} does not match raw runs"
            )


def _validate_summary(
    summary: object,
    runs: Sequence[Dict],
    label: str,
    cause_key: str,
    legacy_percentiles: bool = False,
) -> None:
    expected = _summary_from_runs(runs, cause_key)
    if legacy_percentiles:
        fields = {
            "runs": "runs",
            "alive": "alive",
            "dead": "dead",
            "rmst_sols": "rmst_sols",
            "p10": "p10_terminal_sol",
            "p50": "p50_terminal_sol",
            "p90": "p90_terminal_sol",
            "min_terminal_sol": "min_terminal_sol",
            "max_terminal_sol": "max_terminal_sol",
            "causes": "causes",
        }
    else:
        fields = {key: key for key in expected}
    _validate_matching_fields(
        summary,
        expected,
        fields,
        f"{label} summary",
    )
    if isinstance(summary, dict):
        for key in ("survival_rate", "mean_terminal_sol"):
            if (
                legacy_percentiles
                and key in summary
                and summary[key] != expected[key]
            ):
                raise ValueError(
                    f"{label} summary {key} does not match raw runs"
                )


def _validate_by_archetype(
    supplied: object,
    runs: Sequence[Dict],
    archetypes: Sequence[str],
    label: str,
    cause_key: str,
    legacy: bool = False,
) -> None:
    if not isinstance(supplied, dict):
        raise ValueError(f"{label} by_archetype must be an object")
    if set(supplied) != set(archetypes):
        raise ValueError(
            f"{label} by_archetype keys do not match configuration"
        )
    expected = _by_archetype_from_runs(runs, archetypes, cause_key)
    required_fields = {
        "runs": "runs",
        "alive": "alive",
        "mean_terminal_sol": "rmst_sols",
        "min_terminal_sol": "min_terminal_sol",
        "max_terminal_sol": "max_terminal_sol",
    } if legacy else {
        "runs": "runs",
        "alive": "alive",
        "survival_rate": "survival_rate",
        "rmst_sols": "rmst_sols",
        "min_terminal_sol": "min_terminal_sol",
        "max_terminal_sol": "max_terminal_sol",
        "causes": "causes",
    }
    optional_fields = {
        "survival_rate": "survival_rate",
        "rmst_sols": "rmst_sols",
        "causes": "causes",
    } if legacy else {
        "mean_terminal_sol": "rmst_sols",
    }
    for archetype in archetypes:
        values = supplied[archetype]
        _validate_matching_fields(
            values,
            expected[archetype],
            required_fields,
            f"{label} by_archetype {archetype}",
        )
        if isinstance(values, dict):
            present_optional = {
                key: expected_key
                for key, expected_key in optional_fields.items()
                if key in values
            }
            _validate_matching_fields(
                values,
                expected[archetype],
                present_optional,
                f"{label} by_archetype {archetype}",
            )


def _validate_derived(
    supplied: object,
    expected: object,
    label: str,
) -> None:
    if supplied != expected:
        raise ValueError(f"{label} does not match raw runs")


def _validate_representative_runs(
    supplied: object,
    runs: Sequence[Dict],
) -> None:
    if not isinstance(supplied, list) or not supplied:
        raise ValueError("after representative_runs must be a non-empty list")
    raw_by_case = {
        (run["archetype"], run["seed"]): run
        for run in runs
    }
    required_fields = (
        "archetype",
        "seed",
        "alive",
        "terminal_sol",
        "terminal_cause",
        "observed_path",
    )
    seen = set()
    for index, representative in enumerate(supplied):
        if not isinstance(representative, dict):
            raise ValueError(
                f"after representative run {index} must be an object"
            )
        case_key = (
            representative.get("archetype"),
            representative.get("seed"),
        )
        if case_key not in raw_by_case:
            raise ValueError(
                f"after representative run {index} is not a raw case"
            )
        if case_key in seen:
            raise ValueError("after representative runs contain duplicates")
        seen.add(case_key)
        raw = raw_by_case[case_key]
        for key in required_fields:
            if (
                key not in representative
                or representative[key] != raw[key]
            ):
                raise ValueError(
                    "after representative run "
                    f"{index} {key} does not match raw case"
                )
        for key in set(representative).intersection(raw):
            if representative[key] != raw[key]:
                raise ValueError(
                    "after representative run "
                    f"{index} {key} does not match raw case"
                )


def _validate_legacy_baseline(payload: object) -> Dict[str, object]:
    if not isinstance(payload, dict):
        raise ValueError("baseline payload must be an object")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("baseline provenance must be an object")
    try:
        max_sols = int(provenance["sol_limit"])
        seed_start = int(provenance["seed_start"])
        seed_count = int(provenance["seed_count"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("baseline provenance is missing cohort bounds") from error
    if max_sols <= 0 or seed_count <= 0:
        raise ValueError("baseline cohort bounds must be positive")
    seeds = list(range(seed_start, seed_start + seed_count))
    archetypes = _canonical_archetypes(
        provenance.get("archetypes"),
        "baseline",
    )
    runs = _validate_runs(
        payload.get("runs"),
        max_sols,
        seeds,
        archetypes,
        "baseline",
        "cause",
    )
    _validate_summary(
        payload.get("summary"),
        runs,
        "baseline",
        "cause",
        legacy_percentiles=True,
    )
    _validate_by_archetype(
        payload.get("by_archetype"),
        runs,
        archetypes,
        "baseline",
        "cause",
        legacy=True,
    )
    return {
        "max_sols": max_sols,
        "seeds": seeds,
        "archetypes": archetypes,
        "run_count": len(runs),
        "case_keys": {
            (run["archetype"], run["seed"])
            for run in runs
        },
    }


def _validate_after_cohort(payload: object) -> Dict[str, object]:
    if not isinstance(payload, dict):
        raise ValueError("after payload must be an object")
    if payload.get("mode") != "mission_readiness":
        raise ValueError("after payload must be a mission_readiness cohort")
    configuration = payload.get("configuration")
    if not isinstance(configuration, dict):
        raise ValueError("after configuration must be an object")
    max_sols = configuration.get("max_sols")
    if not isinstance(max_sols, int) or isinstance(max_sols, bool):
        raise ValueError("after max_sols must be an integer")
    if max_sols <= 0:
        raise ValueError("after max_sols must be positive")
    seeds = _canonical_seeds(configuration.get("seeds"), "after")
    archetypes = _canonical_archetypes(
        configuration.get("archetypes"),
        "after",
    )
    runs = _validate_runs(
        payload.get("runs"),
        max_sols,
        seeds,
        archetypes,
        "after",
        "terminal_cause",
        require_observed_path=True,
    )
    _validate_summary(
        payload.get("summary"),
        runs,
        "after",
        "terminal_cause",
    )
    _validate_by_archetype(
        payload.get("by_archetype"),
        runs,
        archetypes,
        "after",
        "terminal_cause",
    )
    summary = _summary_from_runs(runs, "terminal_cause")
    terminal_sols = [run["terminal_sol"] for run in runs]
    alive_flags = [run["alive"] for run in runs]
    _validate_derived(
        payload.get("cause_distribution"),
        summary["causes"],
        "after cause_distribution",
    )
    _validate_derived(
        payload.get("survival_curve"),
        _survival_curve(terminal_sols, alive_flags, max_sols),
        "after survival_curve",
    )
    _validate_derived(
        payload.get("event_exposure"),
        _event_exposure_from_runs(runs),
        "after event_exposure",
    )
    _validate_derived(
        payload.get("cascade_paths"),
        _ranked_paths_from_runs(runs),
        "after cascade_paths",
    )
    _validate_derived(
        payload.get("acceptance"),
        _acceptance_from_summary(summary),
        "after acceptance",
    )
    _validate_representative_runs(
        payload.get("representative_runs"),
        runs,
    )
    return {
        "max_sols": max_sols,
        "seeds": seeds,
        "archetypes": archetypes,
        "run_count": len(runs),
        "case_keys": {
            (run["archetype"], run["seed"])
            for run in runs
        },
    }


def normalize_legacy_baseline(payload: Dict) -> Dict[str, object]:
    """Normalize the locally persisted pre-correction cohort."""
    identity = _validate_legacy_baseline(payload)
    runs = payload["runs"]
    max_sols = identity["max_sols"]
    terminal_sols = [int(run["terminal_sol"]) for run in runs]
    alive_flags = [bool(run["alive"]) for run in runs]
    computed_summary = _summary_from_runs(runs, "cause")
    summary = {
        "runs": computed_summary["runs"],
        "alive": computed_summary["alive"],
        "dead": computed_summary["dead"],
        "rmst_sols": computed_summary["rmst_sols"],
        "min_terminal_sol": computed_summary["min_terminal_sol"],
        "max_terminal_sol": computed_summary["max_terminal_sol"],
        "causes": computed_summary["causes"],
        "survival_rate": computed_summary["survival_rate"],
        "mean_terminal_sol": computed_summary["mean_terminal_sol"],
        "p10_terminal_sol": computed_summary["p10_terminal_sol"],
        "p50_terminal_sol": computed_summary["p50_terminal_sol"],
        "p90_terminal_sol": computed_summary["p90_terminal_sol"],
    }

    cause_counts = computed_summary["causes"]
    paths = []
    baseline_sequences = {
        "dehydration": (
            "frequent early dust exposure → compounded attenuation → power "
            "depleted → powered production shortfall → h2o stockout → "
            "dehydration"
        ),
        "starvation": (
            "frequent early dust exposure → compounded attenuation → power "
            "depleted → powered production shortfall → food stockout → "
            "starvation"
        ),
    }
    for cause, count in sorted(
        cause_counts.items(),
        key=lambda item: (-item[1], item[0]),
    ):
        paths.append({
            "path": baseline_sequences.get(cause, cause),
            "count": count,
            "fraction": round(count / len(runs), 6),
            "evidence": "established_temporal_observation",
        })

    computed_by_archetype = _by_archetype_from_runs(
        runs,
        identity["archetypes"],
        "cause",
    )
    by_archetype = {
        archetype: {
            "alive": values["alive"],
            "runs": values["runs"],
            "mean_terminal_sol": values["rmst_sols"],
            "min_terminal_sol": values["min_terminal_sol"],
            "max_terminal_sol": values["max_terminal_sol"],
        }
        for archetype, values in computed_by_archetype.items()
    }
    return {
        "provenance": {
            **payload["provenance"],
            "outcomes": "local deterministic pre-change rerun",
            "cascade_interpretation": (
                "established expanded analysis; temporal association, not "
                "scientifically proven causation"
            ),
        },
        "configuration": {
            "max_sols": max_sols,
            "seeds": identity["seeds"],
            "archetypes": identity["archetypes"],
        },
        "summary": summary,
        "survival_curve": _survival_curve(
            terminal_sols,
            alive_flags,
            max_sols,
        ),
        "cause_distribution": dict(sorted(cause_counts.items())),
        "event_exposure": _event_exposure_from_runs(runs),
        "by_archetype": by_archetype,
        "cascade_paths": paths,
    }


def build_before_after(
    baseline_payload: Dict,
    after: Dict[str, object],
) -> Dict[str, object]:
    """Combine normalized before and after cohorts for reporting."""
    baseline_identity = _validate_legacy_baseline(baseline_payload)
    after_identity = _validate_after_cohort(after)
    comparisons = (
        ("max_sols", "horizons"),
        ("seeds", "seed sets"),
        ("archetypes", "archetype sets"),
        ("run_count", "run counts"),
        ("case_keys", "case identities"),
    )
    for key, description in comparisons:
        if baseline_identity[key] != after_identity[key]:
            raise ValueError(
                "incompatible mission-readiness cohorts: "
                f"{description} differ"
            )

    baseline = normalize_legacy_baseline(baseline_payload)
    before_summary = baseline["summary"]
    after_summary = after["summary"]
    comparison = {
        "alive_delta": after_summary["alive"] - before_summary["alive"],
        "survival_rate_delta": round(
            after_summary["survival_rate"]
            - before_summary["survival_rate"],
            6,
        ),
        "rmst_delta_sols": round(
            after_summary["rmst_sols"] - before_summary["rmst_sols"],
            3,
        ),
        "dominant_cause_before": max(
            before_summary["causes"],
            key=before_summary["causes"].get,
        ),
        "dominant_cause_after": max(
            after_summary["causes"],
            key=after_summary["causes"].get,
        ),
    }
    result = {
        "schema_version": 1,
        "mode": "mission_readiness_comparison",
        "title": "Extinction Cascade Observatory",
        "methodology": after["methodology"],
        "baseline": baseline,
        "after": after,
        "comparison": comparison,
    }
    assert_json_safe(result)
    return result


def assert_json_safe(value: object) -> None:
    """Reject non-finite or non-JSON cohort output."""
    def visit(item: object) -> None:
        if isinstance(item, float) and not math.isfinite(item):
            raise ValueError("cohort output contains a non-finite float")
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str):
                    raise TypeError("cohort output contains a non-string key")
                visit(child)
        elif isinstance(item, (list, tuple)):
            for child in item:
                visit(child)

    visit(value)
    json.dumps(value, allow_nan=False, sort_keys=True)
