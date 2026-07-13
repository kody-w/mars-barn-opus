"""Tests for colony state, resources, production, consumption, cascades."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from colony import (
    Colony, Resources, Systems, Allocation, CascadeState,
    create_colony, produce, consume, advance_cascade, step, apply_events,
    serialize, crew_water_balance,
)
from config import (
    O2_KG_PER_PERSON_PER_SOL, H2O_L_PER_PERSON_PER_SOL,
    FOOD_KCAL_PER_PERSON_PER_SOL, POWER_BASELINE_KWH_PER_SOL,
    DEFAULT_CREW_SIZE, POWER_CRITICAL_THRESHOLD_KWH,
    HABITAT_WATER_RECOVERY_FRACTION, INITIAL_POWER_RESERVE_KWH,
    POWER_STORAGE_CAPACITY_KWH,
)


class TestResources:
    def test_create_with_defaults(self):
        r = Resources()
        assert r.crew_size == DEFAULT_CREW_SIZE
        assert r.power_kwh == INITIAL_POWER_RESERVE_KWH
        assert r.power_capacity_kwh == POWER_STORAGE_CAPACITY_KWH

    def test_first_five_positional_arguments_remain_compatible(self):
        r = Resources(1.0, 2.0, 3.0, 4.0, 6)
        assert r.power_kwh == 4.0
        assert r.crew_size == 6
        assert r.power_capacity_kwh == POWER_STORAGE_CAPACITY_KWH

    def test_default_capacity_expands_for_custom_initial_power(self):
        r = Resources(power_kwh=2000.0)
        assert r.power_kwh == 2000.0
        assert r.power_capacity_kwh == 2000.0

    def test_days_of_calculation(self):
        r = Resources(o2_kg=10.0, crew_size=1)
        days = r.days_of("o2")
        expected = 10.0 / O2_KG_PER_PERSON_PER_SOL
        assert abs(days - expected) < 0.01

    def test_lowest_resource(self):
        r = Resources(o2_kg=1.0, h2o_liters=100.0, food_kcal=100000.0,
                      power_kwh=500.0, crew_size=1)
        name, days = r.lowest_resource_days()
        assert name == "o2"


class TestSystems:
    def test_damage(self):
        s = Systems()
        s.damage("solar", 0.5)
        assert s.solar_efficiency == 0.5

    def test_repair(self):
        s = Systems(solar_efficiency=0.5)
        s.repair("solar", 0.5)  # Repairs 50% of lost efficiency
        assert abs(s.solar_efficiency - 0.75) < 0.001

    def test_damage_floors_at_zero(self):
        s = Systems()
        s.damage("solar", 1.0)
        assert s.solar_efficiency == 0.0
        s.damage("solar", 0.5)
        assert s.solar_efficiency == 0.0

    def test_repair_caps_at_one(self):
        s = Systems()
        s.repair("solar", 0.5)
        assert s.solar_efficiency == 1.0


class TestAllocation:
    def test_validate_normalizes(self):
        a = Allocation(heating_fraction=1.0, isru_fraction=1.0,
                       greenhouse_fraction=1.0)
        a.validate()
        total = a.heating_fraction + a.isru_fraction + a.greenhouse_fraction
        assert abs(total - 1.0) < 0.001

    def test_validate_clamps_ration(self):
        a = Allocation(food_ration=0.1)
        a.validate()
        assert a.food_ration == 0.3  # Minimum

        a = Allocation(food_ration=2.0)
        a.validate()
        assert a.food_ration == 1.0  # Maximum

    def test_validate_enforces_nonnegative_simplex(self):
        a = Allocation(
            heating_fraction=-1.0,
            isru_fraction=1.0,
            greenhouse_fraction=1.0,
        )
        a.validate()
        fractions = [
            a.heating_fraction,
            a.isru_fraction,
            a.greenhouse_fraction,
        ]
        assert all(value >= 0 for value in fractions)
        assert abs(sum(fractions) - 1.0) < 1e-9


class TestColonyCreation:
    def test_create_balanced(self):
        c = create_colony("Test", resource_type="balanced")
        assert c.alive
        assert c.resources.crew_size == DEFAULT_CREW_SIZE

    def test_create_water_rich(self):
        balanced = create_colony("A", resource_type="balanced")
        water_rich = create_colony("B", resource_type="water_rich")
        assert water_rich.resources.h2o_liters > balanced.resources.h2o_liters

    def test_create_harsh(self):
        balanced = create_colony("A", resource_type="balanced")
        harsh = create_colony("B", resource_type="harsh")
        assert harsh.resources.h2o_liters < balanced.resources.h2o_liters


class TestProduction:
    def test_solar_power_generation(self):
        c = create_colony("Test")
        c.resources.power_kwh = c.resources.power_capacity_kwh / 2
        initial_power = c.resources.power_kwh
        a = Allocation(
            isru_fraction=0.0,
            greenhouse_fraction=0.0,
            heating_fraction=1.0,
        )
        produce(c, 300.0, a)
        assert c.resources.power_kwh > initial_power

    def test_solar_generation_cannot_exceed_storage_capacity(self):
        c = create_colony("Test")
        c.resources.power_kwh = c.resources.power_capacity_kwh
        produce(c, 300.0, Allocation(
            isru_fraction=0.0,
            greenhouse_fraction=0.0,
            heating_fraction=1.0,
        ))
        assert c.resources.power_kwh == c.resources.power_capacity_kwh

    def test_no_sun_no_power(self):
        c = create_colony("Test")
        c.resources.power_kwh = 0.0
        a = Allocation()
        produce(c, 0.0, a)
        # Power should still be ~0 (no generation from panels)
        assert c.resources.power_kwh < 10.0

    def test_isru_produces_o2_h2o(self):
        c = create_colony("Test")
        c.resources.power_kwh = 500.0
        initial_o2 = c.resources.o2_kg
        initial_h2o = c.resources.h2o_liters
        a = Allocation(isru_fraction=0.8, greenhouse_fraction=0.1, heating_fraction=0.1)
        produce(c, 300.0, a)
        assert c.resources.o2_kg > initial_o2
        assert c.resources.h2o_liters > initial_h2o

    def test_greenhouse_produces_food(self):
        c = create_colony("Test")
        c.resources.power_kwh = 500.0
        c.resources.h2o_liters = 100.0
        initial_food = c.resources.food_kcal
        a = Allocation(greenhouse_fraction=0.8, isru_fraction=0.1, heating_fraction=0.1)
        produce(c, 300.0, a)
        assert c.resources.food_kcal > initial_food

    def test_powered_production_debits_power_and_greenhouse_water(self):
        c = create_colony("Test")
        c.resources.power_kwh = 500.0
        c.resources.h2o_liters = 100.0
        initial_power = c.resources.power_kwh
        initial_h2o = c.resources.h2o_liters
        a = Allocation(
            greenhouse_fraction=0.5,
            isru_fraction=0.5,
            heating_fraction=0.0,
        )
        produce(c, 0.0, a)
        assert c.resources.power_kwh < initial_power
        assert c.resources.h2o_liters != initial_h2o

    def test_zero_discretionary_power_stops_powered_production(self):
        c = create_colony("Test")
        c.resources.power_kwh = POWER_BASELINE_KWH_PER_SOL
        initial = (
            c.resources.o2_kg,
            c.resources.h2o_liters,
            c.resources.food_kcal,
        )
        produce(c, 0.0, Allocation())
        assert (
            c.resources.o2_kg,
            c.resources.h2o_liters,
            c.resources.food_kcal,
        ) == initial

    def test_isru_scales_exactly_to_available_power(self):
        c = create_colony("Test")
        c.resources.power_kwh = 60.0
        initial_o2 = c.resources.o2_kg
        initial_h2o = c.resources.h2o_liters
        produce(c, 0.0, Allocation(
            heating_fraction=0.0,
            isru_fraction=1.0,
            greenhouse_fraction=0.0,
        ))
        assert abs(c.resources.o2_kg - initial_o2 - 2.5) < 1e-9
        assert abs(c.resources.h2o_liters - initial_h2o - 6.0) < 1e-9
        assert abs(c.resources.power_kwh - 30.0) < 1e-9

    def test_greenhouse_scales_to_power_and_water_limits(self):
        c = create_colony("Test")
        c.resources.power_kwh = 45.0
        c.resources.h2o_liters = 2.5
        initial_food = c.resources.food_kcal
        produce(c, 0.0, Allocation(
            heating_fraction=0.0,
            isru_fraction=0.0,
            greenhouse_fraction=1.0,
        ))
        assert abs(c.resources.food_kcal - initial_food - 7500.0) < 1e-9
        assert abs(c.resources.h2o_liters) < 1e-9
        assert abs(c.resources.power_kwh - 30.0) < 1e-9


class TestConsumption:
    def test_water_recovery_mass_balance_and_tank_draw(self):
        balance = crew_water_balance(DEFAULT_CREW_SIZE)
        expected_gross = (
            DEFAULT_CREW_SIZE * H2O_L_PER_PERSON_PER_SOL
        )
        assert balance.gross_draw_liters == expected_gross
        assert balance.recovered_liters == (
            expected_gross * HABITAT_WATER_RECOVERY_FRACTION
        )
        assert balance.gross_draw_liters == (
            balance.recovered_liters + balance.net_tank_draw_liters
        )

        c = create_colony("Test")
        initial = c.resources.h2o_liters
        consume(c, Allocation())
        assert initial - c.resources.h2o_liters == (
            balance.net_tank_draw_liters
        )

    def test_crew_consumes_resources(self):
        c = create_colony("Test")
        initial_o2 = c.resources.o2_kg
        a = Allocation(food_ration=1.0)
        consume(c, a)
        assert c.resources.o2_kg < initial_o2

    def test_reduced_rations(self):
        c1 = create_colony("Full")
        c2 = create_colony("Rationed")
        consume(c1, Allocation(food_ration=1.0))
        consume(c2, Allocation(food_ration=0.5))
        assert c2.resources.food_kcal > c1.resources.food_kcal

    def test_rations_affect_morale(self):
        c = create_colony("Test")
        consume(c, Allocation(food_ration=0.5))
        assert c.morale < 1.0
        assert c.sols_on_rations == 1

    def test_resources_floor_at_zero(self):
        c = create_colony("Test")
        c.resources.o2_kg = 0.1
        consume(c, Allocation())
        assert c.resources.o2_kg == 0.0


class TestCascade:
    def test_nominal_stays_nominal(self):
        c = create_colony("Test")
        c.resources.power_kwh = 100.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.NOMINAL

    def test_zero_power_triggers_cascade(self):
        c = create_colony("Test")
        c.resources.power_kwh = 0.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.POWER_CRITICAL

    def test_full_cascade_kills_colony(self):
        c = create_colony("Test")
        c.resources.power_kwh = 0.0
        c.interior_temp_k = 200.0  # Below critical

        # Step through cascade
        advance_cascade(c)  # -> POWER_CRITICAL, counter=0
        assert c.cascade_state == CascadeState.POWER_CRITICAL

        advance_cascade(c)  # counter=1 -> THERMAL_FAILURE
        assert c.cascade_state == CascadeState.THERMAL_FAILURE

        advance_cascade(c)  # counter=1 -> WATER_FREEZE
        assert c.cascade_state == CascadeState.WATER_FREEZE

        advance_cascade(c)  # counter=1 -> O2_FAILURE
        assert c.cascade_state == CascadeState.O2_FAILURE

        advance_cascade(c)  # -> DEAD
        assert c.cascade_state == CascadeState.DEAD
        assert not c.alive

    def test_power_recovery_stops_cascade(self):
        c = create_colony("Test")
        c.resources.power_kwh = 0.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.POWER_CRITICAL

        c.resources.power_kwh = 100.0  # Restore power
        advance_cascade(c)
        assert c.cascade_state == CascadeState.NOMINAL

    def test_o2_depletion_instant_death(self):
        c = create_colony("Test")
        c.resources.o2_kg = 0.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.DEAD
        assert c.cause_of_death == "O2 depletion"

    def test_starvation_instant_death(self):
        c = create_colony("Test")
        c.resources.food_kcal = 0.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.DEAD
        assert c.cause_of_death == "starvation"

    def test_h2o_depletion_instant_death(self):
        c = create_colony("Test")
        c.resources.h2o_liters = 0.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.DEAD
        assert c.alive is False
        assert c.cause_of_death == "dehydration"

    def test_life_support_death_outranks_power_cascade(self):
        c = create_colony("Test")
        c.resources.power_kwh = 0.0
        c.resources.o2_kg = 0.0
        advance_cascade(c)
        assert c.cascade_state == CascadeState.DEAD
        assert c.alive is False
        assert c.cause_of_death == "O2 depletion"


class TestApplyEvents:
    def test_permanent_damage_applies_on_event_onset_only(self):
        c = create_colony("Test")
        event = {
            "onset": True,
            "effects": {"solar_damage": 0.5},
        }
        apply_events(c, [event])
        after_onset = c.systems.solar_efficiency
        event["onset"] = False
        apply_events(c, [event])
        assert c.systems.solar_efficiency == after_onset

    def test_solar_damage(self):
        c = create_colony("Test")
        events = [{"effects": {"solar_damage": 0.5}}]
        apply_events(c, events)
        assert c.systems.solar_efficiency == 0.5

    def test_repair_radiation_and_comms_effects(self):
        c = create_colony("Test")
        c.systems.solar_efficiency = 0.5
        apply_events(c, [{"effects": {
            "solar_repair": 0.5,
            "radiation_msv": 12.5,
            "comms_damage": 0.2,
        }}])
        assert c.systems.solar_efficiency == 0.75
        assert c.cumulative_radiation_msv == 0.0
        assert c.systems.comms_efficiency == 0.8

    def test_water_loss(self):
        c = create_colony("Test")
        initial = c.resources.h2o_liters
        events = [{"effects": {"water_loss": 50.0}}]
        apply_events(c, events)
        assert c.resources.h2o_liters == initial - 50.0

    def test_multiple_events_stack(self):
        c = create_colony("Test")
        events = [
            {"effects": {"solar_damage": 0.2}},
            {"effects": {"solar_damage": 0.3}},
        ]
        apply_events(c, events)
        # 1.0 * 0.8 * 0.7 = 0.56
        assert abs(c.systems.solar_efficiency - 0.56) < 0.01


class TestStep:
    def test_step_advances_sol(self):
        c = create_colony("Test")
        a = Allocation()
        step(c, 300.0, 200.0, a)
        assert c.sol == 1

    def test_step_dead_colony_noop(self):
        c = create_colony("Test")
        c.alive = False
        step(c, 300.0, 200.0, Allocation())
        assert c.sol == 0

    def test_step_multiple_sols(self):
        """Colony should survive several sols with decent conditions."""
        c = create_colony("Test")
        a = Allocation(heating_fraction=0.2, isru_fraction=0.5,
                       greenhouse_fraction=0.3)
        for _ in range(50):
            if not c.alive:
                break
            step(c, 300.0, 200.0, a)
        # Should survive at least 10 sols with good conditions
        assert c.sol >= 10

    def test_full_battery_sun_serves_same_sol_loads(self):
        sunny = create_colony("Sunny")
        dark = create_colony("Dark")
        sunny.resources.power_kwh = sunny.resources.power_capacity_kwh
        dark.resources.power_kwh = dark.resources.power_capacity_kwh
        allocation = {
            "heating_fraction": 0.0,
            "isru_fraction": 1.0,
            "greenhouse_fraction": 0.0,
        }

        step(
            sunny,
            solar_irradiance_w_m2=300.0,
            exterior_temp_k=293.15,
            allocation=Allocation(**allocation),
        )
        step(
            dark,
            solar_irradiance_w_m2=0.0,
            exterior_temp_k=293.15,
            allocation=Allocation(**allocation),
        )

        assert sunny.resources.power_kwh > dark.resources.power_kwh
        assert sunny.resources.power_kwh <= sunny.resources.power_capacity_kwh
        assert dark.resources.power_kwh <= dark.resources.power_capacity_kwh

    def test_step_caps_residual_power_at_storage_boundary(self):
        c = create_colony("Test")
        step(
            c,
            solar_irradiance_w_m2=10000.0,
            exterior_temp_k=293.15,
            allocation=Allocation(
                heating_fraction=1.0,
                isru_fraction=0.0,
                greenhouse_fraction=0.0,
            ),
        )
        assert c.resources.power_kwh == c.resources.power_capacity_kwh

    def test_heating_kw_is_billed_for_full_sol(self):
        import mars

        c = create_colony("Test")
        c.resources.power_kwh = 100.0
        original = mars.required_heating_kw
        mars.required_heating_kw = lambda exterior, irradiance: 42.0
        try:
            step(
                c,
                solar_irradiance_w_m2=0.0,
                exterior_temp_k=250.0,
                allocation=Allocation(
                    heating_fraction=1.0,
                    isru_fraction=0.0,
                    greenhouse_fraction=0.0,
                ),
            )
        finally:
            mars.required_heating_kw = original

        expected = 100.0 - POWER_BASELINE_KWH_PER_SOL - 2.0 * 24.66
        assert abs(c.resources.power_kwh - expected) < 1e-9

    def test_flare_radiation_is_counted_once(self):
        from mars import radiation_dose

        c = create_colony("Test")
        background = radiation_dose(
            sol_count=1,
            in_habitat=True,
            solar_flare=False,
        )
        step(
            c,
            solar_irradiance_w_m2=300.0,
            exterior_temp_k=250.0,
            allocation=Allocation(),
            active_events=[{"effects": {"radiation_msv": 25.0}}],
            radiation_msv=background,
        )
        assert abs(c.cumulative_radiation_msv - (background + 25.0)) < 1e-9


class TestSerialize:
    def test_serializable(self):
        c = create_colony("Test")
        d = serialize(c)
        assert d["name"] == "Test"
        assert "resources" in d
        assert "systems" in d
        assert isinstance(d["resources"]["o2_kg"], float)

    def test_roundtrip_values(self):
        c = create_colony("Test")
        c.sol = 42
        c.morale = 0.75
        d = serialize(c)
        assert d["sol"] == 42
        assert d["morale"] == 0.75
