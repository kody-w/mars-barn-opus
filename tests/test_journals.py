"""Tests for procedural crew journals."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from journals import generate_journal_entry, generate_all_journals


class TestJournals:
    def test_generates_entry(self):
        crew = {"name": "Chen W.", "role": "CMDR", "hp": 95, "mor": 82,
                "alive": True, "st": "Nominal", "rad": 10}
        state = {"o2_days": 25, "food_days": 20, "power": 400, "modules": [],
                 "research": [], "crew": [crew]}
        entry = generate_journal_entry(crew, state, [], 42)
        assert "Sol 42" in entry
        assert "Chen W." in entry
        assert len(entry) > 50

    def test_mood_varies_with_morale(self):
        crew_happy = {"name": "Test", "role": "SCI", "hp": 95, "mor": 90,
                      "alive": True, "st": "Nominal", "rad": 5}
        crew_sad = {"name": "Test", "role": "SCI", "hp": 95, "mor": 15,
                    "alive": True, "st": "Nominal", "rad": 5}
        state = {"o2_days": 25, "food_days": 20, "power": 400,
                 "modules": [], "research": [], "crew": []}
        e1 = generate_journal_entry(crew_happy, state, [], 42)
        e2 = generate_journal_entry(crew_sad, state, [], 42)
        assert e1 != e2

    def test_status_affects_entry(self):
        crew = {"name": "Test", "role": "ENGR", "hp": 30, "mor": 40,
                "alive": True, "st": "STARVING", "rad": 100}
        state = {"o2_days": 5, "food_days": 2, "power": 100,
                 "modules": [], "research": [], "crew": [crew]}
        entry = generate_journal_entry(crew, state, [], 50)
        assert "ration" in entry.lower() or "eaten" in entry.lower()

    def test_event_reactions(self):
        crew = {"name": "Test", "role": "CMDR", "hp": 80, "mor": 70,
                "alive": True, "st": "Nominal", "rad": 50}
        state = {"o2_days": 20, "food_days": 20, "power": 300,
                 "modules": [], "research": [], "crew": [crew]}
        events = [{"type": "dust_storm", "remaining": 5}]
        entry = generate_journal_entry(crew, state, events, 42)
        assert "dust" in entry.lower() or "storm" in entry.lower()

    def test_dead_crew_no_entry(self):
        crew = {"name": "Test", "role": "SCI", "hp": 0, "mor": 0,
                "alive": False, "st": "DECEASED", "rad": 500}
        state = {"o2_days": 20, "food_days": 20, "power": 300,
                 "modules": [], "research": [], "crew": []}
        entry = generate_journal_entry(crew, state, [], 42)
        assert entry == ""

    def test_deterministic_with_same_seed(self):
        crew = {"name": "Chen W.", "role": "CMDR", "hp": 90, "mor": 75,
                "alive": True, "st": "Nominal", "rad": 20}
        state = {"o2_days": 20, "food_days": 20, "power": 300,
                 "modules": [], "research": [], "crew": [crew]}
        e1 = generate_journal_entry(crew, state, [], 42, seed=7)
        e2 = generate_journal_entry(crew, state, [], 42, seed=7)
        assert e1 == e2

    def test_deterministic_across_python_hash_seeds(self):
        code = """
