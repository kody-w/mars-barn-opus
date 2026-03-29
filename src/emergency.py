"""Mars Barn Opus — Emergency Protocols

Predefined response plans the operator can activate during crisis.
Each protocol overrides the governor's allocation for a set duration.
The colony switches to survival mode with specific resource priorities.

Protocols:
  SHELTER_IN_PLACE: Minimize activity, maximize heating, reduce consumption
  EMERGENCY_ISRU: All power to O2/H2O production (life support critical)
  POWER_SAVE: Shut down non-essential systems, conserve power
  ABANDON_MODULE: Sacrifice a module to redirect resources to survival
  FULL_RATION: Override governor rationing — full meals for morale
  CREW_REST: Reduce work output to recover crew health and fatigue
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from colony import Allocation


@dataclass
class EmergencyProtocol:
    """Definition of an emergency protocol."""
    name: str
    slug: str
    description: str
    allocation: Allocation          # Override allocation during protocol
    duration_sols: int              # How long the protocol lasts
    crew_effects: Dict[str, float]  # Effects on crew (morale, fatigue, etc.)
    system_effects: Dict[str, float]  # Effects on colony systems


PROTOCOLS: Dict[str, EmergencyProtocol] = {
    "shelter_in_place": EmergencyProtocol(
        name="Shelter in Place",
        slug="shelter_in_place",
        description="All crew inside. Maximum heating. Minimum activity. Wait it out.",
        allocation=Allocation(heating_fraction=0.60, isru_fraction=0.25,
                              greenhouse_fraction=0.15, food_ration=0.60),
        duration_sols=5,
        crew_effects={"fatigue_reduction": 0.5, "morale_change": -2.0},
        system_effects={},
    ),
    "emergency_isru": EmergencyProtocol(
        name="Emergency ISRU",
        slug="emergency_isru",
        description="Life support critical. All power to O2/H2O. No food production.",
        allocation=Allocation(heating_fraction=0.10, isru_fraction=0.85,
                              greenhouse_fraction=0.05, food_ration=0.50),
        duration_sols=3,
        crew_effects={"morale_change": -5.0},
        system_effects={"isru_boost": 0.30},
    ),
    "power_save": EmergencyProtocol(
        name="Power Save Mode",
        slug="power_save",
        description="Non-essential systems offline. Conserve every kWh.",
        allocation=Allocation(heating_fraction=0.40, isru_fraction=0.35,
                              greenhouse_fraction=0.25, food_ration=0.75),
        duration_sols=7,
        crew_effects={"morale_change": -1.0},
        system_effects={"power_consumption_reduction": 0.40},
    ),
    "crew_rest": EmergencyProtocol(
        name="Crew Rest Period",
        slug="crew_rest",
        description="Mandatory rest. Reduced output but crew recovers health and morale.",
        allocation=Allocation(heating_fraction=0.30, isru_fraction=0.35,
                              greenhouse_fraction=0.35, food_ration=1.0),
        duration_sols=5,
        crew_effects={"health_recovery": 5.0, "fatigue_reduction": 1.0, "morale_change": 3.0},
        system_effects={},
    ),
    "full_ration": EmergencyProtocol(
        name="Full Rations Override",
        slug="full_ration",
        description="Override governor rationing. Full meals. Morale boost.",
        allocation=Allocation(heating_fraction=0.25, isru_fraction=0.35,
                              greenhouse_fraction=0.40, food_ration=1.0),
        duration_sols=10,
        crew_effects={"morale_change": 5.0},
        system_effects={},
    ),
}


@dataclass
class ActiveProtocol:
    """A protocol currently in effect."""
    slug: str
    sols_remaining: int

    def serialize(self) -> Dict:
        """Serialize for twin state."""
        proto = PROTOCOLS.get(self.slug)
        return {
            "slug": self.slug,
            "name": proto.name if proto else self.slug,
            "sols_remaining": self.sols_remaining,
        }


@dataclass
class EmergencySystem:
    """Manages emergency protocols for the colony."""
    active: Optional[ActiveProtocol] = None
    history: List[Dict] = field(default_factory=list)
    protocols_used: int = 0

    def activate(self, slug: str, sol: int) -> Optional[str]:
        """Activate an emergency protocol. Returns error or None."""
        if slug not in PROTOCOLS:
            return f"Unknown protocol: {slug}"
        if self.active is not None:
            return f"Protocol already active: {self.active.slug}"
        proto = PROTOCOLS[slug]
        self.active = ActiveProtocol(slug=slug, sols_remaining=proto.duration_sols)
        self.protocols_used += 1
        self.history.append({"sol": sol, "protocol": slug, "name": proto.name})
        return None

    def tick(self, sol: int) -> Optional[str]:
        """Advance protocol timer. Returns event string if protocol ends."""
        if self.active:
            self.active.sols_remaining -= 1
            if self.active.sols_remaining <= 0:
                proto = PROTOCOLS.get(self.active.slug)
                name = proto.name if proto else self.active.slug
                self.active = None
                return f"Emergency protocol ended: {name}"
        return None

    def get_allocation_override(self) -> Optional[Allocation]:
        """Get allocation override if protocol is active."""
        if self.active:
            proto = PROTOCOLS.get(self.active.slug)
            if proto:
                return proto.allocation
        return None

    def get_crew_effects(self) -> Dict[str, float]:
        """Get crew effects from active protocol."""
        if self.active:
            proto = PROTOCOLS.get(self.active.slug)
            if proto:
                return proto.crew_effects
        return {}

    def serialize(self) -> Dict:
        """Serialize for twin state."""
        return {
            "active": self.active.serialize() if self.active else None,
            "protocols_used": self.protocols_used,
            "history": self.history[-10:],
        }
