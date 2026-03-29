"""Tests for research system."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from research import (
    ResearchLab, RESEARCH_TREE, ActiveResearch, governor_research_decision,
)
from colony import Resources, create_colony, Allocation, step


class TestResearchTree:
    def test_all_projects_valid(self):
        for slug, proj in RESEARCH_TREE.items():
            assert proj.name, f"{slug} missing name"
            assert proj.research_sols > 0
            assert proj.tier in (1, 2, 3)
            for req in proj.requires:
                assert req in RESEARCH_TREE, f"{slug} requires unknown {req}"

    def test_tree_size(self):
        assert len(RESEARCH_TREE) >= 11

    def test_tiers_exist(self):
        tiers = {p.tier for p in RESEARCH_TREE.values()}
        assert tiers == {1, 2, 3}


class TestResearchLab:
    def test_empty_lab(self):
        lab = ResearchLab()
        assert len(lab.completed) == 0
        assert lab.active is None

    def test_start_research(self):
        lab = ResearchLab()
        r = Resources(power_kwh=500)
        err = lab.start_research("improved_solar", r)
        assert err is None
        assert lab.active is not None
        assert lab.active.slug == "improved_solar"
        assert r.power_kwh < 500

    def test_cant_start_two(self):
        lab = ResearchLab()
        r = Resources(power_kwh=1000)
        lab.start_research("improved_solar", r)
        err = lab.start_research("water_recycling", r)
        assert err is not None
        assert "already" in err.lower()

    def test_completes_after_sols(self):
        lab = ResearchLab()
        r = Resources(power_kwh=500)
        lab.start_research("improved_solar", r)
        events = []
        for sol in range(20):
            events.extend(lab.tick(sol))
        assert "improved_solar" in lab.completed
        assert any("COMPLETE" in e for e in events)
        assert lab.active is None

    def test_prerequisites(self):
        lab = ResearchLab()
        r = Resources(power_kwh=1000, h2o_liters=200)
        can, reason = lab.can_research("moxie_upgrade", r)
        assert not can
        assert "Requires" in reason

    def test_prerequisite_satisfied(self):
        lab = ResearchLab()
        lab.completed.append("water_recycling")
        r = Resources(power_kwh=500, h2o_liters=200)
        can, _ = lab.can_research("moxie_upgrade", r)
        assert can

    def test_cant_repeat(self):
        lab = ResearchLab()
        lab.completed.append("improved_solar")
        r = Resources(power_kwh=500)
        can, reason = lab.can_research("improved_solar", r)
        assert not can
        assert "Already" in reason

    def test_get_effect(self):
        lab = ResearchLab()
        lab.completed.append("improved_solar")
        assert lab.get_effect("solar_efficiency_bonus") == 0.15

    def test_stacked_effects(self):
        lab = ResearchLab()
        lab.completed.extend(["crop_optimization", "closed_ecosystem"])
        total = lab.get_effect("food_production_bonus")
        assert abs(total - 1.25) < 0.01  # 0.25 + 1.00

    def test_scientist_bonus_speeds_research(self):
        lab1 = ResearchLab()
        r1 = Resources(power_kwh=500)
        lab1.start_research("improved_solar", r1, scientist_bonus=0.0)
        sols_no_bonus = lab1.active.total_sols

        lab2 = ResearchLab()
        r2 = Resources(power_kwh=500)
        lab2.start_research("improved_solar", r2, scientist_bonus=1.0)
        sols_with_bonus = lab2.active.total_sols

        assert sols_with_bonus < sols_no_bonus

    def test_serialize(self):
        lab = ResearchLab()
        lab.completed.append("improved_solar")
        data = lab.serialize()
        assert data["total_completed"] == 1
        assert data["effects"]["solar_efficiency_bonus"] == 0.15

    def test_available_research(self):
        lab = ResearchLab()
        r = Resources(power_kwh=500, h2o_liters=100, food_kcal=50000)
        available = lab.available_research(r)
        assert len(available) == len(RESEARCH_TREE)
        startable = [a for a in available if a["can_start"]]
        assert len(startable) >= 3  # Tier 1 basics


class TestGovernorResearch:
    def test_picks_tier1_first(self):
        lab = ResearchLab()
        r = Resources(power_kwh=500, h2o_liters=100, food_kcal=50000)
        choice = governor_research_decision(lab, r, 50, 0.0)
        assert choice is not None
        assert RESEARCH_TREE[choice].tier == 1

    def test_no_research_during_crisis(self):
        lab = ResearchLab()
        r = Resources(power_kwh=500)
        choice = governor_research_decision(lab, r, 50, 0.8)
        assert choice is None

    def test_no_research_early(self):
        lab = ResearchLab()
        r = Resources(power_kwh=500)
        choice = governor_research_decision(lab, r, 10, 0.0)
        assert choice is None


class TestColonyIntegration:
    def test_colony_with_research(self):
        colony = create_colony("Test")
        colony.research = ResearchLab()
        alloc = Allocation(heating_fraction=0.25, isru_fraction=0.40,
                           greenhouse_fraction=0.35)
        for _ in range(50):
            if not colony.alive:
                break
            step(colony, 300.0, 200.0, alloc)
        # Should have started researching by sol 30
        assert colony.sol >= 30

    def test_research_bonuses_apply(self):
        from colony import produce
        c1 = create_colony("NoResearch")
        c2 = create_colony("WithResearch")
        c2.research = ResearchLab()
        c2.research.completed.append("improved_solar")
        alloc = Allocation(heating_fraction=0.2, isru_fraction=0.5,
                           greenhouse_fraction=0.3)
        produce(c1, 300.0, alloc)
        produce(c2, 300.0, alloc)
        assert c2.resources.power_kwh > c1.resources.power_kwh

    def test_serialize_includes_research(self):
        from colony import serialize
        colony = create_colony("Test")
        colony.research = ResearchLab()
        colony.research.completed.append("water_recycling")
        data = serialize(colony)
        assert data["research"] is not None
        assert data["research"]["total_completed"] == 1
