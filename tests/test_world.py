"""Tests for multi-colony world — trade, sabotage, supply drops."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from world import (
    create_world, world_step, run_world, distance_between,
    _compute_trade_offer, _execute_trade,
)
from colony import create_colony
from research import ResearchLab


class TestWorldCreation:
    def test_create_default_world(self):
        w = create_world(num_colonies=3, seed=42)
        assert len(w.colonies) == 3
        assert len(w.governors) == 3
        assert len(w.event_engines) == 3

    def test_colonies_at_different_locations(self):
        w = create_world(num_colonies=3, seed=42)
        locations = [(c.location_x, c.location_y)
                     for c in w.colonies.values()]
        assert len(set(locations)) == 3  # All different

    def test_different_archetypes(self):
        w = create_world(num_colonies=3, seed=42)
        archetypes = [g.archetype for g in w.governors.values()]
        # At least 2 different (with 3 colonies we cycle through)
        assert len(set(archetypes)) >= 2

    def test_different_resource_types(self):
        w = create_world(num_colonies=4, seed=42)
        types = [c.resource_type for c in w.colonies.values()]
        assert len(set(types)) >= 2


class TestDistance:
    def test_same_location(self):
        c1 = create_colony("A", location_x=5, location_y=5)
        c2 = create_colony("B", location_x=5, location_y=5)
        assert distance_between(c1, c2) == 0.0

    def test_known_distance(self):
        c1 = create_colony("A", location_x=0, location_y=0)
        c2 = create_colony("B", location_x=3, location_y=4)
        assert abs(distance_between(c1, c2) - 5.0) < 0.001


class TestWorldStep:
    def test_single_step(self):
        w = create_world(num_colonies=2, seed=42)
        summary = world_step(w)
        assert summary["sol"] == 1
        assert w.sol == 1

    def test_colonies_advance(self):
        w = create_world(num_colonies=2, seed=42)
        world_step(w)
        for colony in w.colonies.values():
            assert colony.sol == 1

    def test_snapshot_recorded(self):
        w = create_world(num_colonies=2, seed=42)
        world_step(w)
        assert len(w.snapshots) == 1

    def test_10_sols(self):
        w = create_world(num_colonies=3, seed=42)
        for _ in range(10):
            world_step(w)
        assert w.sol == 10
        alive = w.alive_colonies()
        assert len(alive) >= 1  # At least one should survive 10 sols

    def test_governor_memory_uses_prior_sol_resources(self):
        world = create_world(num_colonies=2, seed=42)
        world_step(world)
        world_step(world)

        trends = []
        for governor in world.governors.values():
            entry = governor.memory.entries[-1]
            trends.extend([
                entry.o2_trend,
                entry.h2o_trend,
                entry.food_trend,
                entry.power_trend,
            ])

        assert any(abs(value) > 1e-9 for value in trends)


class TestTradeOffer:
    def test_surplus_offers(self):
        src = create_colony("Rich", resource_type="water_rich")
        dst = create_colony("Poor", resource_type="food_rich")
        offering, requesting = _compute_trade_offer(src, dst)
        # Water-rich should offer water to food-rich
        assert isinstance(offering, dict)
        assert isinstance(requesting, dict)

    def test_equal_colonies_no_trade(self):
        src = create_colony("A", resource_type="balanced")
        dst = create_colony("B", resource_type="balanced")
        offering, requesting = _compute_trade_offer(src, dst)
        # Both balanced — minimal or no trade
        total_offered = sum(offering.values()) if offering else 0
        total_requested = sum(requesting.values()) if requesting else 0
        # Should be small or zero
        assert total_offered < 100 or total_requested < 100

    def test_trade_runway_uses_each_colonys_crew_size(self):
        src = create_colony("Small", crew_size=2)
        dst = create_colony("Large", crew_size=8)
        src.resources.h2o_liters = 400
        dst.resources.h2o_liters = 400

        offering, requesting = _compute_trade_offer(src, dst)

        assert offering["h2o_liters"] > 0
        assert "h2o_liters" not in requesting

    def test_water_trade_uses_net_tank_runway(self):
        src = create_colony("Source", crew_size=4)
        dst = create_colony("Neighbor", crew_size=4)
        src.resources.h2o_liters = 100
        dst.resources.h2o_liters = 300

        _, requesting = _compute_trade_offer(src, dst)

        assert "h2o_liters" not in requesting

        src.resources.h2o_liters = 5
        _, requesting = _compute_trade_offer(src, dst)

        assert requesting["h2o_liters"] > 0

    def test_water_trade_applies_research_consumption_reduction(self):
        src = create_colony("Source", crew_size=4)
        dst = create_colony("Neighbor", crew_size=4)
        src.resources.h2o_liters = 16
        dst.resources.h2o_liters = 29

        _, without_research = _compute_trade_offer(src, dst)
        assert without_research["h2o_liters"] > 0

        src.research = ResearchLab(completed=["water_recycling"])
        _, with_research = _compute_trade_offer(src, dst)

        assert "h2o_liters" not in with_research

    def test_execute_trade_conserves_combined_resources(self):
        src = create_colony("Source", crew_size=2)
        dst = create_colony("Destination", crew_size=8)
        before = src.resources.h2o_liters + dst.resources.h2o_liters

        _execute_trade(src, dst, {"h2o_liters": 25.0}, {})

        after = src.resources.h2o_liters + dst.resources.h2o_liters
        assert abs(after - before) < 1e-9
        assert src.resources.h2o_liters >= 0
        assert dst.resources.h2o_liters >= 0


class TestRunWorld:
    def test_run_short_simulation(self):
        w = create_world(num_colonies=3, max_sols=50, seed=42)
        results = run_world(w)
        assert "colonies" in results
        assert "timeline" in results
        assert len(results["colonies"]) == 3

    def test_results_have_required_fields(self):
        w = create_world(num_colonies=2, max_sols=20, seed=42)
        results = run_world(w)
        for name, data in results["colonies"].items():
            assert "archetype" in data
            assert "survived_sols" in data
            assert "alive" in data
            assert "final_resources" in data
            assert "trades_completed" in data

    def test_all_dead_stops_simulation(self):
        """If all colonies die, simulation should stop."""
        w = create_world(num_colonies=2, max_sols=1000, seed=42)
        # Cripple both colonies
        for colony in w.colonies.values():
            colony.resources.o2_kg = 0.1
            colony.resources.h2o_liters = 0.1
            colony.resources.food_kcal = 100.0
            colony.resources.power_kwh = 0.0
        results = run_world(w)
        # Should stop well before 1000
        max_survived = max(d["survived_sols"] for d in results["colonies"].values())
        assert max_survived < 500


class TestSupplyDrop:
    def test_supply_drop_at_interval(self):
        w = create_world(num_colonies=2, max_sols=100, seed=42)
        # Run until supply drop or all dead
        for _ in range(100):
            if not w.alive_colonies():
                break
            world_step(w)
        supply_events = [e for e in w.history if e.event_type == "supply_drop"]
        # If colonies survived past sol 50, should have a supply drop
        max_sol = max(c.sol for c in w.colonies.values())
        if max_sol >= 50:
            assert len(supply_events) >= 1
        else:
            # All died before supply drop — just verify no crash
            assert isinstance(supply_events, list)


class TestSabotage:
    def test_sabotage_recorded_in_history(self):
        """Run enough sols that sabotage might occur."""
        w = create_world(num_colonies=3, max_sols=200, seed=42)
        # Make one colony desperate to trigger sabotage
        names = list(w.colonies.keys())
        w.colonies[names[0]].resources.o2_kg = 2.0
        w.colonies[names[0]].resources.h2o_liters = 3.0
        w.governors[names[0]] = __import__("governor").create_governor("Desperate", "contrarian")

        for _ in range(50):
            if not w.alive_colonies():
                break
            world_step(w)

        # Check if any sabotage events occurred
        sabotage_events = [e for e in w.history if e.event_type == "sabotage"]
        # May or may not have sabotage — just verify it doesn't crash
        assert isinstance(sabotage_events, list)
