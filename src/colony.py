"""Mars Barn Opus — Colony State

Resources, production, consumption, failure cascade, and colony lifecycle.
The simulation calls step() each sol. If alive is False, the colony is dead.

Uses dataclasses instead of raw dicts. Type-safe, serializable, clean.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional, List, Dict, Any

from config import (
    DEFAULT_CREW_SIZE, DEFAULT_RESERVE_SOLS,
    O2_KG_PER_PERSON_PER_SOL, H2O_L_PER_PERSON_PER_SOL,
    FOOD_KCAL_PER_PERSON_PER_SOL, POWER_BASELINE_KWH_PER_SOL,
    ISRU_O2_KG_PER_SOL, ISRU_H2O_L_PER_SOL, GREENHOUSE_KCAL_PER_SOL,
    ISRU_POWER_KWH_PER_SOL, GREENHOUSE_POWER_KWH_PER_SOL,
    GREENHOUSE_H2O_L_PER_SOL,
    SOLAR_PANEL_AREA_M2, SOLAR_PANEL_EFFICIENCY, MARS_SOL_HOURS,
    POWER_CRITICAL_THRESHOLD_KWH, TEMP_CRITICAL_LOW_K, CASCADE_STEP_SOLS,
    RESOURCE_FACTOR_RANGES, HABITAT_WATER_RECOVERY_FRACTION,
    INITIAL_POWER_RESERVE_KWH, POWER_STORAGE_CAPACITY_KWH,
)


class CascadeState(Enum):
    """Colony failure cascade stages."""
    NOMINAL = "nominal"
    POWER_CRITICAL = "power_critical"
    THERMAL_FAILURE = "thermal_failure"
    WATER_FREEZE = "water_freeze"
    O2_FAILURE = "o2_failure"
    DEAD = "dead"


CASCADE_ORDER = [
    CascadeState.NOMINAL,
    CascadeState.POWER_CRITICAL,
    CascadeState.THERMAL_FAILURE,
    CascadeState.WATER_FREEZE,
    CascadeState.O2_FAILURE,
    CascadeState.DEAD,
]


@dataclass
class WaterBalance:
    """One sol of crew potable-water circulation."""
    gross_draw_liters: float
    recovered_liters: float
    net_tank_draw_liters: float


def crew_water_balance(
    crew_size: int,
    consumption_reduction: float = 0.0,
    recovery_fraction: float = HABITAT_WATER_RECOVERY_FRACTION,
) -> WaterBalance:
    """Calculate gross use, recovered water, and net tank draw."""
    reduction = max(0.0, min(1.0, consumption_reduction))
    recovery = max(0.0, min(1.0, recovery_fraction))
    gross_draw = (
        max(0, crew_size)
        * H2O_L_PER_PERSON_PER_SOL
        * (1.0 - reduction)
    )
    recovered = gross_draw * recovery
    return WaterBalance(
        gross_draw_liters=gross_draw,
        recovered_liters=recovered,
        net_tank_draw_liters=gross_draw - recovered,
    )


@dataclass
class Resources:
    """Colony resource pool."""
    o2_kg: float = 0.0
    h2o_liters: float = 0.0
    food_kcal: float = 0.0
    power_kwh: float = INITIAL_POWER_RESERVE_KWH
    crew_size: int = DEFAULT_CREW_SIZE
    power_capacity_kwh: Optional[float] = None

    def __post_init__(self) -> None:
        self.power_kwh = max(0.0, float(self.power_kwh))
        if self.power_capacity_kwh is None:
            self.power_capacity_kwh = max(
                POWER_STORAGE_CAPACITY_KWH,
                self.power_kwh,
            )
        else:
            self.power_capacity_kwh = max(
                0.0,
                float(self.power_capacity_kwh),
            )
            self.power_kwh = min(
                self.power_kwh,
                self.power_capacity_kwh,
            )

    def store_power(self, generated_kwh: float) -> float:
        """Store non-negative energy up to finite battery capacity."""
        before = min(self.power_kwh, self.power_capacity_kwh)
        self.power_kwh = min(
            self.power_capacity_kwh,
            max(0.0, before + max(0.0, generated_kwh)),
        )
        return self.power_kwh - before

    def enforce_power_capacity(self) -> None:
        """Clamp external transfers to physical storage bounds."""
        self.power_kwh = max(
            0.0,
            min(self.power_kwh, self.power_capacity_kwh),
        )

    def days_of(self, resource: str) -> float:
        """How many sols of a resource remain at current consumption."""
        if self.crew_size <= 0:
            return float('inf')
        per_sol = {
            "o2": O2_KG_PER_PERSON_PER_SOL * self.crew_size,
            "h2o": (
                H2O_L_PER_PERSON_PER_SOL
                * (1.0 - HABITAT_WATER_RECOVERY_FRACTION)
                * self.crew_size
            ),
            "food": FOOD_KCAL_PER_PERSON_PER_SOL * self.crew_size,
            "power": POWER_BASELINE_KWH_PER_SOL,
        }
        current = {"o2": self.o2_kg, "h2o": self.h2o_liters,
                    "food": self.food_kcal, "power": self.power_kwh}
        rate = per_sol.get(resource, 1.0)
        return current.get(resource, 0.0) / rate if rate > 0 else float('inf')

    def lowest_resource_days(self) -> tuple:
        """Return (resource_name, days_remaining) for the most critical resource."""
        resources = ["o2", "h2o", "food", "power"]
        days = [(r, self.days_of(r)) for r in resources]
        return min(days, key=lambda x: x[1])


@dataclass
class Systems:
    """Colony system efficiencies (0.0 to 1.0)."""
    solar_efficiency: float = 1.0
    isru_efficiency: float = 1.0
    greenhouse_efficiency: float = 1.0
    heating_efficiency: float = 1.0
    comms_efficiency: float = 1.0

    def damage(self, system: str, fraction: float) -> None:
        """Reduce a system's efficiency by a fraction."""
        current = getattr(self, f"{system}_efficiency", None)
        if current is not None:
            setattr(self, f"{system}_efficiency",
                    max(0.0, current * (1.0 - fraction)))

    def repair(self, system: str, fraction: float) -> None:
        """Repair a system by a fraction of its lost efficiency."""
        current = getattr(self, f"{system}_efficiency", None)
        if current is not None:
            lost = 1.0 - current
            setattr(self, f"{system}_efficiency",
                    min(1.0, current + lost * fraction))


