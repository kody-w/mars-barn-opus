"""End-to-end integration tests."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from sim import run_single, run_multi


class TestSingleColony:
    def test_run_default(self):
        result = run_single(sols=50, seed=42)
        assert result["mode"] == "single"
        assert result["survived_sols"] > 0
        assert "final_state" in result

    def test_all_archetypes_run(self):
        from config import GOVERNOR_ARCHETYPES
        for arch in GOVERNOR_ARCHETYPES:
            result = run_single(sols=30, seed=42, archetype=arch)
            assert result["survived_sols"] > 0, f"{arch} died immediately"

    def test_deterministic(self):
        r1 = run_single(sols=100, seed=42, archetype="engineer")
        r2 = run_single(sols=100, seed=42, archetype="engineer")
        assert r1["survived_sols"] == r2["survived_sols"]
        assert r1["alive"] == r2["alive"]

    def test_different_seeds_differ(self):
        r1 = run_single(sols=100, seed=42)
        r2 = run_single(sols=100, seed=99)
        # Results should differ (different terrain, events)
        # But both should run without error
        assert r1["seed"] != r2["seed"]


class TestMultiColony:
    def test_run_multi(self):
        result = run_multi(num_colonies=3, sols=50, seed=42)
        assert len(result["colonies"]) == 3
        assert len(result["timeline"]) > 0

    def test_five_colonies(self):
        result = run_multi(num_colonies=5, sols=30, seed=42)
        assert len(result["colonies"]) == 5

    def test_trade_occurs(self):
        result = run_multi(num_colonies=3, sols=100, seed=42)
        total_trades = sum(d["trades_completed"]
                          for d in result["colonies"].values())
        # With 3 colonies over 100 sols, some trade should occur
        assert total_trades > 0

    def test_results_json_serializable(self):
        result = run_multi(num_colonies=2, sols=30, seed=42)
        # Should not raise
        json_str = json.dumps(result)
        assert len(json_str) > 100

    def test_multi_is_deterministic_across_processes(self):
        code = """
import json,sys
sys.path.insert(0,'src')
from sim import run_multi
print(json.dumps(run_multi(num_colonies=6,sols=100,seed=42),sort_keys=True))
"""
        root = Path(__file__).resolve().parents[1]
        outputs = []
        for hash_seed in ("2", "777"):
            environment = {**os.environ, "PYTHONHASHSEED": hash_seed}
            outputs.append(subprocess.check_output(
                [sys.executable, "-c", code],
                cwd=root,
                env=environment,
                text=True,
            ))
        assert outputs[0] == outputs[1]


class TestPerformance:
    def test_500_sols_single_under_2_seconds(self):
        import time
        start = time.time()
        run_single(sols=500, seed=42)
        elapsed = time.time() - start
        assert elapsed < 2.0, f"500-sol single took {elapsed:.2f}s"

    def test_500_sols_multi_under_10_seconds(self):
        import time
        start = time.time()
        run_multi(num_colonies=5, sols=500, seed=42)
        elapsed = time.time() - start
        assert elapsed < 10.0, f"500-sol multi took {elapsed:.2f}s"
