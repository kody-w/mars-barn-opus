"""Tests for emergency protocol system."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from emergency import EmergencySystem, PROTOCOLS, ActiveProtocol


class TestEmergencySystem:
    def test_activate_protocol(self):
        es = EmergencySystem()
        err = es.activate("shelter_in_place", 10)
        assert err is None
        assert es.active is not None
        assert es.active.slug == "shelter_in_place"

    def test_cant_stack_protocols(self):
        es = EmergencySystem()
        es.activate("shelter_in_place", 10)
        err = es.activate("emergency_isru", 11)
        assert err is not None
        assert "already active" in err.lower()

    def test_protocol_expires(self):
        es = EmergencySystem()
        es.activate("emergency_isru", 10)  # 3 sols
        for sol in range(10, 15):
            event = es.tick(sol)
        assert es.active is None

    def test_allocation_override(self):
        es = EmergencySystem()
        assert es.get_allocation_override() is None
        es.activate("shelter_in_place", 10)
        alloc = es.get_allocation_override()
        assert alloc is not None
        assert alloc.heating_fraction == 0.60

    def test_crew_effects(self):
        es = EmergencySystem()
        es.activate("crew_rest", 10)
        effects = es.get_crew_effects()
        assert effects.get("health_recovery") == 5.0

    def test_history_tracked(self):
        es = EmergencySystem()
        es.activate("shelter_in_place", 10)
        for sol in range(10, 20):
            es.tick(sol)
        es.activate("emergency_isru", 20)
        assert es.protocols_used == 2
        assert len(es.history) == 2

    def test_unknown_protocol(self):
        es = EmergencySystem()
        err = es.activate("nonexistent", 10)
        assert err is not None

    def test_serialize(self):
        es = EmergencySystem()
        es.activate("power_save", 10)
        data = es.serialize()
        assert data["active"] is not None
        assert data["active"]["slug"] == "power_save"
        assert data["protocols_used"] == 1

    def test_all_protocols_valid(self):
        for slug, proto in PROTOCOLS.items():
            assert proto.name
            assert proto.duration_sols > 0
            assert proto.allocation is not None

    def test_full_ration_override(self):
        es = EmergencySystem()
        es.activate("full_ration", 10)
        alloc = es.get_allocation_override()
        assert alloc.food_ration == 1.0