@dataclass
class Allocation:
    """Governor's power allocation decision for one sol."""
    heating_fraction: float = 0.3
    isru_fraction: float = 0.4
    greenhouse_fraction: float = 0.3
    food_ration: float = 1.0      # 1.0 = normal, 0.75 = reduced, 0.5 = emergency
    repair_target: Optional[str] = None  # System to prioritize for repair

    def validate(self) -> None:
        """Ensure fractions sum to 1.0 and are non-negative."""
        fractions = [
            self.heating_fraction,
            self.isru_fraction,
            self.greenhouse_fraction,
        ]
        fractions = [
            max(0.0, value) if math.isfinite(value) else 0.0
            for value in fractions
        ]
        total = sum(fractions)
        if total <= 0:
            fractions = [1.0 / 3.0] * 3
        else:
            fractions = [value / total for value in fractions]
        (
            self.heating_fraction,
            self.isru_fraction,
            self.greenhouse_fraction,
        ) = fractions
        self.food_ration = max(0.3, min(1.0, self.food_ration))


@dataclass
class Colony:
    """Complete colony state for one sol."""
    name: str
    sol: int = 0
    resources: Resources = field(default_factory=Resources)
    systems: Systems = field(default_factory=Systems)
    cascade_state: CascadeState = CascadeState.NOMINAL
    cascade_counter: int = 0
    alive: bool = True
    cause_of_death: Optional[str] = None
    interior_temp_k: float = 293.15
    location_x: int = 0
    location_y: int = 0
    resource_type: str = "balanced"
    reputation: float = 0.5
    morale: float = 1.0
    cumulative_radiation_msv: float = 0.0
    last_water_balance: WaterBalance = field(
        default_factory=lambda: WaterBalance(0.0, 0.0, 0.0)
    )

    # Crew (optional — None = legacy mode with just crew_size)
    crew: Optional[Any] = None  # crew.Crew instance when enabled
    # Base modules (optional — None = no expansion system)
    base: Optional[Any] = None  # modules.ColonyBase instance when enabled
    # Research lab (optional — None = no research system)
    research: Optional[Any] = None  # research.ResearchLab instance when enabled

    # Tracking
    peak_resources: Optional[Dict[str, float]] = None
    sols_on_rations: int = 0
    trades_completed: int = 0
    sabotages_attempted: int = 0
    sabotages_received: int = 0

    def __post_init__(self) -> None:
        if self.peak_resources is None:
            self.peak_resources = {
                "o2_kg": self.resources.o2_kg,
                "h2o_liters": self.resources.h2o_liters,
                "food_kcal": self.resources.food_kcal,
                "power_kwh": self.resources.power_kwh,
            }


