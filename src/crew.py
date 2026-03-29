"""Mars Barn Opus — Crew Simulation

Individual crew members with names, roles, health, fatigue, skills,
and radiation tracking. Not just crew_size=4 — actual people.

Health degrades from radiation, starvation, dehydration, cold.
Skills affect colony production. Crew can die individually.
Morale is personal and affects performance.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

from config import (
    O2_KG_PER_PERSON_PER_SOL, H2O_L_PER_PERSON_PER_SOL,
    FOOD_KCAL_PER_PERSON_PER_SOL, MARS_SURFACE_RADIATION_MSV_PER_SOL,
)


class Role(Enum):
    COMMANDER = "commander"
    ENGINEER = "engineer"
    SCIENTIST = "scientist"
    MEDIC = "medic"
    PILOT = "pilot"
    GEOLOGIST = "geologist"


# Role -> which colony system they boost
ROLE_BONUSES = {
    Role.COMMANDER: {"leadership": 0.10, "crisis_response": 0.15},
    Role.ENGINEER: {"isru": 0.20, "solar": 0.15, "repair": 0.20},
    Role.SCIENTIST: {"greenhouse": 0.20, "research": 0.15},
    Role.MEDIC: {"crew_health": 0.25, "morale": 0.10},
    Role.PILOT: {"comms": 0.15, "evac": 0.20},
    Role.GEOLOGIST: {"terrain_bonus": 0.15, "water_finding": 0.20},
}

# Names for generated crew (first name, last initial)
CREW_NAMES = [
    "Chen W.", "Rodriguez M.", "Okafor A.", "Johansson K.",
    "Patel R.", "Nakamura Y.", "Kowalski T.", "Al-Rashid S.",
    "Dubois L.", "Kim J.", "Nkomo B.", "Fernandez C.",
    "Volkov D.", "Tanaka H.", "Osei E.", "Bergstrom N.",
]


@dataclass
class CrewMember:
    """Individual crew member."""
    name: str
    role: Role
    health: float = 100.0         # 0 = dead, 100 = perfect
    fatigue: float = 0.0          # 0 = rested, 100 = exhausted
    morale: float = 80.0          # 0 = broken, 100 = inspired
    radiation_dose_msv: float = 0.0
    skills: Dict[str, float] = field(default_factory=dict)
    alive: bool = True
    cause_of_death: Optional[str] = None
    sols_survived: int = 0

    # Status tracking
    starving: bool = False
    dehydrated: bool = False
    hypothermic: bool = False
    injured: bool = False
    sick: bool = False

    @property
    def effectiveness(self) -> float:
        """How effective this crew member is at their job (0-1).

        Combines health, fatigue, and morale into a single multiplier.
        A healthy, rested, happy crew member = 1.0.
        A sick, exhausted, demoralized one = ~0.1.
        """
        if not self.alive:
            return 0.0
        health_factor = self.health / 100.0
        fatigue_factor = 1.0 - (self.fatigue / 150.0)  # Fatigue is softer
        morale_factor = 0.5 + (self.morale / 200.0)    # Morale floor at 0.5
        return max(0.05, health_factor * fatigue_factor * morale_factor)

    @property
    def status_line(self) -> str:
        """One-line status for dashboard display."""
        if not self.alive:
            return f"DECEASED ({self.cause_of_death})"
        conditions = []
        if self.starving:
            conditions.append("STARVING")
        if self.dehydrated:
            conditions.append("DEHYDRATED")
        if self.hypothermic:
            conditions.append("HYPOTHERMIC")
        if self.injured:
            conditions.append("INJURED")
        if self.sick:
            conditions.append("SICK")
        if self.fatigue > 80:
            conditions.append("EXHAUSTED")
        if not conditions:
            if self.health > 90:
                return "Nominal"
            return "Fair"
        return ", ".join(conditions)

    def serialize(self) -> Dict:
        """Serialize for twin state JSON."""
        return {
            "name": self.name,
            "role": self.role.value,
            "alive": self.alive,
            "health": round(self.health, 1),
            "fatigue": round(self.fatigue, 1),
            "morale": round(self.morale, 1),
            "effectiveness": round(self.effectiveness, 2),
            "radiation_msv": round(self.radiation_dose_msv, 1),
            "status": self.status_line,
            "sols_survived": self.sols_survived,
            "cause_of_death": self.cause_of_death,
        }


@dataclass
class Crew:
    """The full crew roster."""
    members: List[CrewMember] = field(default_factory=list)
    log: List[Dict] = field(default_factory=list)

    @property
    def alive_count(self) -> int:
        """Number of living crew members."""
        return sum(1 for m in self.members if m.alive)

    @property
    def alive_members(self) -> List[CrewMember]:
        """Living crew members."""
        return [m for m in self.members if m.alive]

    @property
    def avg_health(self) -> float:
        """Average health of living crew."""
        alive = self.alive_members
        if not alive:
            return 0.0
        return sum(m.health for m in alive) / len(alive)

    @property
    def avg_morale(self) -> float:
        """Average morale of living crew."""
        alive = self.alive_members
        if not alive:
            return 0.0
        return sum(m.morale for m in alive) / len(alive)

    @property
    def avg_effectiveness(self) -> float:
        """Average effectiveness of living crew."""
        alive = self.alive_members
        if not alive:
            return 0.0
        return sum(m.effectiveness for m in alive) / len(alive)

    def get_role_bonus(self, system: str) -> float:
        """Total bonus for a colony system from crew skills."""
        bonus = 0.0
        for member in self.alive_members:
            role_data = ROLE_BONUSES.get(member.role, {})
            if system in role_data:
                bonus += role_data[system] * member.effectiveness
        return bonus

    def serialize(self) -> List[Dict]:
        """Serialize full roster for twin state."""
        return [m.serialize() for m in self.members]


def generate_crew(size: int = 4, seed: int = 42) -> Crew:
    """Generate a crew roster with diverse roles and names."""
    rng = random.Random(seed)
    names = list(CREW_NAMES)
    rng.shuffle(names)

    # Default roles for standard crew sizes
    role_assignments = {
        1: [Role.COMMANDER],
        2: [Role.COMMANDER, Role.ENGINEER],
        3: [Role.COMMANDER, Role.ENGINEER, Role.SCIENTIST],
        4: [Role.COMMANDER, Role.ENGINEER, Role.SCIENTIST, Role.MEDIC],
        5: [Role.COMMANDER, Role.ENGINEER, Role.SCIENTIST, Role.MEDIC, Role.GEOLOGIST],
        6: [Role.COMMANDER, Role.ENGINEER, Role.SCIENTIST, Role.MEDIC, Role.GEOLOGIST, Role.PILOT],
    }
    roles = role_assignments.get(size, [Role.COMMANDER] + [Role.ENGINEER] * (size - 1))

    members = []
    for i in range(size):
        name = names[i % len(names)]
        role = roles[i % len(roles)]

        # Individual variation: slight differences in starting stats
        health = 95.0 + rng.uniform(0, 5)
        morale = 75.0 + rng.uniform(0, 15)

        # Skills based on role + individual talent
        skills = {}
        role_data = ROLE_BONUSES.get(role, {})
        for skill, base in role_data.items():
            skills[skill] = base * (0.8 + rng.random() * 0.4)  # 80-120% of base

        members.append(CrewMember(
            name=name, role=role, health=health, morale=morale, skills=skills,
        ))

    return Crew(members=members)


def tick_crew(crew: Crew, sol: int, resources_available: Dict,
              interior_temp_k: float, radiation_msv: float,
              rng: Optional[random.Random] = None) -> List[str]:
    """Advance crew state by one sol. Returns list of event strings.

    Args:
        crew: The crew roster
        sol: Current sol number
        resources_available: Dict with o2_kg, h2o_liters, food_kcal per person available
        interior_temp_k: Habitat interior temperature
        radiation_msv: Radiation dose this sol
        rng: Random number generator for crew events
    """
    if rng is None:
        rng = random.Random(sol)

    events = []
    alive = crew.alive_members
    if not alive:
        return events

    per_person_o2 = resources_available.get("o2_per_person", O2_KG_PER_PERSON_PER_SOL)
    per_person_h2o = resources_available.get("h2o_per_person", H2O_L_PER_PERSON_PER_SOL)
    per_person_food = resources_available.get("food_per_person", FOOD_KCAL_PER_PERSON_PER_SOL)

    for member in alive:
        member.sols_survived += 1

        # --- Radiation ---
        member.radiation_dose_msv += radiation_msv
        if member.radiation_dose_msv > 1000:  # Acute radiation syndrome
            member.health -= 5.0
            member.sick = True
            if member.radiation_dose_msv > 2000:
                member.health -= 15.0
                events.append(f"{member.name}: severe radiation sickness")

        # --- Starvation ---
        if per_person_food < FOOD_KCAL_PER_PERSON_PER_SOL * 0.3:
            member.starving = True
            member.health -= 3.0
            member.morale -= 5.0
            if not any(member.name in e for e in events):
                events.append(f"{member.name}: starving")
        elif per_person_food < FOOD_KCAL_PER_PERSON_PER_SOL * 0.7:
            member.starving = False
            member.health -= 0.5
            member.morale -= 1.0
        else:
            member.starving = False

        # --- Dehydration ---
        if per_person_h2o < H2O_L_PER_PERSON_PER_SOL * 0.3:
            member.dehydrated = True
            member.health -= 5.0
            member.morale -= 3.0
        elif per_person_h2o < H2O_L_PER_PERSON_PER_SOL * 0.7:
            member.dehydrated = False
            member.health -= 1.0
        else:
            member.dehydrated = False

        # --- Hypothermia ---
        if interior_temp_k < 263:  # Below -10C
            member.hypothermic = True
            member.health -= 4.0
            member.morale -= 3.0
        elif interior_temp_k < 278:  # Below 5C
            member.hypothermic = False
            member.health -= 1.0
            member.morale -= 1.0
        else:
            member.hypothermic = False

        # --- Fatigue ---
        # Work increases fatigue, rest decreases it
        work_load = 0.6 + 0.4 * (1.0 - member.health / 100.0)  # Sick people tire faster
        member.fatigue += 8.0 * work_load  # ~8 fatigue per sol of work
        member.fatigue -= 12.0  # ~12 recovery per sol of rest
        member.fatigue = max(0.0, min(100.0, member.fatigue))

        if member.fatigue > 90:
            member.health -= 1.0
            events.append(f"{member.name}: exhaustion")

        # --- Random crew events (low probability) ---
        roll = rng.random()
        if roll < 0.005:  # 0.5% chance per sol
            member.injured = True
            member.health -= rng.uniform(5, 20)
            events.append(f"{member.name}: injured in accident")
        elif roll < 0.008:  # 0.3% chance
            member.sick = True
            member.health -= rng.uniform(3, 10)
            events.append(f"{member.name}: fell ill")
        elif roll < 0.010:  # 0.2% chance — positive event
            member.morale += 10
            events.append(f"{member.name}: personal breakthrough — morale boost")

        # --- Medic bonus: heal others ---
        if member.role == Role.MEDIC and member.effectiveness > 0.5:
            for other in alive:
                if other is not member and (other.injured or other.sick):
                    heal = 2.0 * member.effectiveness
                    other.health = min(100.0, other.health + heal)
                    if other.health > 80:
                        other.injured = False
                        other.sick = False

        # --- Commander bonus: morale boost ---
        if member.role == Role.COMMANDER and member.effectiveness > 0.5:
            for other in alive:
                other.morale += 0.5 * member.effectiveness

        # --- Natural recovery ---
        if not member.starving and not member.dehydrated and not member.hypothermic:
            member.health = min(100.0, member.health + 0.5)
        member.morale = max(0.0, min(100.0, member.morale))
        member.health = max(0.0, min(100.0, member.health))

        # --- Death check ---
        if member.health <= 0:
            member.alive = False
            member.health = 0
            if member.starving:
                member.cause_of_death = "starvation"
            elif member.dehydrated:
                member.cause_of_death = "dehydration"
            elif member.hypothermic:
                member.cause_of_death = "hypothermia"
            elif member.radiation_dose_msv > 1500:
                member.cause_of_death = "radiation sickness"
            else:
                member.cause_of_death = "accumulated injuries"
            events.append(f"CREW LOSS: {member.name} ({member.role.value}) — "
                         f"{member.cause_of_death}")
            crew.log.append({
                "sol": sol, "event": "death", "member": member.name,
                "cause": member.cause_of_death,
            })

    return events
