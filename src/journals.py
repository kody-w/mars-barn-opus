"""Mars Barn Opus — Procedural Crew Journals

Each crew member writes a daily journal entry generated from their
current state. No scripted content — every entry is emergent from
sim data: health, morale, role, events, relationships, environment.

The journal IS the crew member's inner life. It's what makes
Chen W. feel like a person instead of a health bar.
"""
from __future__ import annotations

import hashlib
import random
from typing import Dict, List, Optional


# Mood templates based on morale ranges
MOOD_TEMPLATES = {
    "high": [  # morale > 80
        "Feeling good today.",
        "Can't complain. Well, I can, but why bother?",
        "Morale is high. We've got this.",
        "Woke up feeling optimistic for the first time in a while.",
        "Good day. The kind that makes you forget you're 225 million km from home.",
    ],
    "medium": [  # 50-80
        "Another sol. We keep going.",
        "Not great, not terrible. The Mars baseline.",
        "Routine is starting to feel comfortable. That worries me a little.",
        "Missing Earth today but keeping busy helps.",
        "The work keeps us sane. Mostly.",
    ],
    "low": [  # 20-50
        "Hard to stay positive today.",
        "Morale is slipping. I can see it in everyone's eyes.",
        "Counting the sols. Shouldn't do that.",
        "The silence here gets to you. Not the quiet — the silence.",
        "We need a win. Something. Anything.",
    ],
    "critical": [  # < 20
        "I don't know how much longer we can keep this up.",
        "Nobody's talking at meals anymore.",
        "Starting to forget what rain sounds like.",
        "If something doesn't change soon...",
        "Wrote a letter home today. Didn't send it.",
    ],
}

# Role-specific observations
ROLE_OBSERVATIONS = {
    "CMDR": [
        "Reviewed crew reports. {crew_note}",
        "Made the hard call on resource allocation today. {resource_note}",
        "Leadership means carrying what others can't see.",
        "Ran team briefing this morning. {event_note}",
        "The weight of command is lighter when the crew is strong.",
    ],
    "ENGR": [
        "Ran diagnostics on {system}. {system_note}",
        "The {system} is {status}. {fix_note}",
        "Fixed a pressure seal on the airlock. Small victories.",
        "Power readings look {power_note}. Adjusted the panels.",
        "Machines don't lie. They just break.",
    ],
    "SCI": [
        "Soil samples from sector 7 show {science_note}.",
        "Research is progressing. {research_note}",
        "The regolith here is different than expected. Documenting everything.",
        "Greenhouse yields are {food_note}. Adjusting nutrient mix.",
        "Data doesn't care about morale. It just is.",
    ],
    "MED": [
        "Crew health check: {health_note}",
        "Radiation exposure is {rad_note}. Monitoring closely.",
        "{patient_note}",
        "Sleep patterns across the crew are {sleep_note}.",
        "The body adapts. The mind takes longer.",
    ],
}

# Event reactions
EVENT_REACTIONS = {
    "dust_storm": [
        "Dust storm hit. Visibility near zero. We're buttoned up tight.",
        "Day {remaining} of the storm. The sound of sand on the dome is constant.",
        "Can't see the sun through the dust. Solar output has cratered.",
        "Storm's still raging. The hab walls creak with every gust.",
    ],
    "solar_flare": [
        "Radiation alarm went off at {time}. Everyone to the shelter.",
        "Solar event. Spent the sol huddled in the rad shelter playing cards.",
        "The instruments went haywire during the flare. Recalibrating everything.",
    ],
    "meteorite": [
        "Impact. Close enough to feel it. Damage assessment ongoing.",
        "Meteorite strike. My hands were shaking during the inspection.",
        "The surface has a new crater about 200m east. Too close.",
    ],
    "equipment_failure": [
        "Equipment failure in the ISRU plant. All hands on repairs.",
        "System malfunction. Rodriguez worked through the night to fix it.",
        "The backup systems kicked in but that's our safety margin gone.",
    ],
    "construction_complete": [
        "New module online: {module}. It's growing. This place is becoming something.",
        "Watched the {module} come online today. Progress feels tangible.",
        "The {module} is operational. One step closer to self-sufficiency.",
    ],
    "research_complete": [
        "Research breakthrough: {tech}. The data finally clicked.",
        "Months of work paid off. {tech} is now operational knowledge.",
        "{tech} research complete. Knowledge is the one thing Mars can't take from us.",
    ],
}

