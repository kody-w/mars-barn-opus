"""Mars Barn Opus — Event System

Stochastic events: dust storms, meteorite impacts, solar flares,
equipment failures, seasonal shifts, radiation spikes.

Events have lifecycle (generation -> active -> expiry), severity,
duration, and typed effects on colony systems/resources.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import List, Dict, Optional

from config import (
    EVENT_PROBABILITIES, EVENT_DURATION_RANGE,
    MARS_SOLAR_FLARE_DOSE_MSV,
    DUST_STORM_MAX_DUST_FACTOR, DUST_DEVIL_MAX_DUST_FACTOR,
    DUST_STORM_SEVERE_THRESHOLD, DUST_STORM_SEVERE_DURATION_MULTIPLIER,
    DUST_DEVIL_CLEANING_SEVERITY_MAX, DUST_DEVIL_SOLAR_REPAIR_FRACTION,
    SOLAR_FLARE_COMMS_DAMAGE_FRACTION,
    SOLAR_FLARE_SOLAR_DAMAGE_FRACTION,
    METEORITE_SOLAR_DAMAGE_FRACTION,
    METEORITE_GREENHOUSE_DAMAGE_FRACTION,
    METEORITE_HEATING_DAMAGE_FRACTION, METEORITE_O2_LOSS_KG,
    METEORITE_WATER_LOSS_LITERS,
    EQUIPMENT_FAILURE_ISRU_DAMAGE_FRACTION,
    EQUIPMENT_FAILURE_POWER_LOSS_KWH, RADIATION_SPIKE_MSV,
    EVENT_SEVERITY_MIN, EVENT_SEVERITY_MAX,
)


@dataclass
class Event:
    """A single active event."""
    event_type: str
    severity: float          # 0.0 to 1.0
    duration_sols: int       # Total duration
    remaining_sols: int      # Sols left
    effects: Dict[str, float] = field(default_factory=dict)
    description: str = ""
    sol_started: int = 0

    @property
    def expired(self) -> bool:
        """Whether this event has run its course."""
        return self.remaining_sols <= 0


# Event effect generators — each returns an effects dict based on severity

def _dust_storm_effects(severity: float) -> Dict[str, float]:
    """Dust storms attenuate sunlight through atmospheric opacity."""
    return {
        "dust_factor": 1.0 + (DUST_STORM_MAX_DUST_FACTOR - 1.0) * severity,
    }


def _dust_devil_effects(severity: float) -> Dict[str, float]:
    """Dust devils: minor, sometimes helpful (clean panels)."""
    return {
        "dust_factor": 1.0 + (DUST_DEVIL_MAX_DUST_FACTOR - 1.0) * severity,
        "solar_repair": (
            DUST_DEVIL_SOLAR_REPAIR_FRACTION * severity
            if severity < DUST_DEVIL_CLEANING_SEVERITY_MAX else 0.0
        ),
    }


def _solar_flare_effects(severity: float) -> Dict[str, float]:
    """Solar flares: radiation spike, possible electronics damage."""
    return {
        "radiation_msv": MARS_SOLAR_FLARE_DOSE_MSV * severity,
        "comms_damage": SOLAR_FLARE_COMMS_DAMAGE_FRACTION * severity,
        "solar_damage": SOLAR_FLARE_SOLAR_DAMAGE_FRACTION * severity,
    }


def _meteorite_effects(severity: float) -> Dict[str, float]:
    """Meteorite impacts: potentially catastrophic."""
    return {
        "solar_damage": METEORITE_SOLAR_DAMAGE_FRACTION * severity,
        "greenhouse_damage": METEORITE_GREENHOUSE_DAMAGE_FRACTION * severity,
        "heating_damage": METEORITE_HEATING_DAMAGE_FRACTION * severity,
        "o2_loss": METEORITE_O2_LOSS_KG * severity,
        "water_loss": METEORITE_WATER_LOSS_LITERS * severity,
    }


def _equipment_failure_effects(severity: float) -> Dict[str, float]:
    """Random equipment failure: an onset pulse with a repair window."""
    return {
        "isru_damage": EQUIPMENT_FAILURE_ISRU_DAMAGE_FRACTION * severity,
        "power_loss": EQUIPMENT_FAILURE_POWER_LOSS_KWH * severity,
    }


def _seasonal_shift_effects(severity: float) -> Dict[str, float]:
    """Orbital seasonality is already represented in mars.py."""
    return {}


def _radiation_spike_effects(severity: float) -> Dict[str, float]:
    """GCR spike: elevated background radiation."""
    return {
        "radiation_msv": RADIATION_SPIKE_MSV * severity,
    }


EFFECT_GENERATORS = {
    "dust_storm": _dust_storm_effects,
    "dust_devil": _dust_devil_effects,
    "solar_flare": _solar_flare_effects,
    "meteorite": _meteorite_effects,
    "equipment_failure": _equipment_failure_effects,
    "seasonal_shift": _seasonal_shift_effects,
    "radiation_spike": _radiation_spike_effects,
}

EVENT_DESCRIPTIONS = {
    "dust_storm": [
        "A regional dust storm darkens the sky.",
        "Massive dust plume approaching from the north.",
        "Global dust event — visibility near zero.",
        "Persistent haze reducing solar panel output.",
    ],
    "dust_devil": [
        "Dust devil spotted near the habitat.",
        "Small vortex passed over the solar array.",
    ],
    "solar_flare": [
        "Solar particle event detected — seeking shelter.",
        "Coronal mass ejection — radiation alarm triggered.",
    ],
    "meteorite": [
        "Meteorite impact detected nearby.",
        "Small impactor struck the outer perimeter.",
        "Bolide flash observed — checking for damage.",
    ],
    "equipment_failure": [
        "ISRU unit showing anomalous readings.",
        "Power converter malfunction.",
        "Pump failure in water recycling system.",
    ],
    "seasonal_shift": [
        "Entering Martian autumn — temperatures dropping.",
        "Perihelion approach — increased solar activity.",
        "Aphelion — reduced solar input for the season.",
    ],
    "radiation_spike": [
        "Elevated GCR levels detected.",
        "Background radiation above normal parameters.",
    ],
}


@dataclass
class EventEngine:
    """Manages event lifecycle: generation, ticking, expiry."""
    active_events: List[Event] = field(default_factory=list)
    event_log: List[Dict] = field(default_factory=list)
    rng: random.Random = field(default_factory=lambda: random.Random(42))

    def set_seed(self, seed: int) -> None:
        """Reset the RNG seed."""
        self.rng = random.Random(seed)

    def tick(self, sol: int) -> List[Event]:
        """Advance all events by one sol and generate new ones.

        Returns list of newly generated events this sol.
        """
        # Age existing events
        for event in self.active_events:
            event.remaining_sols -= 1

        # Remove expired
        expired = [e for e in self.active_events if e.expired]
        self.active_events = [e for e in self.active_events if not e.expired]

        for e in expired:
            self.event_log.append({
                "type": e.event_type,
                "started": e.sol_started,
                "ended": sol,
                "severity": e.severity,
            })

        # Generate new events
        new_events = self._generate(sol)
        self.active_events.extend(new_events)

        return new_events

    def _generate(self, sol: int) -> List[Event]:
        """Roll for new events this sol."""
        new_events = []
        active_types = {e.event_type for e in self.active_events}

        for event_type, probability in EVENT_PROBABILITIES.items():
            # No stacking: same event type can't overlap
            if event_type in active_types:
                continue

            if self.rng.random() < probability:
                severity = self.rng.uniform(
                    EVENT_SEVERITY_MIN,
                    EVENT_SEVERITY_MAX,
                )
                dur_range = EVENT_DURATION_RANGE[event_type]
                duration = self.rng.randint(dur_range[0], dur_range[1])

                # Scale duration with severity for storms
                if (
                    event_type == "dust_storm"
                    and severity > DUST_STORM_SEVERE_THRESHOLD
                ):
                    duration = int(
                        duration * DUST_STORM_SEVERE_DURATION_MULTIPLIER
                    )

                gen = EFFECT_GENERATORS[event_type]
                effects = gen(severity)

                descriptions = EVENT_DESCRIPTIONS.get(event_type, ["Event occurred."])
                desc = self.rng.choice(descriptions)

                event = Event(
                    event_type=event_type,
                    severity=severity,
                    duration_sols=duration,
                    remaining_sols=duration,
                    effects=effects,
                    description=desc,
                    sol_started=sol,
                )
                new_events.append(event)

        return new_events

    def aggregate_effects(self) -> Dict[str, float]:
        """Aggregate all active event effects into a single dict.

        Multipliers are multiplicative. Additive values are summed.
        """
        result: Dict[str, float] = {}

        for event in self.active_events:
            for key, value in event.effects.items():
                if key.endswith("_multiplier"):
                    # Multiplicative
                    result[key] = result.get(key, 1.0) * value
                elif key.endswith("_offset") or key.endswith("_factor"):
                    # Special: take the max
                    result[key] = max(result.get(key, 0.0), value)
                else:
                    # Additive
                    result[key] = result.get(key, 0.0) + value

        return result

    def active_event_dicts(self) -> List[Dict]:
        """Return active events as plain dicts for colony.apply_events()."""
        return [{"type": e.event_type, "effects": e.effects,
                 "severity": e.severity, "description": e.description,
                 "onset": e.remaining_sols == e.duration_sols,
                 "sol_started": e.sol_started}
                for e in self.active_events]