def create_colony(name: str, crew_size: int = DEFAULT_CREW_SIZE,
                  reserve_sols: int = DEFAULT_RESERVE_SOLS,
                  resource_type: str = "balanced",
                  location_x: int = 0, location_y: int = 0) -> Colony:
    """Initialize a colony with starting reserves."""
    factors = RESOURCE_FACTOR_RANGES.get(resource_type,
                                          RESOURCE_FACTOR_RANGES["balanced"])
    resources = Resources(
        o2_kg=crew_size * O2_KG_PER_PERSON_PER_SOL * reserve_sols * factors["o2"],
        h2o_liters=crew_size * H2O_L_PER_PERSON_PER_SOL * reserve_sols * factors["h2o"],
        food_kcal=crew_size * FOOD_KCAL_PER_PERSON_PER_SOL * reserve_sols * factors["food"],
        power_kwh=INITIAL_POWER_RESERVE_KWH * factors["power"],
        power_capacity_kwh=POWER_STORAGE_CAPACITY_KWH * factors["power"],
        crew_size=crew_size,
    )
    return Colony(
        name=name,
        resources=resources,
        resource_type=resource_type,
        location_x=location_x,
        location_y=location_y,
    )


def produce(
    colony: Colony,
    solar_irradiance_w_m2: float,
    allocation: Allocation,
    defer_power_capacity: bool = False,
) -> None:
    """Apply one sol of resource production based on governor allocation.

    Power allocation determines how much goes to each system:
    - Heating: maintains habitat temperature
    - ISRU: produces O2 and H2O
    - Greenhouse: produces food (requires water)

    Generated energy is available to same-sol loads before residual energy is
    capped. step() defers that storage boundary until all sol loads finish.
    """
    r = colony.resources
    s = colony.systems
    factors = RESOURCE_FACTOR_RANGES.get(colony.resource_type,
                                          RESOURCE_FACTOR_RANGES["balanced"])

    # Research bonuses (if research is enabled)
    research_solar = 0.0
    research_isru = 0.0
    research_food = 0.0
    if colony.research is not None:
        research_solar = colony.research.get_effect("solar_efficiency_bonus")
        research_isru = colony.research.get_effect("isru_production_bonus")
        research_food = colony.research.get_effect("food_production_bonus")

    # Module bonuses (if base expansion is enabled)
    solar_bonus = 1.0 + research_solar
    isru_bonus = 1.0 + research_isru
    gh_bonus = 1.0 + research_food
    repair_bonus = 0.0
    passive_h2o = 0.0
    if colony.base is not None:
        solar_bonus += colony.base.get_bonus("solar_bonus")
        isru_bonus += colony.base.get_bonus("isru_bonus")
        gh_bonus += colony.base.get_bonus("greenhouse_bonus")
        repair_bonus = colony.base.get_bonus("repair_bonus")
        passive_h2o = colony.base.get_bonus("passive_h2o")

    # Solar power generation (with module bonus)
    raw_kwh = (solar_irradiance_w_m2 * SOLAR_PANEL_AREA_M2
               * SOLAR_PANEL_EFFICIENCY * MARS_SOL_HOURS / 1000.0)
    generated_kwh = raw_kwh * s.solar_efficiency * solar_bonus
    r.power_kwh = max(0.0, r.power_kwh) + max(0.0, generated_kwh)

    # Allocate power — allocation fractions directly scale production
    isru_frac = allocation.isru_fraction
    gh_frac = allocation.greenhouse_fraction

    # ISRU production (with module bonus)
    discretionary_power = max(0.0, r.power_kwh - POWER_BASELINE_KWH_PER_SOL)
    requested_isru_kwh = ISRU_POWER_KWH_PER_SOL * min(1.5, isru_frac * 2.0)
    used_isru_kwh = min(discretionary_power, requested_isru_kwh)
    r.power_kwh -= used_isru_kwh
    discretionary_power -= used_isru_kwh
    isru_scale = (
        min(1.5, isru_frac * 2.0) * used_isru_kwh / requested_isru_kwh
        if requested_isru_kwh > 0 else 0.0
    )
    r.o2_kg += ISRU_O2_KG_PER_SOL * s.isru_efficiency * isru_scale * factors["o2"] * isru_bonus
    r.h2o_liters += ISRU_H2O_L_PER_SOL * s.isru_efficiency * isru_scale * factors["h2o"] * isru_bonus

    # Passive water from water extractor module
    r.h2o_liters += passive_h2o

    # Greenhouse production (with module bonus)
    requested_gh_scale = min(1.5, gh_frac * 2.0)
    requested_gh_kwh = GREENHOUSE_POWER_KWH_PER_SOL * requested_gh_scale
    used_gh_kwh = min(discretionary_power, requested_gh_kwh)
    power_scale = (used_gh_kwh / requested_gh_kwh
                   if requested_gh_kwh > 0 else 0.0)
    requested_h2o = GREENHOUSE_H2O_L_PER_SOL * requested_gh_scale
    water_scale = (min(1.0, r.h2o_liters / requested_h2o)
                   if requested_h2o > 0 else 0.0)
    gh_scale = requested_gh_scale * min(power_scale, water_scale)
    actual_gh_kwh = requested_gh_kwh * min(power_scale, water_scale)
    actual_gh_h2o = requested_h2o * min(power_scale, water_scale)
    r.power_kwh -= actual_gh_kwh
    r.h2o_liters -= actual_gh_h2o
    r.food_kcal += GREENHOUSE_KCAL_PER_SOL * s.greenhouse_efficiency * gh_scale * factors["food"] * gh_bonus

    # Repair (with module bonus)
    if allocation.repair_target and allocation.repair_target != "none":
        repair_rate = 0.05 * (1.0 + repair_bonus)
        s.repair(allocation.repair_target, repair_rate)

    if not defer_power_capacity:
        r.enforce_power_capacity()


