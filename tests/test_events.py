"""Tests for event system — generation, lifecycle, aggregation."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from events import EventEngine, Event, EFFECT_GENERATORS
from config import (
    DUST_STORM_MAX_DUST_FACTOR,
    EVENT_SEVERITY_MAX,
    MARS_YEAR_SOLS,
)


class TestEventEngine:
    def test_deterministic_with_seed(self):
        e1 = EventEngine()
        e1.set_seed(42)
        events1 = []
        for sol in range(100):
            events1.extend(e1.tick(sol))

        e2 = EventEngine()
        e2.set_seed(42)
        events2 = []
        for sol in range(100):
            events2.extend(e2.tick(sol))

        assert len(events1) == len(events2)
        for a, b in zip(events1, events2):
            assert a.event_type == b.event_type
            assert a.severity == b.severity

    def test_events_expire(self):
        e = EventEngine()
        e.set_seed(42)
        # Run enough sols for events to generate and expire
        for sol in range(200):
            e.tick(sol)
        # Check event log has entries
        assert len(e.event_log) > 0

    def test_no_stacking_same_type(self):
        e = EventEngine()
        e.set_seed(42)
        for sol in range(500):
            e.tick(sol)
            types = [ev.event_type for ev in e.active_events]
            # No duplicate types
            assert len(types) == len(set(types)), \
                f"Stacking detected at sol {sol}: {types}"

    def test_aggregate_effects_multiplicative(self):
        e = EventEngine()
        e.active_events = [
            Event("dust_storm", 0.5, 10, 5,
                  {"solar_multiplier": 0.6, "dust_factor": 2.5}),
            Event("seasonal_shift", 0.3, 30, 20,
                  {"solar_multiplier": 0.85}),
        ]
        agg = e.aggregate_effects()
        # Multiplicative: 0.6 * 0.85 = 0.51
        assert abs(agg["solar_multiplier"] - 0.51) < 0.01
        # dust_factor takes max
        assert agg["dust_factor"] == 2.5

    def test_aggregate_effects_additive(self):
        e = EventEngine()
        e.active_events = [
            Event("a", 0.5, 1, 1, {"water_loss": 10.0}),
            Event("b", 0.5, 1, 1, {"water_loss": 5.0}),
        ]
        agg = e.aggregate_effects()
        assert agg["water_loss"] == 15.0

    def test_event_descriptions_exist(self):
        from events import EVENT_DESCRIPTIONS, EVENT_PROBABILITIES
        for event_type in EVENT_PROBABILITIES:
            assert event_type in EVENT_DESCRIPTIONS

    def test_active_event_dicts(self):
        e = EventEngine()
        e.active_events = [
            Event("dust_storm", 0.5, 10, 5,
                  {"solar_multiplier": 0.6}, "A storm!"),
        ]
        dicts = e.active_event_dicts()
        assert len(dicts) == 1
        assert dicts[0]["type"] == "dust_storm"
        assert dicts[0]["description"] == "A storm!"
        assert dicts[0]["onset"] is False

    def test_dust_uses_one_optical_attenuation_path(self):
        effects = EFFECT_GENERATORS["dust_storm"](EVENT_SEVERITY_MAX)
        assert effects["dust_factor"] == DUST_STORM_MAX_DUST_FACTOR
        assert "solar_multiplier" not in effects

    def test_dust_is_not_blocked_during_former_safe_half_year(self):
        e = EventEngine()
        e.set_seed(0)
        dust_onsets = []
        former_gate_end = int(MARS_YEAR_SOLS * 0.5)
        for sol in range(1, former_gate_end + 1):
            dust_onsets.extend(
                event.sol_started
                for event in e.tick(sol)
                if event.event_type == "dust_storm"
            )
        assert dust_onsets
        assert min(dust_onsets) <= former_gate_end

    def test_multi_year_event_distribution(self):
        """Annualized hazards still produce a deterministic event mix."""
        e = EventEngine()
        e.set_seed(42)
        seen_types = set()
        for sol in range(int(MARS_YEAR_SOLS * 2)):
            new = e.tick(sol)
            for ev in new:
                seen_types.add(ev.event_type)
        assert len(seen_types) >= 4, f"Only saw {seen_types}"
        assert "seasonal_shift" not in seen_types
