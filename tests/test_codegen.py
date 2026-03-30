"""Tests for AI code generation — governors that write their own programs."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from codegen import (
    analyze_trends, generate_lispy_program, should_rewrite,
    AdaptiveCodeGenGovernor,
)
from lispy import LispyVM


class TestTrendAnalysis:
    def test_stable_trends(self):
        history = [{"delta": {"o2": 0.1, "food": 0.0, "power": 0.0, "h2o": 0.1},
                    "o2_days": 25, "food_days": 20, "crew_alive": 4, "events": []}
                   for _ in range(10)]
        trends = analyze_trends(history)
        assert trends["o2"] == "stable"
        assert not trends["crisis"]

    def test_declining_o2(self):
        history = [{"delta": {"o2": -3.0, "food": 0.0, "power": 0.0, "h2o": 0.0},
                    "o2_days": 20 - i, "food_days": 25, "crew_alive": 4, "events": []}
                   for i in range(10)]
        trends = analyze_trends(history)
        assert trends["o2"] == "declining_fast"

    def test_crisis_detection(self):
        history = [{"delta": {"o2": -1.0, "food": 0.0, "power": 0.0, "h2o": 0.0},
                    "o2_days": 3, "food_days": 25, "crew_alive": 4, "events": []}
                   for _ in range(5)]
        trends = analyze_trends(history)
        assert trends["crisis"]

    def test_empty_history(self):
        trends = analyze_trends([])
        assert not trends["crisis"]


class TestCodeGeneration:
    def test_generates_valid_lispy(self):
        trends = {"o2": "stable", "food": "stable", "power": "stable",
                  "h2o": "stable", "crisis": False, "o2_days": 25,
                  "food_days": 20, "crew_alive": 4, "events_recent": 0,
                  "trend_window": 10}
        program = generate_lispy_program(trends, {})
        assert "(begin" in program
        assert "heating_alloc" in program
        assert "isru_alloc" in program

    def test_crisis_program_differs(self):
        normal = {"o2": "stable", "food": "stable", "power": "stable",
                  "h2o": "stable", "crisis": False, "o2_days": 25,
                  "food_days": 20, "crew_alive": 4, "events_recent": 0,
                  "trend_window": 10}
        crisis = {"o2": "declining_fast", "food": "declining", "power": "stable",
                  "h2o": "stable", "crisis": True, "o2_days": 3,
                  "food_days": 5, "crew_alive": 4, "events_recent": 2,
                  "trend_window": 10}
        p_normal = generate_lispy_program(normal, {})
        p_crisis = generate_lispy_program(crisis, {})
        assert p_normal != p_crisis
        assert "EMERGENCY" in p_crisis

    def test_personality_affects_output(self):
        trends = {"o2": "stable", "food": "stable", "power": "stable",
                  "h2o": "stable", "crisis": False, "o2_days": 25,
                  "food_days": 20, "crew_alive": 4, "events_recent": 0,
                  "trend_window": 10}
        p_risky = generate_lispy_program(trends, {},
                                         personality={"risk": 0.9, "aggression": 0.8, "trust": 0.3})
        p_safe = generate_lispy_program(trends, {},
                                        personality={"risk": 0.1, "aggression": 0.2, "trust": 0.9})
        assert p_risky != p_safe

    def test_generated_program_runs_in_vm(self):
        trends = {"o2": "declining", "food": "stable", "power": "stable",
                  "h2o": "stable", "crisis": False, "o2_days": 12,
                  "food_days": 20, "crew_alive": 4, "events_recent": 1,
                  "trend_window": 10}
        program = generate_lispy_program(trends, {})
        vm = LispyVM()
        vm.set_env("o2_days", 12.0)
        vm.set_env("food_days", 20.0)
        vm.set_env("power_kwh", 300.0)
        vm.set_env("events_active", 1)
        vm.set_env("heating_alloc", 0.25)
        vm.set_env("isru_alloc", 0.40)
        vm.set_env("greenhouse_alloc", 0.35)
        vm.set_env("food_ration", 1.0)
        # Should not raise
        vm.run_program(program)
        alloc = vm.get_allocation()
        assert 0 < alloc["heating"] < 1
        assert 0 < alloc["isru"] < 1
        assert 0 < alloc["greenhouse"] < 1


class TestShouldRewrite:
    def test_rewrite_on_first_call(self):
        assert should_rewrite([], 0)

    def test_no_rewrite_too_soon(self):
        history = [{"frame": i, "delta": {"o2": 0}, "crew_alive": 4}
                   for i in range(5)]
        assert not should_rewrite(history, 0, min_interval=10)

    def test_rewrite_on_crew_loss(self):
        history = [{"frame": i, "delta": {"o2": 0}, "crew_alive": 4}
                   for i in range(15)]
        history[-1]["crew_alive"] = 3  # Someone died
        assert should_rewrite(history, 0, min_interval=10)


class TestAdaptiveGovernor:
    def test_initial_program_generation(self):
        gov = AdaptiveCodeGenGovernor()
        state = {"sol": 1, "o2_days": 25, "food_days": 20, "power_kwh": 300,
                 "h2o_days": 20, "interior_temp_k": 293, "events_active": 0}
        alloc = gov.decide(state, [])
        assert gov.current_program is not None
        assert gov.programs_written == 1
        assert 0 < alloc["heating"] < 1

    def test_adapts_over_time(self):
        gov = AdaptiveCodeGenGovernor()
        history = []
        for sol in range(50):
            state = {"sol": sol, "o2_days": max(3, 25 - sol * 0.4),
                     "food_days": 20, "power_kwh": 300, "h2o_days": 20,
                     "interior_temp_k": 293, "events_active": 0}
            echo = {"frame": sol, "delta": {"o2": -0.4, "food": 0, "power": 0, "h2o": 0},
                    "o2_days": state["o2_days"], "food_days": 20,
                    "crew_alive": 4, "events": []}
            history.append(echo)
            gov.decide(state, history)
        # Should have rewritten at least once after initial
        assert gov.programs_written >= 2

    def test_serialize(self):
        gov = AdaptiveCodeGenGovernor(personality={"risk": 0.8})
        gov.decide({"sol": 1, "o2_days": 20, "food_days": 20,
                     "power_kwh": 300}, [])
        data = gov.serialize()
        assert data["programs_written"] == 1
        assert data["current_program"] is not None
        assert data["personality"]["risk"] == 0.8