def consume(colony: Colony, allocation: Allocation) -> None:
    """Deduct one sol of crew consumption."""
    r = colony.resources
    crew = r.crew_size

    r.o2_kg = max(0.0, r.o2_kg - crew * O2_KG_PER_PERSON_PER_SOL)
    h2o_reduction = (
        colony.research.get_effect("h2o_consumption_reduction")
        if colony.research is not None else 0.0
    )
    water_balance = crew_water_balance(
        crew,
        consumption_reduction=h2o_reduction,
    )
    colony.last_water_balance = water_balance
    r.h2o_liters = max(
        0.0,
        r.h2o_liters - water_balance.net_tank_draw_liters,
    )
    r.food_kcal = max(0.0,
                      r.food_kcal - crew * FOOD_KCAL_PER_PERSON_PER_SOL * allocation.food_ration)
    r.power_kwh = max(0.0, r.power_kwh - POWER_BASELINE_KWH_PER_SOL)

    if allocation.food_ration < 0.9:
        colony.sols_on_rations += 1
        colony.morale = max(0.1, colony.morale - 0.01 * (1.0 - allocation.food_ration))


def advance_cascade(colony: Colony) -> None:
    """Advance the failure cascade state machine.

    Cascade: nominal -> power_critical -> thermal_failure -> water_freeze -> o2_failure -> dead
    Each transition takes CASCADE_STEP_SOLS sols.
    Recovery is possible if power is restored before thermal failure.
    """
    if colony.cascade_state == CascadeState.DEAD:
        return

    r = colony.resources

    # Immediate life-support failure outranks slower cascade transitions.
    if r.o2_kg <= 0:
        colony.cascade_state = CascadeState.DEAD
        colony.cause_of_death = "O2 depletion"
        colony.alive = False
        return
    if r.h2o_liters <= 0:
        colony.cascade_state = CascadeState.DEAD
        colony.cause_of_death = "dehydration"
        colony.alive = False
        return
    if r.food_kcal <= 0:
        colony.cascade_state = CascadeState.DEAD
        colony.cause_of_death = "starvation"
        colony.alive = False
        return

    # Check for recovery
    if (r.power_kwh > POWER_CRITICAL_THRESHOLD_KWH
            and colony.cascade_state in (CascadeState.POWER_CRITICAL,
                                          CascadeState.THERMAL_FAILURE)):
        colony.cascade_state = CascadeState.NOMINAL
        colony.cascade_counter = 0
        return

    # Enter power critical
    if r.power_kwh <= 0 and colony.cascade_state == CascadeState.NOMINAL:
        colony.cascade_state = CascadeState.POWER_CRITICAL
        colony.cascade_counter = 0
        return  # Don't advance further on the same sol we enter crisis

    # Advance cascade
    if colony.cascade_state == CascadeState.POWER_CRITICAL:
        colony.cascade_counter += 1
        if colony.cascade_counter >= CASCADE_STEP_SOLS:
            colony.cascade_state = CascadeState.THERMAL_FAILURE
            colony.cascade_counter = 0

    elif colony.cascade_state == CascadeState.THERMAL_FAILURE:
        if colony.interior_temp_k < TEMP_CRITICAL_LOW_K:
            colony.cascade_counter += 1
            if colony.cascade_counter >= CASCADE_STEP_SOLS:
                colony.cascade_state = CascadeState.WATER_FREEZE
                colony.cascade_counter = 0

    elif colony.cascade_state == CascadeState.WATER_FREEZE:
        colony.cascade_counter += 1
        if colony.cascade_counter >= CASCADE_STEP_SOLS:
            colony.cascade_state = CascadeState.O2_FAILURE
            colony.cascade_counter = 0

    elif colony.cascade_state == CascadeState.O2_FAILURE:
        colony.cascade_state = CascadeState.DEAD
        colony.cause_of_death = "cascade: power -> thermal -> water -> O2"
        colony.alive = False

