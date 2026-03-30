"""Mars Barn Opus — AI Code Generation for LisPy VM

The AI governor writes its own LisPy control programs based on
current colony state and echo frame history. Not hardcoded.
Emergent code from emergent data.

The governor observes the colony through echo frames, identifies
patterns (declining O2, food crisis, power surplus), and generates
a LisPy program to handle the current situation. The program runs
in the VM and controls the colony for the next N sols until
conditions change enough to trigger a rewrite.

This is turtles all the way down: the simulation generates data,
the data generates code, the code controls the simulation.
"""
from __future__ import annotations

from typing import Dict, List, Optional


def analyze_trends(echo_history: List[Dict], window: int = 10) -> Dict:
    """Analyze recent echo frames for resource trends.

    Returns a trend dict with direction and urgency for each resource.
    """
    if len(echo_history) < 3:
        return {"o2": "stable", "food": "stable", "power": "stable",
                "h2o": "stable", "crisis": False, "trend_window": 0}

    recent = echo_history[-window:]
    trends = {}

    for resource in ["o2", "food", "power", "h2o"]:
        deltas = [e.get("delta", {}).get(resource, 0) for e in recent]
        avg_delta = sum(deltas) / len(deltas) if deltas else 0

        if avg_delta < -2:
            trends[resource] = "declining_fast"
        elif avg_delta < -0.5:
            trends[resource] = "declining"
        elif avg_delta > 2:
            trends[resource] = "growing_fast"
        elif avg_delta > 0.5:
            trends[resource] = "growing"
        else:
            trends[resource] = "stable"

    # Crisis detection
    last = echo_history[-1] if echo_history else {}
    o2_days = last.get("o2_days", 30)
    food_days = last.get("food_days", 30)
    crew_alive = last.get("crew_alive", 4)

    trends["crisis"] = o2_days < 7 or food_days < 7 or crew_alive < 3
    trends["o2_days"] = o2_days
    trends["food_days"] = food_days
    trends["crew_alive"] = crew_alive
    trends["trend_window"] = len(recent)
    trends["events_recent"] = sum(len(e.get("events", [])) for e in recent)

    return trends


def generate_lispy_program(trends: Dict, colony_state: Dict,
                           personality: Dict = None) -> str:
    """Generate a LisPy control program from observed trends.

    The generated program is reactive to current conditions and
    informed by recent trend analysis. Different personality traits
    produce different programs for the same situation.

    Args:
        trends: Output of analyze_trends()
        colony_state: Current colony state dict
        personality: Governor trait dict (optional)
    """
    if personality is None:
        personality = {"risk": 0.5, "aggression": 0.5, "trust": 0.5}

    risk = personality.get("risk", 0.5)
    aggression = personality.get("aggression", 0.5)

    lines = [";; Auto-generated LisPy control program",
             f";; Generated for: o2={trends.get('o2_days', '?')}d "
             f"food={trends.get('food_days', '?')}d "
             f"crew={trends.get('crew_alive', '?')}",
             f";; Trends: o2={trends.get('o2', '?')} "
             f"food={trends.get('food', '?')} "
             f"power={trends.get('power', '?')}",
             "(begin"]

    # Crisis handler — always generated, priority depends on personality
    o2_threshold = int(5 + 5 * (1 - risk))  # Risk-averse = higher threshold
    food_threshold = int(7 + 5 * (1 - risk))

    lines.append(f"  ;; Crisis detection (risk tolerance: {risk:.1f})")
    lines.append(f"  (define o2_crisis (< o2_days {o2_threshold}))")
    lines.append(f"  (define food_crisis (< food_days {food_threshold}))")
    lines.append(f"  (define power_crisis (< power_kwh {int(50 + 100 * (1 - risk))}))")

    # Reactive allocation based on trends
    if trends.get("crisis"):
        # Emergency mode — personality barely matters
        lines.append("  ;; EMERGENCY: crisis detected")
        lines.append("  (cond")
        lines.append("    (o2_crisis (begin")
        lines.append("      (set! isru_alloc 0.75)")
        lines.append("      (set! heating_alloc 0.10)")
        lines.append("      (set! greenhouse_alloc 0.15)")
        lines.append("      (set! food_ration 0.50)))")
        lines.append("    (food_crisis (begin")
        lines.append("      (set! greenhouse_alloc 0.60)")
        lines.append("      (set! isru_alloc 0.25)")
        lines.append("      (set! heating_alloc 0.15)")
        lines.append("      (set! food_ration 0.75)))")
        lines.append("    (power_crisis (begin")
        lines.append("      (set! heating_alloc 0.45)")
        lines.append("      (set! isru_alloc 0.30)")
        lines.append("      (set! greenhouse_alloc 0.25)")
        lines.append("      (set! food_ration 0.80)))")
        lines.append("    (true (begin")  # Fallback
    else:
        lines.append("  ;; Normal operations — personality-driven")
        lines.append("  (cond")
        lines.append("    (o2_crisis (begin")
        lines.append("      (set! isru_alloc 0.70)")
        lines.append("      (set! heating_alloc 0.15)")
        lines.append("      (set! greenhouse_alloc 0.15)")
        lines.append("      (set! food_ration 0.60)))")
        lines.append("    (food_crisis (begin")
        lines.append("      (set! greenhouse_alloc 0.55)")
        lines.append("      (set! isru_alloc 0.30)")
        lines.append("      (set! heating_alloc 0.15)")
        lines.append("      (set! food_ration 0.75)))")
        lines.append("    (true (begin")

    # Personality-driven stable allocation
    heat = 0.30 - 0.15 * risk
    isru = 0.30 + 0.10 * aggression
    gh = 1.0 - heat - isru

    # Trend adjustments
    if trends.get("o2") == "declining_fast":
        isru += 0.10
        gh -= 0.10
        lines.append(f"      ;; O2 declining fast — boosting ISRU")
    elif trends.get("o2") == "declining":
        isru += 0.05
        gh -= 0.05
        lines.append(f"      ;; O2 declining — slight ISRU boost")

    if trends.get("food") == "declining_fast":
        gh += 0.10
        isru -= 0.10
        lines.append(f"      ;; Food declining fast — boosting greenhouse")
    elif trends.get("food") == "declining":
        gh += 0.05
        isru -= 0.05

    if trends.get("power") == "declining_fast":
        heat -= 0.05
        lines.append(f"      ;; Power declining — reducing heating")

    # Clamp
    heat = max(0.05, min(0.50, heat))
    isru = max(0.10, min(0.80, isru))
    gh = max(0.10, min(0.70, gh))
    total = heat + isru + gh
    heat /= total
    isru /= total
    gh /= total

    ration = 0.75 + 0.25 * personality.get("trust", 0.5)
    food_days = trends.get("food_days", 30)
    if food_days < 15:
        ration = 0.60 + 0.20 * personality.get("trust", 0.5)

    lines.append(f"      (set! heating_alloc {heat:.2f})")
    lines.append(f"      (set! isru_alloc {isru:.2f})")
    lines.append(f"      (set! greenhouse_alloc {gh:.2f})")
    lines.append(f"      (set! food_ration {ration:.2f}))))")

    # Event response — if events detected recently
    if trends.get("events_recent", 0) > 3:
        lines.append("  ;; High event frequency — defensive posture")
        lines.append("  (if (> events_active 2)")
        lines.append("    (begin")
        lines.append("      (set! heating_alloc (+ heating_alloc 0.05))")
        lines.append("      (set! isru_alloc (- isru_alloc 0.05))))")

    lines.append(")")  # Close begin
    return "\n".join(lines)


