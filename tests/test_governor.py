"""Tests for governor decision engine — personality, memory, trade, sabotage."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from governor import Governor, GovernorMemory, MemoryEntry, create_governor
from colony import Colony, create_colony, Allocation, CascadeState


class TestGovernorCreation:
    def test_create_with_archetype(self):
        g = create_governor("Test", "engineer")
        assert g.archetype == "engineer"
        assert "risk_tolerance" in g.traits

    def test_all_archetypes_valid(self):
        from config import GOVERNOR_ARCHETYPES
        for arch in GOVERNOR_ARCHETYPES:
            g = create_governor(f"Test-{arch}", arch)
            assert g.traits.get("risk_tolerance") is not None

    def test_unknown_archetype_falls_back(self):
        g = create_governor("Test", "nonexistent")
        assert g.traits  # Should fall back to engineer


class TestDecisions:
    def test_decide_returns_allocation(self):
        g = create_governor("Test", "engineer")
        c = create_colony("Colony")
        a = g.decide(c)
        assert isinstance(a, Allocation)
        total = a.heating_fraction + a.isru_fraction + a.greenhouse_fraction
        assert abs(total - 1.0) < 0.01

    def test_crisis_triggers_survival_mode(self):
        g = create_governor("Test", "philosopher")  # Normally peaceful
        c = create_colony("Colony")
        c.resources.o2_kg = 1.0  # About to die
        a = g.decide(c)
        # Should heavily favor ISRU to produce O2
        assert a.isru_fraction > 0.5

    def test_crisis_triggers_rationing(self):
        g = create_governor("Test", "engineer")
        c = create_colony("Colony")
        c.resources.food_kcal = 1000.0  # Very low
        a = g.decide(c)
        assert a.food_ration < 1.0

    def test_personality_divergence(self):
        """Different archetypes should produce different allocations."""
        c = create_colony("Colony")
        allocations = {}
        for arch in ["engineer", "contrarian", "survivalist", "wildcard"]:
            g = create_governor(f"Gov-{arch}", arch)
            a = g.decide(c)
            allocations[arch] = (a.heating_fraction, a.isru_fraction,
                                 a.greenhouse_fraction)

        # At least some should differ
        unique = set(allocations.values())
        assert len(unique) > 1, "All archetypes produced identical allocations"

    def test_crisis_convergence(self):
        """In extreme crisis, all archetypes should converge."""
        c = create_colony("Colony")
        c.resources.o2_kg = 0.5  # Critical
        c.resources.h2o_liters = 1.0

        isru_fractions = []
        for arch in ["engineer", "philosopher", "contrarian", "hermit"]:
            g = create_governor(f"Gov-{arch}", arch)
            a = g.decide(c)
            isru_fractions.append(a.isru_fraction)

        # All should be high ISRU (>0.5)
        for frac in isru_fractions:
            assert frac > 0.4, f"Governor didn't prioritize ISRU in crisis: {frac}"


class TestMemory:
    def test_memory_records(self):
        m = GovernorMemory()
        entry = MemoryEntry(
            sol=1, allocation=Allocation(),
            o2_trend=0.5, h2o_trend=-0.3, food_trend=100.0,
            power_trend=-10.0, cascade_active=False, events_active=0,
        )
        m.record(entry)
        assert len(m.entries) == 1

    def test_memory_eviction(self):
        m = GovernorMemory(max_entries=5)
        for i in range(10):
            m.record(MemoryEntry(
                sol=i, allocation=Allocation(),
                o2_trend=0, h2o_trend=0, food_trend=0,
                power_trend=0, cascade_active=False, events_active=0,
            ))
        assert len(m.entries) == 5
        assert m.entries[0].sol == 5  # Oldest should be evicted

    def test_resource_trend(self):
        m = GovernorMemory()
        for i in range(10):
            m.record(MemoryEntry(
                sol=i, allocation=Allocation(),
                o2_trend=-1.0, h2o_trend=0.5, food_trend=0,
                power_trend=0, cascade_active=False, events_active=0,
            ))
        assert m.resource_trend("o2") == -1.0
        assert m.resource_trend("h2o") == 0.5

    def test_crisis_frequency(self):
        m = GovernorMemory()
        for i in range(10):
            m.record(MemoryEntry(
                sol=i, allocation=Allocation(),
                o2_trend=0, h2o_trend=0, food_trend=0,
                power_trend=0, cascade_active=(i % 2 == 0),
                events_active=0,
            ))
        assert m.crisis_frequency() == 0.5

    def test_memory_influences_decisions(self):
        """Governor with declining O2 memory should shift to ISRU."""
        g = create_governor("Test", "engineer")
        c = create_colony("Colony")

        # Build memory of declining O2
        from colony import Resources
        for i in range(10):
            prev = Resources(o2_kg=c.resources.o2_kg + 1.0)
            g.decide(c, prev_resources=prev)
            c.resources.o2_kg -= 0.5

        # Memory should shift more power to ISRU than the same state alone.
        fresh = create_governor("Fresh", "engineer")
        baseline = fresh.decide(c)
        a = g.decide(c)
        assert a.isru_fraction > baseline.isru_fraction


class TestTrade:
    def test_philosopher_cooperates(self):
        g = create_governor("Test", "philosopher")
        result = g.evaluate_trade(
            {"o2_kg": 5.0}, {"food_kcal": 5000.0},
            "Neighbor", 0.5,
        )
        assert result is True  # First interaction, high trust

    def test_hermit_refuses(self):
        g = create_governor("Test", "hermit")
        result = g.evaluate_trade(
            {"o2_kg": 5.0}, {"food_kcal": 5000.0},
            "Neighbor", 0.5,
        )
        assert result is False  # Trade willingness too low

    def test_bad_reputation_rejected(self):
        g = create_governor("Test", "philosopher")
        result = g.evaluate_trade(
            {"o2_kg": 5.0}, {"food_kcal": 5000.0},
            "BadActor", 0.1,  # Bad reputation
        )
        assert result is False

    def test_tit_for_tat(self):
        g = create_governor("Test", "diplomat")
        g.trade_history["Neighbor"] = ["cooperate", "cooperate"]
        assert g.evaluate_trade({}, {}, "Neighbor", 0.5) is True

        g.trade_history["Neighbor"] = ["cooperate", "defect"]
        assert g.evaluate_trade({}, {}, "Neighbor", 0.5) is False


class TestSabotage:
    def test_desperate_wildcard_sabotages(self):
        """Wildcard has highest sabotage_threshold (0.20) and high aggression."""
        g = create_governor("Test", "wildcard")
        c = create_colony("Attacker")
        c.resources.o2_kg = 0.5
        c.resources.h2o_liters = 1.0
        c.resources.food_kcal = 100.0
        c.resources.power_kwh = 1.0
        target = create_colony("Target")
        assert g.consider_sabotage(c, target) is True

    def test_stable_philosopher_doesnt_sabotage(self):
        g = create_governor("Test", "philosopher")
        c = create_colony("Attacker")  # Full resources
        target = create_colony("Target")
        assert g.consider_sabotage(c, target) is False

    def test_low_aggression_hermit_doesnt_sabotage(self):
        g = create_governor("Test", "hermit")
        c = create_colony("Attacker")
        c.resources.o2_kg = 2.0
        c.resources.h2o_liters = 3.0
        target = create_colony("Target")
        assert g.consider_sabotage(c, target) is False
