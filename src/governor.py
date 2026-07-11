"""Mars Barn Opus — Governor Decision Engine

One clean implementation. No v2, v3, v4, v5 sprawl.

Each governor has a personality (archetype) that shapes strategy.
Memory tracks past decisions and resource trends for adaptation.
Physics-first: in crisis, all governors converge to survival mode.
Personality diverges behavior only when physics allows it.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from config import (
    GOVERNOR_ARCHETYPES, POWER_CRITICAL_THRESHOLD_KWH,
    O2_KG_PER_PERSON_PER_SOL, H2O_L_PER_PERSON_PER_SOL,
    FOOD_KCAL_PER_PERSON_PER_SOL,
    TRADE_TRANSPORT_LOSS_PER_100KM,
    SABOTAGE_DETECTION_CHANCE, SABOTAGE_DAMAGE_FRACTION,
    REPUTATION_COOPERATE_BONUS, REPUTATION_DEFECT_PENALTY,
    REPUTATION_SABOTAGE_PENALTY,
)
from colony import Colony, Allocation, Resources


@dataclass
class MemoryEntry:
    """One sol of governor memory."""
    sol: int
    allocation: Allocation
    o2_trend: float      # Delta from previous sol
    h2o_trend: float
    food_trend: float
    power_trend: float
    cascade_active: bool
    events_active: int


@dataclass
class GovernorMemory:
    """Rolling memory of past decisions and outcomes."""
    entries: List[MemoryEntry] = field(default_factory=list)
    max_entries: int = 50

    def record(self, entry: MemoryEntry) -> None:
        """Add a memory entry, evicting oldest if at capacity."""
        self.entries.append(entry)
        if len(self.entries) > self.max_entries:
            self.entries.pop(0)

    def resource_trend(self, resource: str, window: int = 10) -> float:
        """Average trend for a resource over the last N sols."""
        recent = self.entries[-window:]
        if not recent:
            return 0.0
        trends = [getattr(e, f"{resource}_trend", 0.0) for e in recent]
        return sum(trends) / len(trends)

    def crisis_frequency(self, window: int = 20) -> float:
        """Fraction of recent sols spent in cascade state."""
        recent = self.entries[-window:]
        if not recent:
            return 0.0
        return sum(1 for e in recent if e.cascade_active) / len(recent)

    def avg_allocation(self, field_name: str, window: int = 10) -> float:
        """Average allocation fraction over recent sols."""
        recent = self.entries[-window:]
        if not recent:
            return 0.33
        return sum(getattr(e.allocation, field_name, 0.33) for e in recent) / len(recent)


@dataclass
class Governor:
    """AI colony governor with personality-driven decision making."""
    name: str
    archetype: str
    traits: Dict[str, float] = field(default_factory=dict)
    memory: GovernorMemory = field(default_factory=GovernorMemory)
    rng: random.Random = field(
        default_factory=lambda: random.Random(0),
        repr=False,
        compare=False,
    )

    # Trade history for iterated game theory
    trade_history: Dict[str, List[str]] = field(default_factory=dict)  # neighbor -> ["cooperate", "defect", ...]

    def __post_init__(self) -> None:
        if not self.traits:
            archetype_data = GOVERNOR_ARCHETYPES.get(
                self.archetype, GOVERNOR_ARCHETYPES["engineer"]
            )
            self.traits = {k: v for k, v in archetype_data.items()
                          if k != "description"}

    def decide(self, colony: Colony, events_active: int = 0,
               prev_resources: Optional[Resources] = None) -> Allocation:
        """Make allocation decision for this sol.

        Decision flow:
        1. Assess crisis level (physics-first)
        2. If crisis: override personality with survival logic
        3. If stable: personality shapes allocation
        4. Memory adjusts for observed trends
        5. Record decision to memory
        """
        r = colony.resources
        crisis_level = self._assess_crisis(colony)

        if crisis_level > 0.85:
            allocation = self._crisis_allocation(colony, crisis_level)
        elif crisis_level > 0.5:
            # Blend: personality still matters but crisis pulls toward survival
            personal = self._personality_allocation(colony, crisis_level)
            crisis = self._crisis_allocation(colony, crisis_level)
            blend = (crisis_level - 0.5) / 0.35  # 0.0 at 0.5, 1.0 at 0.85
            allocation = Allocation(
                heating_fraction=personal.heating_fraction * (1 - blend) + crisis.heating_fraction * blend,
                isru_fraction=personal.isru_fraction * (1 - blend) + crisis.isru_fraction * blend,
                greenhouse_fraction=personal.greenhouse_fraction * (1 - blend) + crisis.greenhouse_fraction * blend,
                food_ration=personal.food_ration * (1 - blend) + crisis.food_ration * blend,
                repair_target=crisis.repair_target if blend > 0.5 else personal.repair_target,
            )
        else:
            allocation = self._personality_allocation(colony, crisis_level)

        # Memory-based adjustment
        allocation = self._memory_adjust(allocation, colony)
        allocation.validate()

        # Record to memory
        if prev_resources:
            entry = MemoryEntry(
                sol=colony.sol,
                allocation=allocation,
                o2_trend=r.o2_kg - prev_resources.o2_kg,
                h2o_trend=r.h2o_liters - prev_resources.h2o_liters,
                food_trend=r.food_kcal - prev_resources.food_kcal,
                power_trend=r.power_kwh - prev_resources.power_kwh,
                cascade_active=colony.cascade_state.value != "nominal",
                events_active=events_active,
            )
            self.memory.record(entry)

        return allocation

    def _assess_crisis(self, colony: Colony) -> float:
        """Rate crisis severity from 0.0 (nominal) to 1.0 (imminent death).

        Considers: resource days remaining, cascade state, system damage.
        """
        r = colony.resources
        scores = []

        # Resource urgency (days remaining -> crisis score)
        for resource in ["o2", "h2o", "food", "power"]:
            days = r.days_of(resource)
            if days < 3:
                scores.append(1.0)
            elif days < 10:
                scores.append(0.8)
            elif days < 20:
                scores.append(0.4)
            else:
                scores.append(0.0)

        # Cascade state adds crisis
        cascade_scores = {
            "nominal": 0.0,
            "power_critical": 0.6,
            "thermal_failure": 0.8,
            "water_freeze": 0.9,
            "o2_failure": 1.0,
        }
        scores.append(cascade_scores.get(colony.cascade_state.value, 0.0))

        # System damage
        sys_health = (colony.systems.solar_efficiency
                      + colony.systems.isru_efficiency
                      + colony.systems.greenhouse_efficiency) / 3.0
        scores.append(max(0.0, 1.0 - sys_health))

        return max(scores)  # Worst case drives crisis level

    def _crisis_allocation(self, colony: Colony,
                           crisis_level: float) -> Allocation:
        """Physics-first survival allocation. Personality barely matters here.

        Priority: whatever resource is most critical gets the most power.
        """
        r = colony.resources
        o2_days = r.days_of("o2")
        h2o_days = r.days_of("h2o")
        food_days = r.days_of("food")

        # Emergency rationing
        food_ration = 0.5 if food_days < 5 else (0.75 if food_days < 15 else 1.0)

        # Identify most damaged system for repair
        systems = [
            ("solar", colony.systems.solar_efficiency),
            ("isru", colony.systems.isru_efficiency),
            ("greenhouse", colony.systems.greenhouse_efficiency),
            ("heating", colony.systems.heating_efficiency),
        ]
        worst_system = min(systems, key=lambda x: x[1])
        repair_target = worst_system[0] if worst_system[1] < 0.8 else None

        # Crisis allocation: heavy ISRU (O2/H2O production is survival)
        if o2_days < 5 or h2o_days < 5:
            return Allocation(
                heating_fraction=0.15,
                isru_fraction=0.70,
                greenhouse_fraction=0.15,
                food_ration=food_ration,
                repair_target=repair_target,
            )

        if food_days < 10:
            return Allocation(
                heating_fraction=0.15,
                isru_fraction=0.30,
                greenhouse_fraction=0.55,
                food_ration=food_ration,
                repair_target=repair_target,
            )

        # General crisis: balanced but aggressive
        return Allocation(
            heating_fraction=0.20,
            isru_fraction=0.50,
            greenhouse_fraction=0.30,
            food_ration=food_ration,
            repair_target=repair_target,
        )

    def _personality_allocation(self, colony: Colony,
                                crisis_level: float) -> Allocation:
        """Personality-shaped allocation for stable conditions.

        Each trait influences different allocation priorities.
        Trait effects are amplified to create real divergence — a
        survivalist and a wildcard should produce visibly different
        resource curves over 500 sols.
        """
        t = self.traits
        r = colony.resources

        # Archetype-driven base allocation (not a single starting point)
        risk = t.get("risk_tolerance", 0.5)
        eff = t.get("efficiency_focus", 0.5)
        innovation = t.get("innovation_drive", 0.5)
        aggression = t.get("crisis_aggression", 0.5)
        trust = t.get("social_trust", 0.5)

        # Base: personality directly shapes the starting split
        # High risk -> minimal heating, heavy production
        # High efficiency -> favor the better-performing system
        # High trust -> more greenhouse (feed people), less hoarding
        heating = 0.30 - 0.20 * risk
        isru = 0.30 + 0.15 * (1.0 - trust) + 0.10 * aggression
        greenhouse = 0.40 + 0.15 * trust - 0.10 * aggression

        # Efficiency focus: double down on the better system
        if colony.systems.isru_efficiency > colony.systems.greenhouse_efficiency:
            isru += 0.15 * eff
            greenhouse -= 0.15 * eff
        else:
            greenhouse += 0.15 * eff
            isru -= 0.15 * eff

        # Innovation drive: cycle allocation on a longer period
        # Creates strategy waves — some sols favor ISRU, some greenhouse
        if innovation > 0.3:
            import math
            cycle_period = max(5, int(30 * (1.0 - innovation)))  # Faster cycles for more innovative
            phase = math.sin(2 * math.pi * colony.sol / cycle_period)
            shift = 0.12 * innovation * phase
            isru += shift
            greenhouse -= shift

        # Crisis aggression: how quickly to shift toward crisis mode
        if crisis_level > 0.2:
            crisis_shift = 0.20 * aggression * crisis_level
            isru += crisis_shift
            heating -= crisis_shift * 0.5
            greenhouse -= crisis_shift * 0.5

        # Food rationing: trust determines willingness to ration
        # Low trust governors ration early (protect reserves)
        # High trust governors ration late (feed everyone)
        food_days = r.days_of("food")
        ration_threshold = 15 + 15 * trust  # 15-30 sol threshold
        if food_days < ration_threshold * 0.3:
            food_ration = 0.50 + 0.20 * trust
        elif food_days < ration_threshold * 0.7:
            food_ration = 0.75 + 0.15 * trust
        elif food_days < ration_threshold:
            food_ration = 0.90 + 0.10 * trust
        else:
            food_ration = 1.0

        # Repair priority based on personality
        systems = [
            ("solar", colony.systems.solar_efficiency),
            ("isru", colony.systems.isru_efficiency),
            ("greenhouse", colony.systems.greenhouse_efficiency),
            ("heating", colony.systems.heating_efficiency),
        ]
        damaged = [s for s in systems if s[1] < 0.9]
        if damaged:
            if eff > 0.7:
                # Engineer: fix most impactful system
                repair_target = min(damaged, key=lambda x: x[1])[0]
            else:
                # Others: fix what's most damaged
                repair_target = min(damaged, key=lambda x: x[1])[0]
        else:
            repair_target = None

        return Allocation(
            heating_fraction=max(0.05, heating),
            isru_fraction=max(0.10, isru),
            greenhouse_fraction=max(0.10, greenhouse),
            food_ration=food_ration,
            repair_target=repair_target,
        )

    def _memory_adjust(self, allocation: Allocation,
                       colony: Colony) -> Allocation:
        """Adjust allocation based on observed resource trends.

        If a resource has been declining consistently, shift more power to it.
        This is where personality-driven governors diverge over time:
        same initial allocation + different history = different outcomes.
        """
        if len(self.memory.entries) < 3:
            return allocation  # Not enough data yet

        # Check for persistent declines — personality modulates reaction
        o2_trend = self.memory.resource_trend("o2")
        h2o_trend = self.memory.resource_trend("h2o")
        food_trend = self.memory.resource_trend("food")

        # Reaction speed varies by personality
        # High aggression = react faster, low = more tolerant of decline
        aggression = self.traits.get("crisis_aggression", 0.5)
        react_mult = 0.5 + aggression  # 0.5x to 1.5x reaction strength

        # Shift toward ISRU if O2 or H2O declining
        if o2_trend < -0.3 or h2o_trend < -0.3:
            shift = min(0.15, abs(min(o2_trend, h2o_trend)) * 0.08 * react_mult)
            allocation.isru_fraction += shift
            allocation.greenhouse_fraction -= shift * 0.5
            allocation.heating_fraction -= shift * 0.5

        # Shift toward greenhouse if food declining
        if food_trend < -300:
            shift = min(0.15, abs(food_trend) * 0.00008 * react_mult)
            allocation.greenhouse_fraction += shift
            allocation.isru_fraction -= shift * 0.5
            allocation.heating_fraction -= shift * 0.5

        # Crisis frequency adjustment — personality determines response
        crisis_freq = self.memory.crisis_frequency()
        if crisis_freq > 0.2:
            # High aggression governors get more aggressive in crises
            # Low aggression governors get more conservative
            if aggression > 0.5:
                # Aggressive: double down on production
                allocation.isru_fraction += 0.08 * crisis_freq * aggression
                allocation.heating_fraction -= 0.04 * crisis_freq * aggression
            else:
                # Conservative: hunker down, protect heating
                allocation.heating_fraction += 0.08 * crisis_freq * (1.0 - aggression)
                allocation.isru_fraction -= 0.04 * crisis_freq * (1.0 - aggression)

        # Innovation-driven adaptation: change strategy when current one isn't working
        innovation = self.traits.get("innovation_drive", 0.5)
        if innovation > 0.5 and len(self.memory.entries) >= 10:
            recent_avg = self.memory.avg_allocation("isru_fraction", 10)
            # If we've been doing the same thing and it's not working, try the opposite
            if crisis_freq > 0.3 and abs(allocation.isru_fraction - recent_avg) < 0.05:
                flip = 0.10 * innovation
                allocation.isru_fraction -= flip
                allocation.greenhouse_fraction += flip

        allocation.validate()
        return allocation

    # =========================================================================
    # TRADE & DIPLOMACY
    # =========================================================================

    def evaluate_trade(self, offering: Dict[str, float],
                       requesting: Dict[str, float],
                       neighbor_name: str,
                       neighbor_reputation: float) -> bool:
        """Decide whether to accept a trade offer.

        Uses iterated Prisoner's Dilemma strategies based on personality.
        """
        t = self.traits
        willingness = t.get("trade_willingness", 0.5)
        trust = t.get("social_trust", 0.5)

        # Base willingness
        if willingness < 0.2:
            return False  # Hermit: almost never trades

        # Reputation check
        if neighbor_reputation < 0.3 and trust > 0.5:
            return False  # Trustful governor won't deal with bad actors

        # History-based strategy
        history = self.trade_history.get(neighbor_name, [])
        if history:
            last_action = history[-1]
            archetype = self.archetype

            if archetype in ("philosopher", "diplomat"):
                # Tit-for-tat: cooperate if they cooperated last time
                return last_action == "cooperate"

            elif archetype == "survivalist":
                # Grudger: defect forever after first defection
                if "defect" in history:
                    return False
                return True

            elif archetype in ("contrarian", "wildcard"):
                # Random with bias
                return self.rng.random() < willingness

            elif archetype == "merchant":
                # Always cooperate (trade is life)
                return True

            else:
                # Default: cooperate if more cooperations than defections
                cooperations = history.count("cooperate")
                return cooperations >= len(history) / 2

        # First interaction: personality decides
        return trust > 0.4

    def consider_sabotage(self, colony: Colony,
                          target_colony: Colony) -> bool:
        """Decide whether to sabotage another colony.

        Only desperate or aggressive governors sabotage.
        """
        t = self.traits
        threshold = t.get("sabotage_threshold", 0.10)

        # How desperate are we?
        lowest_resource, days = colony.resources.lowest_resource_days()
        desperation = max(0.0, 1.0 - days / 30.0)

        # Aggression
        aggression = t.get("crisis_aggression", 0.5)

        # Will we sabotage?
        sabotage_score = desperation * (0.6 + 0.4 * aggression)
        return sabotage_score >= (1.0 - threshold)


def create_governor(name: str, archetype: str, seed: int = 0) -> Governor:
    """Create a governor with the given personality archetype."""
    return Governor(
        name=name,
        archetype=archetype,
        rng=random.Random(seed),
    )
