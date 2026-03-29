"""Mars Barn Opus — Research System

Crew can research technology upgrades that permanently improve colony
systems. Research takes sols, costs resources, and requires a crew
member with the right role. The Scientist role gets a research speed
bonus. Research projects are queued and executed one at a time.

This is the long-term progression system — early survival is about
resource management, mid-game is about expansion (modules), and
late-game is about research (permanent upgrades).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class ResearchProject:
    """A technology that can be researched."""
    name: str
    slug: str
    description: str
    research_sols: int           # Base time to complete
    cost: Dict[str, float]       # Resources consumed to start
    effect: Dict[str, float]     # Permanent bonuses when complete
    requires: List[str] = field(default_factory=list)  # Prerequisite research slugs
    tier: int = 1                # 1=basic, 2=advanced, 3=breakthrough


# Research tree — ordered by tier
RESEARCH_TREE: Dict[str, ResearchProject] = {
    # Tier 1: Basic improvements
    "improved_solar": ResearchProject(
        name="Improved Solar Cells",
        slug="improved_solar",
        description="Multi-junction cell optimization. +15% solar panel efficiency.",
        research_sols=12,
        cost={"power_kwh": 100},
        effect={"solar_efficiency_bonus": 0.15},
        tier=1,
    ),
    "water_recycling": ResearchProject(
        name="Advanced Water Recycling",
        slug="water_recycling",
        description="Closed-loop water recovery. -20% water consumption.",
        research_sols=10,
        cost={"power_kwh": 80, "h2o_liters": 20},
        effect={"h2o_consumption_reduction": 0.20},
        tier=1,
    ),
    "crop_optimization": ResearchProject(
        name="Crop Optimization",
        slug="crop_optimization",
        description="Selective breeding for Mars conditions. +25% food production.",
        research_sols=15,
        cost={"power_kwh": 60, "food_kcal": 10000},
        effect={"food_production_bonus": 0.25},
        tier=1,
    ),
    "radiation_hardening": ResearchProject(
        name="Radiation Hardening",
        slug="radiation_hardening",
        description="Regolith-based shielding improvements. -30% crew radiation dose.",
        research_sols=14,
        cost={"power_kwh": 120},
        effect={"radiation_reduction": 0.30},
        tier=1,
    ),

    # Tier 2: Advanced (requires tier 1 prereqs)
    "moxie_upgrade": ResearchProject(
        name="MOXIE II Upgrade",
        slug="moxie_upgrade",
        description="Next-gen ISRU. +30% O2/H2O production.",
        research_sols=20,
        cost={"power_kwh": 200, "h2o_liters": 30},
        effect={"isru_production_bonus": 0.30},
        requires=["water_recycling"],
        tier=2,
    ),
    "autonomous_repair": ResearchProject(
        name="Autonomous Repair Drones",
        slug="autonomous_repair",
        description="Self-repairing systems. Passive repair each sol.",
        research_sols=18,
        cost={"power_kwh": 150},
        effect={"passive_repair_rate": 0.02},
        requires=["improved_solar"],
        tier=2,
    ),
    "crew_medicine": ResearchProject(
        name="Mars Pharmacology",
        slug="crew_medicine",
        description="Local pharmaceutical production. +50% crew health recovery.",
        research_sols=16,
        cost={"power_kwh": 100, "h2o_liters": 40, "food_kcal": 15000},
        effect={"health_recovery_bonus": 0.50},
        requires=["crop_optimization"],
        tier=2,
    ),
    "dust_mitigation": ResearchProject(
        name="Dust Mitigation",
        slug="dust_mitigation",
        description="Electrostatic panel cleaning. -40% dust storm solar impact.",
        research_sols=12,
        cost={"power_kwh": 80},
        effect={"dust_storm_resistance": 0.40},
        requires=["improved_solar"],
        tier=2,
    ),

    # Tier 3: Breakthroughs (requires tier 2 prereqs)
    "nuclear_thermal": ResearchProject(
        name="Nuclear Thermal Generator",
        slug="nuclear_thermal",
        description="Kilopower-II reactor. Eliminates thermal cascade risk.",
        research_sols=30,
        cost={"power_kwh": 500},
        effect={"thermal_cascade_immunity": 1.0},
        requires=["moxie_upgrade", "autonomous_repair"],
        tier=3,
    ),
    "closed_ecosystem": ResearchProject(
        name="Closed Ecosystem",
        slug="closed_ecosystem",
        description="Self-sustaining biosphere. +100% food, -50% water use.",
        research_sols=25,
        cost={"power_kwh": 300, "h2o_liters": 100, "food_kcal": 50000},
        effect={"food_production_bonus": 1.00, "h2o_consumption_reduction": 0.50},
        requires=["crew_medicine", "crop_optimization"],
        tier=3,
    ),
    "mars_steel": ResearchProject(
        name="Mars Steel Production",
        slug="mars_steel",
        description="In-situ metal extraction. Halves all construction time.",
        research_sols=22,
        cost={"power_kwh": 400},
        effect={"construction_speed_bonus": 0.50},
        requires=["moxie_upgrade"],
        tier=3,
    ),
}


@dataclass
class ActiveResearch:
    """Research currently in progress."""
    slug: str
    sols_remaining: int
    total_sols: int

    @property
    def progress(self) -> float:
        """0-1 completion."""
        return 1.0 - (self.sols_remaining / max(1, self.total_sols))

    def serialize(self) -> Dict:
        """Serialize for twin state."""
        proj = RESEARCH_TREE.get(self.slug)
        return {
            "slug": self.slug,
            "name": proj.name if proj else self.slug,
            "progress": round(self.progress, 2),
            "sols_remaining": self.sols_remaining,
        }


@dataclass
class ResearchLab:
    """Colony research state."""
    completed: List[str] = field(default_factory=list)
    active: Optional[ActiveResearch] = None
    log: List[Dict] = field(default_factory=list)

    def is_completed(self, slug: str) -> bool:
        """Check if research is done."""
        return slug in self.completed

    def can_research(self, slug: str, resources: 'Resources') -> tuple:
        """Check if research can be started. Returns (can, reason)."""
        if slug not in RESEARCH_TREE:
            return False, "Unknown research"
        if self.active is not None:
            return False, "Research already in progress"
        if slug in self.completed:
            return False, "Already researched"
        proj = RESEARCH_TREE[slug]
        for req in proj.requires:
            if req not in self.completed:
                req_name = RESEARCH_TREE.get(req, ResearchProject("?", req, "", 0, {}, {})).name
                return False, f"Requires: {req_name}"
        for res_key, amount in proj.cost.items():
            current = getattr(resources, res_key, 0)
            if current < amount:
                return False, f"Need {amount} {res_key}"
        return True, "Ready"

    def start_research(self, slug: str, resources: 'Resources',
                      scientist_bonus: float = 0.0) -> Optional[str]:
        """Start a research project. Returns error or None."""
        can, reason = self.can_research(slug, resources)
        if not can:
            return reason
        proj = RESEARCH_TREE[slug]
        # Deduct costs
        for res_key, amount in proj.cost.items():
            current = getattr(resources, res_key, 0)
            setattr(resources, res_key, current - amount)
        # Scientist bonus reduces research time
        adjusted_sols = max(3, int(proj.research_sols * (1.0 - scientist_bonus * 0.3)))
        self.active = ActiveResearch(
            slug=slug,
            sols_remaining=adjusted_sols,
            total_sols=adjusted_sols,
        )
        return None

    def tick(self, sol: int) -> List[str]:
        """Advance research by one sol. Returns event strings."""
        events = []
        if self.active:
            self.active.sols_remaining -= 1
            if self.active.sols_remaining <= 0:
                self.completed.append(self.active.slug)
                proj = RESEARCH_TREE.get(self.active.slug)
                name = proj.name if proj else self.active.slug
                events.append(f"RESEARCH COMPLETE: {name}")
                self.log.append({"sol": sol, "research": self.active.slug, "name": name})
                self.active = None
        return events

    def get_effect(self, effect_key: str) -> float:
        """Get total research effect for a key."""
        total = 0.0
        for slug in self.completed:
            proj = RESEARCH_TREE.get(slug)
            if proj:
                total += proj.effect.get(effect_key, 0.0)
        return total

    def available_research(self, resources: 'Resources') -> List[Dict]:
        """List research projects that can be started now."""
        available = []
        for slug, proj in RESEARCH_TREE.items():
            can, reason = self.can_research(slug, resources)
            available.append({
                "slug": slug,
                "name": proj.name,
                "description": proj.description,
                "tier": proj.tier,
                "sols": proj.research_sols,
                "can_start": can,
                "reason": reason,
            })
        return available

    def serialize(self) -> Dict:
        """Serialize for twin state."""
        return {
            "completed": self.completed,
            "active": self.active.serialize() if self.active else None,
            "total_completed": len(self.completed),
            "effects": {
                "solar_efficiency_bonus": self.get_effect("solar_efficiency_bonus"),
                "isru_production_bonus": self.get_effect("isru_production_bonus"),
                "food_production_bonus": self.get_effect("food_production_bonus"),
                "radiation_reduction": self.get_effect("radiation_reduction"),
                "h2o_consumption_reduction": self.get_effect("h2o_consumption_reduction"),
                "passive_repair_rate": self.get_effect("passive_repair_rate"),
                "health_recovery_bonus": self.get_effect("health_recovery_bonus"),
                "dust_storm_resistance": self.get_effect("dust_storm_resistance"),
                "construction_speed_bonus": self.get_effect("construction_speed_bonus"),
            },
        }


def governor_research_decision(lab: ResearchLab, resources: 'Resources',
                               sol: int, crisis_level: float) -> Optional[str]:
    """AI governor decides what to research next.

    Priority: tier 1 basics first, then tier 2, then tier 3.
    Within a tier, prioritize based on colony needs.
    Won't research during crisis.
    """
    if crisis_level > 0.5 or lab.active is not None:
        return None
    if sol < 30:
        return None  # Too early to research

    # Priority order within each tier
    tier_priorities = {
        1: ["improved_solar", "water_recycling", "crop_optimization", "radiation_hardening"],
        2: ["moxie_upgrade", "dust_mitigation", "autonomous_repair", "crew_medicine"],
        3: ["nuclear_thermal", "closed_ecosystem", "mars_steel"],
    }

    for tier in [1, 2, 3]:
        for slug in tier_priorities[tier]:
            can, _ = lab.can_research(slug, resources)
            if can:
                return slug
    return None
