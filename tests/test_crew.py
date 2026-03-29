"""Tests for crew simulation — individual crew members, health, death."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from crew import (
    CrewMember, Crew, Role, generate_crew, tick_crew,
    O2_KG_PER_PERSON_PER_SOL, H2O_L_PER_PERSON_PER_SOL,
    FOOD_KCAL_PER_PERSON_PER_SOL,
)


class TestCrewMember:
    def test_healthy_effectiveness(self):
        m = CrewMember(name="Test", role=Role.ENGINEER, health=100, fatigue=0, morale=80)
        assert m.effectiveness > 0.8

    def test_sick_effectiveness(self):
        m = CrewMember(name="Test", role=Role.ENGINEER, health=20, fatigue=80, morale=20)
        assert m.effectiveness < 0.3

    def test_dead_effectiveness(self):
        m = CrewMember(name="Test", role=Role.ENGINEER, alive=False)
        assert m.effectiveness == 0.0

    def test_status_nominal(self):
        m = CrewMember(name="Test", role=Role.ENGINEER, health=95)
        assert m.status_line == "Nominal"

    def test_status_conditions(self):
        m = CrewMember(name="Test", role=Role.ENGINEER, starving=True, dehydrated=True)
        assert "STARVING" in m.status_line
        assert "DEHYDRATED" in m.status_line

    def test_serialize(self):
        m = CrewMember(name="Chen W.", role=Role.COMMANDER)
        d = m.serialize()
        assert d["name"] == "Chen W."
        assert d["role"] == "commander"
        assert d["alive"] is True


class TestCrew:
    def test_generate_default(self):
        crew = generate_crew(size=4, seed=42)
        assert len(crew.members) == 4
        assert crew.alive_count == 4

    def test_roles_assigned(self):
        crew = generate_crew(size=4, seed=42)
        roles = {m.role for m in crew.members}
        assert Role.COMMANDER in roles
        assert Role.ENGINEER in roles

    def test_unique_names(self):
        crew = generate_crew(size=4, seed=42)
        names = [m.name for m in crew.members]
        assert len(set(names)) == 4

    def test_avg_health(self):
        crew = generate_crew(size=4, seed=42)
        assert crew.avg_health > 90

    def test_role_bonus(self):
        crew = generate_crew(size=4, seed=42)
        # Engineer should give ISRU bonus
        isru_bonus = crew.get_role_bonus("isru")
        assert isru_bonus > 0

    def test_serialize_roster(self):
        crew = generate_crew(size=4, seed=42)
        data = crew.serialize()
        assert len(data) == 4
        assert all("name" in d for d in data)


class TestTickCrew:
    def test_nominal_conditions(self):
        crew = generate_crew(size=4, seed=42)
        resources = {
            "o2_per_person": O2_KG_PER_PERSON_PER_SOL,
            "h2o_per_person": H2O_L_PER_PERSON_PER_SOL,
            "food_per_person": FOOD_KCAL_PER_PERSON_PER_SOL,
        }
        events = tick_crew(crew, 1, resources, 293.0, 0.3)
        assert crew.alive_count == 4
        assert all(m.health > 90 for m in crew.members)

    def test_starvation_damages_health(self):
        crew = generate_crew(size=4, seed=42)
        resources = {"o2_per_person": 1.0, "h2o_per_person": 3.0,
                     "food_per_person": 0.0}  # No food
        for sol in range(10):
            tick_crew(crew, sol, resources, 293.0, 0.3)
        # Health should have degraded
        assert crew.avg_health < 90

    def test_hypothermia(self):
        crew = generate_crew(size=4, seed=42)
        resources = {"o2_per_person": 1.0, "h2o_per_person": 3.0,
                     "food_per_person": 3000.0}
        tick_crew(crew, 1, resources, 200.0, 0.3)  # Very cold
        assert any(m.hypothermic for m in crew.members)

    def test_radiation_accumulates(self):
        crew = generate_crew(size=4, seed=42)
        resources = {"o2_per_person": 1.0, "h2o_per_person": 3.0,
                     "food_per_person": 3000.0}
        tick_crew(crew, 1, resources, 293.0, 50.0)  # High radiation
        assert all(m.radiation_dose_msv > 40 for m in crew.members)

    def test_crew_can_die(self):
        crew = generate_crew(size=4, seed=42)
        resources = {"o2_per_person": 0.0, "h2o_per_person": 0.0,
                     "food_per_person": 0.0}
        for sol in range(50):
            tick_crew(crew, sol, resources, 200.0, 5.0)
        assert crew.alive_count < 4

    def test_medic_heals(self):
        crew = generate_crew(size=4, seed=42)
        # Injure someone
        engineer = [m for m in crew.members if m.role == Role.ENGINEER][0]
        engineer.health = 50.0
        engineer.injured = True
        resources = {"o2_per_person": 1.0, "h2o_per_person": 3.0,
                     "food_per_person": 3000.0}
        for sol in range(20):
            tick_crew(crew, sol, resources, 293.0, 0.3)
        # Medic should have helped heal
        assert engineer.health > 50.0

    def test_sols_survived_increments(self):
        crew = generate_crew(size=4, seed=42)
        resources = {"o2_per_person": 1.0, "h2o_per_person": 3.0,
                     "food_per_person": 3000.0}
        for sol in range(10):
            tick_crew(crew, sol, resources, 293.0, 0.3)
        assert all(m.sols_survived == 10 for m in crew.members)


class TestCrewColonyIntegration:
    def test_colony_with_crew(self):
        from colony import create_colony, step, Allocation
        colony = create_colony("Test")
        colony.crew = generate_crew(size=4, seed=42)
        alloc = Allocation(heating_fraction=0.25, isru_fraction=0.40,
                           greenhouse_fraction=0.35)
        for _ in range(10):
            if not colony.alive:
                break
            step(colony, 300.0, 200.0, alloc)
        assert colony.sol >= 5
        assert colony.crew.alive_count >= 1

    def test_crew_death_updates_crew_size(self):
        from colony import create_colony, step, Allocation
        colony = create_colony("Test")
        colony.crew = generate_crew(size=4, seed=42)
        # Kill a crew member manually
        colony.crew.members[0].health = 0
        colony.crew.members[0].alive = False
        alloc = Allocation()
        step(colony, 300.0, 200.0, alloc)
        assert colony.resources.crew_size == 3

    def test_all_crew_dead_kills_colony(self):
        from colony import create_colony, step, Allocation
        colony = create_colony("Test")
        colony.crew = generate_crew(size=4, seed=42)
        for m in colony.crew.members:
            m.health = 0
            m.alive = False
        alloc = Allocation()
        step(colony, 300.0, 200.0, alloc)
        assert not colony.alive
        assert colony.cause_of_death == "all crew lost"

    def test_serialize_includes_crew(self):
        from colony import create_colony, serialize
        colony = create_colony("Test")
        colony.crew = generate_crew(size=4, seed=42)
        data = serialize(colony)
        assert data["crew"] is not None
        assert len(data["crew"]) == 4