def step(colony: Colony, solar_irradiance_w_m2: float,
         exterior_temp_k: float, allocation: Allocation,
         active_events: Optional[list] = None,
         radiation_msv: float = 0.0) -> None:
    """Advance colony by one sol. THE main entry point.

    Args:
        colony: Colony state to mutate
        solar_irradiance_w_m2: Current solar irradiance
        exterior_temp_k: External temperature
        allocation: Governor's power allocation decision
        active_events: List of active event dicts
        radiation_msv: Radiation dose this sol
    """
    if not colony.alive:
        return

    colony.sol += 1
    allocation.validate()

    # Apply event effects to systems
    event_radiation_msv = sum(
        max(0.0, event.get("effects", {}).get("radiation_msv", 0.0))
        for event in (active_events or [])
    )
    if active_events:
        apply_events(colony, active_events)

    # Production and consumption
    produce(
        colony,
        solar_irradiance_w_m2,
        allocation,
        defer_power_capacity=True,
    )
    consume(colony, allocation)

    # Thermal update
    # Habitat has baseline RTG heating (~5 kW nuclear) plus electrical heating
    # from power allocation. Heating fraction determines how much electrical
    # power supplements the RTG. This matches real Mars mission architecture.
    from mars import required_heating_kw as _required_heating
    # Kilopower-class fission reactor (NASA design: 10 kW each, 4 units)
    rtg_baseline_kw = 40.0 * colony.systems.heating_efficiency
    needed_kw = _required_heating(exterior_temp_k, solar_irradiance_w_m2)
    max_electrical_heating_kw = (
        colony.resources.power_kwh * allocation.heating_fraction
        / MARS_SOL_HOURS
    )
    electrical_heating_kw = min(
        needed_kw - rtg_baseline_kw,
        max_electrical_heating_kw,
    )
    total_heating_kw = rtg_baseline_kw + max(0.0, electrical_heating_kw)

    # Deduct electrical heating from power reserves
    heating_kwh_used = max(0.0, electrical_heating_kw) * MARS_SOL_HOURS
    colony.resources.power_kwh = max(0.0, colony.resources.power_kwh - heating_kwh_used)

    from mars import compute_thermal
    thermal = compute_thermal(exterior_temp_k, solar_irradiance_w_m2,
                              colony.interior_temp_k, total_heating_kw)
    colony.interior_temp_k = thermal.interior_temp_k

    # Radiation protections compose multiplicatively.
    research_reduction = (
        colony.research.get_effect("radiation_reduction")
        if colony.research is not None else 0.0
    )
    shelter_reduction = (
        colony.base.get_bonus("radiation_shielding")
        if colony.base is not None else 0.0
    )
    effective_radiation_msv = (
        radiation_msv + event_radiation_msv
    ) * max(0.0, 1.0 - research_reduction) * max(
        0.0, 1.0 - shelter_reduction
    )
    colony.cumulative_radiation_msv += effective_radiation_msv

    # Crew simulation (if enabled)
    if colony.crew is not None:
        from crew import tick_crew
        r = colony.resources
        crew_count = colony.crew.alive_count
        if crew_count > 0:
            resources_per_person = {
                "o2_per_person": r.o2_kg / crew_count,
                "h2o_per_person": r.h2o_liters / crew_count,
                "food_per_person": r.food_kcal / crew_count,
            }
        else:
            resources_per_person = {"o2_per_person": 0, "h2o_per_person": 0,
                                    "food_per_person": 0}

        crew_events = tick_crew(
            colony.crew, colony.sol, resources_per_person,
            colony.interior_temp_k, effective_radiation_msv,
        )

        # Sync crew count back to resources
        colony.resources.crew_size = colony.crew.alive_count
        colony.morale = colony.crew.avg_morale / 100.0

        # All crew dead = colony dead
        if colony.crew.alive_count == 0:
            colony.alive = False
            colony.cause_of_death = "all crew lost"
            colony.cascade_state = CascadeState.DEAD

    # Base expansion (if enabled)
    if colony.base is not None:
        base_events = colony.base.tick(colony.sol)
        # Governor decides whether to start a new build
        if colony.base.construction is None:
            from modules import governor_build_decision
            crisis = 0.0  # Simplified — full crisis calc is in governor.py
            if colony.cascade_state != CascadeState.NOMINAL:
                crisis = 0.7
            lowest, days = colony.resources.lowest_resource_days()
            if days < 10:
                crisis = max(crisis, 0.6)
            build_choice = governor_build_decision(
                colony.base, colony.resources, colony.sol, crisis)
            if build_choice:
                colony.base.start_construction(
                    build_choice, colony.resources, colony.sol)

    # Research (if enabled)
    if colony.research is not None:
        research_events = colony.research.tick(colony.sol)
        if colony.research.active is None:
            from research import governor_research_decision
            crisis = 0.0
            if colony.cascade_state != CascadeState.NOMINAL:
                crisis = 0.7
            lowest_r, days_r = colony.resources.lowest_resource_days()
            if days_r < 10:
                crisis = max(crisis, 0.6)
            choice = governor_research_decision(
                colony.research, colony.resources, colony.sol, crisis)
            if choice:
                scientist_bonus = 0.0
                if colony.crew:
                    from crew import Role
                    scientists = [m for m in colony.crew.alive_members
                                  if m.role == Role.SCIENTIST]
                    if scientists:
                        scientist_bonus = scientists[0].effectiveness
                colony.research.start_research(
                    choice, colony.resources, scientist_bonus)

    # Only residual energy crosses the end-of-sol storage boundary.
    colony.resources.enforce_power_capacity()

    # Cascade
    advance_cascade(colony)

    # Update peak tracking
    if colony.peak_resources:
        colony.peak_resources["o2_kg"] = max(colony.peak_resources["o2_kg"],
                                              colony.resources.o2_kg)
        colony.peak_resources["h2o_liters"] = max(colony.peak_resources["h2o_liters"],
                                                   colony.resources.h2o_liters)
        colony.peak_resources["food_kcal"] = max(colony.peak_resources["food_kcal"],
                                                  colony.resources.food_kcal)
        colony.peak_resources["power_kwh"] = max(colony.peak_resources["power_kwh"],
                                                  colony.resources.power_kwh)