def should_rewrite(echo_history: List[Dict], last_rewrite_sol: int,
                   min_interval: int = 10) -> bool:
    """Determine if the LisPy program should be rewritten.

    Triggers rewrite when:
    - At least min_interval sols since last rewrite
    - Resource trend changed direction
    - Crisis entered or exited
    - Crew member lost
    """
    if not echo_history:
        return True
    current_sol = echo_history[-1].get("frame", 0)
    if current_sol - last_rewrite_sol < min_interval:
        return False

    # Check for significant changes
    recent = echo_history[-5:]
    older = echo_history[-10:-5] if len(echo_history) >= 10 else []

    if not older:
        return current_sol >= min_interval

    # Trend reversal detection
    recent_o2_trend = sum(e.get("delta", {}).get("o2", 0) for e in recent)
    older_o2_trend = sum(e.get("delta", {}).get("o2", 0) for e in older)
    if (recent_o2_trend > 0) != (older_o2_trend > 0):
        return True  # O2 trend reversed

    # Crisis detection
    last = echo_history[-1]
    prev = echo_history[-min_interval] if len(echo_history) > min_interval else echo_history[0]
    if last.get("crew_alive", 4) < prev.get("crew_alive", 4):
        return True  # Crew loss

    # Periodic rewrite
    return current_sol - last_rewrite_sol >= min_interval * 3


class AdaptiveCodeGenGovernor:
    """A governor that writes and rewrites its own LisPy programs.

    Observes echo frames → analyzes trends → generates code →
    runs code in VM → observes results → rewrites if needed.

    The governor is its own programmer.
    """

    def __init__(self, personality: Dict = None):
        from lispy import LispyVM
        self.vm = LispyVM()
        self.personality = personality or {"risk": 0.5, "aggression": 0.5, "trust": 0.5}
        self.current_program: Optional[str] = None
        self.last_rewrite_sol: int = 0
        self.programs_written: int = 0
        self.program_log: List[Dict] = []

    def decide(self, colony_state: Dict, echo_history: List[Dict]) -> Dict:
        """Make allocation decision, potentially rewriting the control program.

        Returns allocation dict: {heating, isru, greenhouse, ration}
        """
        current_sol = colony_state.get("sol", 0)

        # Check if we need to rewrite
        if self.current_program is None or should_rewrite(
                echo_history, self.last_rewrite_sol):
            trends = analyze_trends(echo_history)
            self.current_program = generate_lispy_program(
                trends, colony_state, self.personality)
            self.last_rewrite_sol = current_sol
            self.programs_written += 1
            self.program_log.append({
                "sol": current_sol,
                "program": self.current_program,
                "reason": "initial" if self.programs_written == 1 else "adaptation",
            })

        # Load state into VM
        self.vm.load_colony_state(colony_state)
        self.vm.set_env("heating_alloc", 0.25)
        self.vm.set_env("isru_alloc", 0.40)
        self.vm.set_env("greenhouse_alloc", 0.35)
        self.vm.set_env("food_ration", 1.0)

        # Run the self-written program
        try:
            self.vm.run_program(self.current_program)
        except Exception:
            pass  # Fall back to defaults

        return self.vm.get_allocation()

    def serialize(self) -> Dict:
        """Serialize for twin state."""
        return {
            "programs_written": self.programs_written,
            "last_rewrite_sol": self.last_rewrite_sol,
            "current_program": self.current_program,
            "personality": self.personality,
        }