# Relationship snippets (based on crew alive/dead)
RELATIONSHIP_NOTES = {
    "bond": [
        "{name} and I had a long talk after dinner. Needed that.",
        "Checked in on {name}. {pronoun} seems {state}.",
        "{name} made everyone laugh today. Small mercies.",
        "Working alongside {name} on repairs. Good to have someone competent.",
    ],
    "loss": [
        "Keep thinking about {name}. The empty chair at the table.",
        "Found {name}'s notes in the lab today. Couldn't read them.",
        "It's quieter without {name}. The wrong kind of quiet.",
    ],
    "solo": [
        "I'm the last one. Just me and the machines now.",
        "The dome feels enormous when you're alone in it.",
        "Talking to myself. Recording everything. Someone should know what happened.",
    ],
}


def generate_journal_entry(crew_member: Dict, colony_state: Dict,
                           events: List[Dict], sol: int,
                           seed: int = 0) -> str:
    """Generate a journal entry for one crew member for one sol.

    Args:
        crew_member: Dict with name, role, hp, mor, alive, st, rad
        colony_state: Dict with o2, h2o, food, power, int_temp, modules, etc.
        events: List of active events this sol
        sol: Current sol number
        seed: RNG seed for deterministic generation
    """
    if not crew_member.get("alive", True):
        return ""

    name_bytes = crew_member.get("name", "").encode("utf-8")
    stable_name = int.from_bytes(
        hashlib.sha256(name_bytes).digest()[:8],
        "big",
    )
    rng = random.Random(sol * 1000 + seed + stable_name)
    lines = []

    name = crew_member.get("name", "Unknown")
    role = crew_member.get("role", "CREW")
    hp = crew_member.get("hp", 100)
    morale = crew_member.get("mor", 80)
    status = crew_member.get("st", "Nominal")
    rad = crew_member.get("rad", 0)

    # Header
    lines.append(f"**Sol {sol} — {name} ({role})**")
    lines.append("")

    # Mood line based on morale
    if morale > 80:
        mood_pool = MOOD_TEMPLATES["high"]
    elif morale > 50:
        mood_pool = MOOD_TEMPLATES["medium"]
    elif morale > 20:
        mood_pool = MOOD_TEMPLATES["low"]
    else:
        mood_pool = MOOD_TEMPLATES["critical"]
    lines.append(rng.choice(mood_pool))

    # Status-specific line
    if status == "STARVING":
        lines.append("Haven't eaten properly in days. The ration packs mock us.")
    elif status == "DEHYDRATED":
        lines.append("Water recycler is barely keeping up. Every drop counts.")
    elif status == "HYPOTHERMIC":
        lines.append("Cold. The kind that gets into your bones. Heating can't keep up.")
    elif hp < 50:
        lines.append(f"Not feeling great. Health at {hp:.0f}%. Pushing through.")

    # Role-specific observation
    role_pool = ROLE_OBSERVATIONS.get(role, ROLE_OBSERVATIONS["ENGR"])
    template = rng.choice(role_pool)

    # Fill in template variables
    o2_days = colony_state.get("o2_days", 30)
    food_days = colony_state.get("food_days", 30)
    power = colony_state.get("power", 500)
    modules = colony_state.get("modules", [])

    replacements = {
        "{crew_note}": "Everyone's holding up." if morale > 60 else "Some cracks showing.",
        "{resource_note}": f"O2 at {o2_days:.0f} days. {'Comfortable.' if o2_days > 15 else 'Getting tight.'}",
        "{event_note}": "Briefed the team on today's priorities." if not events else f"Addressed the {events[0].get('type', 'situation')}.",
        "{system}": rng.choice(["solar array", "ISRU unit", "greenhouse", "water recycler"]),
        "{system_note}": "Running within parameters." if hp > 70 else "Needs attention.",
        "{status}": "nominal" if power > 200 else "degraded",
        "{fix_note}": "Should hold for now." if power > 100 else "Jury-rigged. Again.",
        "{power_note}": "strong" if power > 300 else "concerning" if power > 100 else "critical",
        "{science_note}": "promising mineral content" if sol % 7 == 0 else "expected composition",
        "{research_note}": f"We have {len(colony_state.get('research', []))} breakthroughs so far.",
        "{food_note}": "steady" if food_days > 20 else "declining",
        "{health_note}": f"Average crew health at {hp:.0f}%.",
        "{rad_note}": f"{rad:.0f} mSv cumulative" + (". Within limits." if rad < 500 else ". Concerning."),
        "{patient_note}": "No injuries to report." if hp > 80 else f"Treating minor issues. Keeping everyone functional.",
        "{sleep_note}": "irregular" if morale < 50 else "stable",
    }
    for key, val in replacements.items():
        template = template.replace(key, val)
    lines.append(template)

    # Event reactions
    for event in events[:2]:  # Max 2 event reactions
        etype = event.get("type", "")
        if etype in EVENT_REACTIONS:
            pool = EVENT_REACTIONS[etype]
            tmpl = rng.choice(pool)
            remaining = event.get("remaining", 0)
            module = event.get("module", "new module")
            tech = event.get("tech", "new technology")
            tmpl = tmpl.replace("{remaining}", str(remaining))
            tmpl = tmpl.replace("{time}", f"{rng.randint(2,22):02d}:00")
            tmpl = tmpl.replace("{module}", module.replace("_", " "))
            tmpl = tmpl.replace("{tech}", tech.replace("_", " "))
            lines.append(tmpl)

    # Relationship note (occasional)
    other_crew = colony_state.get("crew", [])
    alive_others = [c for c in other_crew
                    if c.get("alive", True) and c.get("name") != name]
    dead_others = [c for c in other_crew
                   if not c.get("alive", True)]

    if rng.random() < 0.4:  # 40% chance of relationship note
        if not alive_others and not dead_others:
            pass  # Solo, handled below
        elif dead_others and rng.random() < 0.3:
            dead = rng.choice(dead_others)
            tmpl = rng.choice(RELATIONSHIP_NOTES["loss"])
            lines.append(tmpl.replace("{name}", dead.get("name", "them")))
        elif alive_others:
            other = rng.choice(alive_others)
            tmpl = rng.choice(RELATIONSHIP_NOTES["bond"])
            pronoun = "They"
            other_morale = other.get("mor", 80)
            other_state = "doing well" if other_morale > 60 else "struggling"
            tmpl = tmpl.replace("{name}", other.get("name", "a crewmate"))
            tmpl = tmpl.replace("{pronoun}", pronoun)
            tmpl = tmpl.replace("{state}", other_state)
            lines.append(tmpl)

    if len(alive_others) == 0 and not dead_others:
        lines.append(rng.choice(RELATIONSHIP_NOTES["solo"]))

    # Closing thought (occasional)
    if rng.random() < 0.3:
        closings = [
            "End of sol. Tomorrow we do it again.",
            f"Sol {sol}. Still here.",
            "The stars look different from here. Closer, somehow.",
            "Mars doesn't care about us. That's what makes surviving it mean something.",
            "One more sol. That's all we ever need.",
        ]
        lines.append("")
        lines.append(f"*{rng.choice(closings)}*")

    return "\n".join(lines)


def generate_all_journals(crew: List[Dict], colony_state: Dict,
                          events: List[Dict], sol: int) -> List[Dict]:
    """Generate journal entries for all living crew members."""
    journals = []
    for i, member in enumerate(crew):
        if member.get("alive", True):
            entry = generate_journal_entry(member, colony_state, events, sol, seed=i)
            journals.append({
                "name": member.get("name", "Unknown"),
                "role": member.get("role", "CREW"),
                "sol": sol,
                "entry": entry,
            })
    return journals