def apply_events(colony: Colony, events: list) -> None:
    """Apply permanent event effects once, at event onset."""
    for event in events:
        if not event.get("onset", True):
            continue
        fx = event.get("effects", {})
        if "solar_damage" in fx:
            colony.systems.damage("solar", fx["solar_damage"])
        if "isru_damage" in fx:
            colony.systems.damage("isru", fx["isru_damage"])
        if "greenhouse_damage" in fx:
            colony.systems.damage("greenhouse", fx["greenhouse_damage"])
        if "heating_damage" in fx:
            colony.systems.damage("heating", fx["heating_damage"])
        if "comms_damage" in fx:
            colony.systems.damage("comms", fx["comms_damage"])
        if "solar_repair" in fx:
            colony.systems.repair("solar", fx["solar_repair"])
        if "water_loss" in fx:
            colony.resources.h2o_liters = max(0.0,
                colony.resources.h2o_liters - fx["water_loss"])
        if "o2_loss" in fx:
            colony.resources.o2_kg = max(0.0,
                colony.resources.o2_kg - fx["o2_loss"])
        if "power_loss" in fx:
            colony.resources.power_kwh = max(0.0,
                colony.resources.power_kwh - fx["power_loss"])
        if "food_loss" in fx:
            colony.resources.food_kcal = max(0.0,
                colony.resources.food_kcal - fx["food_loss"])