import sys
sys.path.insert(0, 'src')
from journals import generate_journal_entry
crew={'name':'Chen W.','role':'CMDR','hp':90,'mor':75,'alive':True,'st':'Nominal','rad':20}
state={'o2_days':20,'food_days':20,'power':300,'modules':[],'research':[],'crew':[crew]}
print(generate_journal_entry(crew,state,[],42,seed=7))
"""
        root = Path(__file__).resolve().parents[1]
        outputs = []
        for hash_seed in ("1", "999"):
            environment = {**os.environ, "PYTHONHASHSEED": hash_seed}
            outputs.append(subprocess.check_output(
                [sys.executable, "-c", code],
                cwd=root,
                env=environment,
                text=True,
            ))
        assert outputs[0] == outputs[1]

    def test_generate_all(self):
        crew = [
            {"name": "Chen W.", "role": "CMDR", "hp": 90, "mor": 80,
             "alive": True, "st": "Nominal", "rad": 10},
            {"name": "Rodriguez M.", "role": "ENGR", "hp": 85, "mor": 75,
             "alive": True, "st": "Nominal", "rad": 15},
            {"name": "Dead", "role": "SCI", "hp": 0, "mor": 0,
             "alive": False, "st": "DECEASED", "rad": 500},
        ]
        state = {"o2_days": 20, "food_days": 20, "power": 300,
                 "modules": [], "research": [], "crew": crew}
        journals = generate_all_journals(crew, state, [], 42)
        assert len(journals) == 2  # Only alive crew


class TestDNA:
    def test_sol_to_color(self):
        from dna import sol_to_color
        healthy = sol_to_color({"o2_days": 30, "food_days": 30,
                                "power": 500, "morale": 0.9})
        critical = sol_to_color({"o2_days": 2, "food_days": 1,
                                 "power": 50, "morale": 0.1})
        # Healthy should be greener, critical should be redder
        assert healthy[1] > critical[1]  # Green channel
        assert critical[0] > healthy[0]  # Red channel

    def test_generate_fingerprint(self):
        from dna import generate_fingerprint_data
        history = [
            {"o2_days": 30 - i * 0.5, "food_days": 30 - i * 0.3,
             "power": 500 - i * 5, "morale": 0.85 - i * 0.01,
             "events": [], "crew_alive": 4}
            for i in range(100)
        ]
        grid = generate_fingerprint_data(history, width=20)
        assert len(grid) == 5  # 100 sols / 20 width = 5 rows
        assert len(grid[0]) == 20

    def test_fingerprint_hash(self):
        from dna import fingerprint_hash
        h1 = fingerprint_hash([{"frame": 1, "delta": {"o2": 1.0, "food": 2.0}, "events": []}])
        h2 = fingerprint_hash([{"frame": 1, "delta": {"o2": 1.0, "food": 2.0}, "events": []}])
        h3 = fingerprint_hash([{"frame": 1, "delta": {"o2": 5.0, "food": 2.0}, "events": []}])
        assert h1 == h2  # Same input → same hash
        assert h1 != h3  # Different input → different hash

    def test_fingerprint_svg(self):
        from dna import generate_fingerprint_data, fingerprint_to_svg
        grid = [[(100, 200, 50)] * 10 for _ in range(3)]
        svg = fingerprint_to_svg(grid, colony_name="Test Colony", hash_str="abc123")
        assert "<svg" in svg
        assert "Test Colony" in svg
        assert "abc123" in svg


class TestEvolution:
    def test_random_genome(self):
        from evolution import random_genome, TRAIT_NAMES
        g = random_genome()
        for trait in TRAIT_NAMES:
            assert 0 <= g.traits[trait] <= 1

    def test_crossover(self):
        import random as rmod
        from evolution import random_genome, crossover
        rng = rmod.Random(42)
        p1 = random_genome(0, rng)
        p2 = random_genome(0, rng)
        child = crossover(p1, p2, 1, rng)
        # Child should have mix of parent traits
        assert child.generation == 1

    def test_mutate(self):
        import random as rmod
        from evolution import random_genome, mutate
        rng = rmod.Random(42)
        g = random_genome(0, rng)
        original = dict(g.traits)
        mutate(g, mutation_rate=1.0, rng=rng)  # Force all mutations
        changed = sum(1 for t in g.traits if g.traits[t] != original[t])
        assert changed > 0

    def test_evaluate_genome(self):
        from evolution import random_genome, evaluate_genome
        g = random_genome()
        fitness = evaluate_genome(g, seeds=[42], max_sols=30)
        assert fitness > 0
        assert g.survived_sols > 0

    def test_small_evolution(self):
        from evolution import evolve
        pop = evolve(population_size=6, generations=2,
                    max_sols=30, seeds=[42], verbose=False)
        assert len(pop) == 6
        assert pop[0].fitness >= pop[-1].fitness  # Sorted
