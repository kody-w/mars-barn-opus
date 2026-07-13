"""Mission-readiness cohort, cascade evidence, and report regressions."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from config import (
    GOVERNOR_ARCHETYPES,
    READINESS_RUNWAY_THRESHOLDS_SOLS,
    READINESS_TARGET_RMST_SOLS,
    READINESS_TARGET_SURVIVAL_RATE,
)
from mission_readiness import (
    DIRECT_EVIDENCE,
    Milestone,
    assert_json_safe,
    build_before_after,
    classify_observed_cascade,
    run_cohort,
    select_observed_cascade_components,
)
from readiness_report import generate_mission_readiness_report


def _legacy_from_cohort(cohort):
    configuration = cohort["configuration"]
    summary = cohort["summary"]
    runs = [
        {
            "archetype": run["archetype"],
            "seed": run["seed"],
            "alive": run["alive"],
            "terminal_sol": run["terminal_sol"],
            "cause": run["terminal_cause"],
            "event_counts": run["event_counts"],
        }
        for run in cohort["runs"]
    ]
    by_archetype = {}
    for archetype, values in cohort["by_archetype"].items():
        by_archetype[archetype] = {
            "alive": values["alive"],
            "runs": values["runs"],
            "mean_terminal_sol": values["rmst_sols"],
            "min_terminal_sol": values["min_terminal_sol"],
            "max_terminal_sol": values["max_terminal_sol"],
        }
    return {
        "provenance": {
            "label": "test baseline",
            "seed_start": configuration["seeds"][0],
            "seed_count": len(configuration["seeds"]),
            "archetypes": configuration["archetypes"],
            "sol_limit": configuration["max_sols"],
        },
        "summary": {
            "runs": summary["runs"],
            "alive": summary["alive"],
            "dead": summary["dead"],
            "rmst_sols": summary["rmst_sols"],
            "p10": summary["p10_terminal_sol"],
            "p50": summary["p50_terminal_sol"],
            "p90": summary["p90_terminal_sol"],
            "min_terminal_sol": summary["min_terminal_sol"],
            "max_terminal_sol": summary["max_terminal_sol"],
            "causes": summary["causes"],
        },
        "by_archetype": by_archetype,
        "runs": runs,
    }


def _assert_value_error(function, message):
    try:
        function()
    except ValueError as error:
        assert message in str(error)
    else:
        raise AssertionError("expected ValueError")


class TestCohortAnalysis:
    def test_full_cohort_is_deterministic_and_stably_ordered(self):
        archetypes = ["contrarian", "engineer"]
        first = run_cohort([9, 3], archetypes, 40)
        second = run_cohort([3, 9], reversed(archetypes), 40)
        assert json.dumps(first, sort_keys=True) == json.dumps(
            second,
            sort_keys=True,
        )
        assert [
            (run["archetype"], run["seed"])
            for run in first["runs"]
        ] == [
            ("engineer", 3),
            ("engineer", 9),
            ("contrarian", 3),
            ("contrarian", 9),
        ]
        assert_json_safe(first)

    def test_observed_cascade_classification_labels_association(self):
        severe = min(READINESS_RUNWAY_THRESHOLDS_SOLS)
        milestones = [
            Milestone(
                sol=20,
                kind="event_onset",
                label="dust storm onset",
                details={
                    "event_type": "dust_storm",
                    "duration_sols": 8,
                },
            ),
            Milestone(
                sol=22,
                kind="power_critical",
                label="power critical",
                details={"active_events": ["dust_storm"]},
            ),
            Milestone(
                sol=24,
                kind="resource_runway",
                label="water runway",
                details={
                    "active_events": ["dust_storm"],
                    "resource": "h2o",
                    "threshold_sols": severe,
                },
            ),
        ]
        path = classify_observed_cascade(
            milestones,
            alive=False,
            terminal_cause="dehydration",
            max_sols=500,
        )
        assert path.startswith("dust storm exposure")
        assert "h2o runway" in path
        assert milestones[0].evidence == DIRECT_EVIDENCE

    def test_observed_path_never_reverses_late_dust_and_early_power(self):
        severe = min(READINESS_RUNWAY_THRESHOLDS_SOLS)
        milestones = [
            Milestone(
                sol=99,
                kind="power_critical",
                label="power critical",
                details={"active_events": []},
            ),
            Milestone(
                sol=100,
                kind="power_depleted",
                label="power depleted",
                details={"active_events": []},
            ),
            Milestone(
                sol=406,
                kind="event_onset",
                label="dust storm onset",
                details={"event_type": "dust_storm", "duration_sols": 80},
            ),
            Milestone(
                sol=474,
                kind="resource_runway",
                label="food runway",
                details={
                    "active_events": ["dust_storm"],
                    "resource": "food",
                    "threshold_sols": severe,
                },
            ),
            Milestone(
                sol=475,
                kind="terminal",
                label="terminal outcome",
                details={"active_events": [], "cause": "starvation"},
            ),
        ]
        components = select_observed_cascade_components(
            milestones,
            alive=False,
            terminal_cause="starvation",
        )
        sols = [component.sol for component in components]
        labels = [component.label for component in components]
        assert sols == sorted(sols)
        assert labels.index("power depleted") < labels.index(
            "dust storm exposure"
        )
        dust = next(
            component
            for component in components
            if component.label == "dust storm exposure"
        )
        assert dust.linked_to_sol == 474
        assert dust.linked_to_kind == "resource_runway"

    def test_fixed_seed_cohort_is_not_degenerate(self):
        result = run_cohort(
            range(10),
            GOVERNOR_ARCHETYPES.keys(),
            500,
        )
        summary = result["summary"]
        assert (
            READINESS_TARGET_SURVIVAL_RATE[0]
            <= summary["survival_rate"]
            <= READINESS_TARGET_SURVIVAL_RATE[1]
        )
        assert (
            READINESS_TARGET_RMST_SOLS[0]
            <= summary["rmst_sols"]
            <= READINESS_TARGET_RMST_SOLS[1]
        )

    def test_before_after_requires_matching_horizon(self):
        before = run_cohort([0, 1], ["engineer"], 5)
        after = run_cohort([0, 1], ["engineer"], 6)
        baseline = _legacy_from_cohort(before)
        _assert_value_error(
            lambda: build_before_after(baseline, after),
            "horizons differ",
        )

    def test_before_after_requires_matching_seeds(self):
        before = run_cohort([0, 1], ["engineer"], 5)
        after = run_cohort([1, 2], ["engineer"], 5)
        baseline = _legacy_from_cohort(before)
        _assert_value_error(
            lambda: build_before_after(baseline, after),
            "seed sets differ",
        )

    def test_before_after_rejects_mismatched_case_set(self):
        cohort = run_cohort([0, 1], ["engineer"], 5)
        baseline = _legacy_from_cohort(cohort)
        malformed = deepcopy(cohort)
        malformed["runs"][1]["seed"] = 0
        _assert_value_error(
            lambda: build_before_after(baseline, malformed),
            "duplicate case identities",
        )

    def test_before_after_accepts_identical_case_identity(self):
        cohort = run_cohort([0, 1], ["engineer"], 5)
        result = build_before_after(_legacy_from_cohort(cohort), cohort)
        assert result["comparison"]["alive_delta"] == 0

    def test_before_after_rejects_false_baseline_percentile(self):
        cohort = run_cohort([0, 1, 2], ["engineer"], 40)
        baseline = _legacy_from_cohort(cohort)
        baseline["summary"]["p50"] = 500

        _assert_value_error(
            lambda: build_before_after(baseline, cohort),
            "baseline summary p50 does not match raw runs",
        )

    def test_before_after_rejects_false_after_survival_rate(self):
        cohort = run_cohort([0, 1], ["engineer"], 40)
        malformed = deepcopy(cohort)
        malformed["summary"]["survival_rate"] = 0.999

        _assert_value_error(
            lambda: build_before_after(
                _legacy_from_cohort(cohort),
                malformed,
            ),
            "after summary survival_rate does not match raw runs",
        )

    def test_before_after_rejects_false_archetype_metric(self):
        cohort = run_cohort([0, 1], ["engineer"], 40)
        malformed = deepcopy(cohort)
        malformed["by_archetype"]["engineer"]["rmst_sols"] = 500.0

        _assert_value_error(
            lambda: build_before_after(
                _legacy_from_cohort(cohort),
                malformed,
            ),
            "after by_archetype engineer rmst_sols",
        )

    def test_before_after_rejects_false_survival_curve(self):
        cohort = run_cohort([0, 1], ["engineer"], 40)
        malformed = deepcopy(cohort)
        malformed["survival_curve"][-1]["fraction"] = 0.999

        _assert_value_error(
            lambda: build_before_after(
                _legacy_from_cohort(cohort),
                malformed,
            ),
            "after survival_curve does not match raw runs",
        )

    def test_before_after_rejects_false_representative_outcome(self):
        cohort = run_cohort([0, 1], ["engineer"], 40)
        malformed = deepcopy(cohort)
        malformed["representative_runs"][0]["terminal_sol"] = 500

        _assert_value_error(
            lambda: build_before_after(
                _legacy_from_cohort(cohort),
                malformed,
            ),
            "representative run 0 terminal_sol does not match raw case",
        )

    def test_cli_json_stdout_is_one_document(self):
        root = Path(__file__).resolve().parents[1]
        completed = subprocess.run(
            [
                sys.executable,
                "src/sim.py",
                "--mission-readiness",
                "--seed",
                "0",
                "--cohort-seeds",
                "1",
                "--cohort-archetypes",
                "engineer",
                "--sols",
                "5",
                "--json",
            ],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(completed.stdout)
        assert payload["mode"] == "mission_readiness"
        assert "Elapsed:" not in completed.stdout


class TestReadinessReport:
    def test_single_cohort_omits_baseline_values_and_presentation(self):
        report = generate_mission_readiness_report(
            run_cohort([3], ["engineer"], 40),
        )

        assert "Before" not in report
        assert '<span class="before">' not in report
        assert 'stroke="#f97316"' not in report
        assert 'fill="#f97316"' not in report
        assert "<th>Sol</th><th>Retained</th>" in report
        assert "<th>Cause</th><th>Count</th>" in report
        assert (
            "<th>Archetype</th><th>Alive</th><th>RMST</th>"
            "<th>Range</th>"
        ) in report
        assert '<i class="swatch after-line"></i>Cohort' in report

    def test_comparison_retains_before_and_after_presentation(self):
        cohort = run_cohort([3], ["engineer"], 40)
        comparison = build_before_after(_legacy_from_cohort(cohort), cohort)

        report = generate_mission_readiness_report(comparison)

        assert '<span class="before">before:' in report
        assert (
            "<th>Sol</th><th>Before retained</th>"
            "<th>After retained</th>"
        ) in report
        assert "<th>Cause</th><th>Before</th><th>After</th>" in report
        assert (
            "<th>Archetype</th><th>Before alive</th>"
            "<th>After alive</th><th>Before RMST</th>"
            "<th>After RMST</th><th>After range</th>"
        ) in report
        assert '<i class="swatch before-line"></i>Before' in report
        assert '<i class="swatch after-line"></i>After' in report

    def test_report_escapes_dynamic_content_and_is_self_contained(self):
        result = run_cohort([3], ["engineer"], 40)
        injected = '<script data-x="1">& attack</script>'
        result["cascade_paths"][0]["path"] = injected
        archetype_data = next(iter(result["by_archetype"].values()))
        result["by_archetype"] = {injected: archetype_data}
        result["representative_runs"][0]["observed_path"] = injected

        report = generate_mission_readiness_report(result)
        assert injected not in report
        assert "&lt;script data-x=&quot;1&quot;&gt;" in report
        assert "http://" not in report
        assert "https://" not in report
        assert "<svg viewBox=" in report
        assert "<title" in report
        assert "<desc" in report
        assert "Survival curve table" in report