def serialize(colony: Colony) -> dict:
    """Serialize colony to JSON-safe dict."""
    return {
        "name": colony.name,
        "sol": colony.sol,
        "alive": colony.alive,
        "cause_of_death": colony.cause_of_death,
        "cascade_state": colony.cascade_state.value,
        "interior_temp_k": round(colony.interior_temp_k, 2),
        "morale": round(colony.morale, 3),
        "reputation": round(colony.reputation, 3),
        "cumulative_radiation_msv": round(colony.cumulative_radiation_msv, 2),
        "sols_on_rations": colony.sols_on_rations,
        "trades_completed": colony.trades_completed,
        "location": {"x": colony.location_x, "y": colony.location_y},
        "resource_type": colony.resource_type,
        "resources": {
            "o2_kg": round(colony.resources.o2_kg, 2),
            "h2o_liters": round(colony.resources.h2o_liters, 2),
            "food_kcal": round(colony.resources.food_kcal, 1),
            "power_kwh": round(colony.resources.power_kwh, 2),
            "power_capacity_kwh": round(
                colony.resources.power_capacity_kwh,
                2,
            ),
            "crew_size": colony.resources.crew_size,
        },
        "water_balance": {
            "gross_draw_liters": round(
                colony.last_water_balance.gross_draw_liters,
                3,
            ),
            "recovered_liters": round(
                colony.last_water_balance.recovered_liters,
                3,
            ),
            "net_tank_draw_liters": round(
                colony.last_water_balance.net_tank_draw_liters,
                3,
            ),
        },
        "systems": {
            "solar": round(colony.systems.solar_efficiency, 3),
            "isru": round(colony.systems.isru_efficiency, 3),
            "greenhouse": round(colony.systems.greenhouse_efficiency, 3),
            "heating": round(colony.systems.heating_efficiency, 3),
            "comms": round(colony.systems.comms_efficiency, 3),
        },
        "peak_resources": colony.peak_resources,
        "crew": colony.crew.serialize() if colony.crew else None,
        "base": colony.base.serialize() if colony.base else None,
        "research": colony.research.serialize() if colony.research else None,
    }
