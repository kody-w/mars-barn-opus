"""Mars Barn Opus — Mission Log

Persistent narrative log of colony events. Human-readable prose
that records what happened each sol. This is what the operator reads
to understand the colony's history.

Writes to a text file that the physical twin operator can read.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

from colony import Colony


class MissionLog:
    """Append-only mission log with sol-by-sol narrative."""

    def __init__(self, path: str = "/tmp/mars-mission-log.txt"):
        self.path = path
        self.entries: List[str] = []
        # Write header
        self._write(f"{'='*60}")
        self._write(f"MARS BARN OPUS — MISSION LOG")
        self._write(f"Generated: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
        self._write(f"{'='*60}\n")

    def _write(self, line: str) -> None:
        """Append a line to the log file and memory."""
        self.entries.append(line)
        with open(self.path, "a") as f:
            f.write(line + "\n")

    def log_sol(self, colony: Colony, events: List[str],
                crew_events: List[str], allocation_desc: str,
                env_desc: str) -> None:
        """Record one sol's narrative."""
        sol = colony.sol
        r = colony.resources

        # Sol header
        self._write(f"--- Sol {sol} ---")

        # Environment
        self._write(f"  Environment: {env_desc}")

        # Governor decision
        self._write(f"  Governor: {allocation_desc}")

        # Resources summary
        o2_days = r.days_of("o2")
        h2o_days = r.days_of("h2o")
        food_days = r.days_of("food")
        self._write(f"  Resources: O2 {o2_days:.0f}d | H2O {h2o_days:.0f}d | "
                     f"Food {food_days:.0f}d | Power {r.power_kwh:.0f} kWh")

        # Events
        for event in events:
            self._write(f"  EVENT: {event}")

        # Crew events
        for ce in crew_events:
            self._write(f"  CREW: {ce}")

        # Crew status summary
        if colony.crew:
            alive = colony.crew.alive_count
            total = len(colony.crew.members)
            health = colony.crew.avg_health
            self._write(f"  Crew: {alive}/{total} alive, "
                         f"avg health {health:.0f}%, "
                         f"morale {colony.crew.avg_morale:.0f}%")

        # Cascade warning
        if colony.cascade_state.value != "nominal":
            self._write(f"  WARNING: Cascade state — {colony.cascade_state.value}")

        self._write("")  # Blank line between sols

    def log_death(self, colony: Colony) -> None:
        """Record colony death."""
        self._write(f"{'='*60}")
        self._write(f"COLONY LOST — Sol {colony.sol}")
        self._write(f"Cause: {colony.cause_of_death}")
        if colony.crew:
            for m in colony.crew.members:
                status = "SURVIVED" if m.alive else f"DECEASED ({m.cause_of_death})"
                self._write(f"  {m.name} ({m.role.value}): {status}")
        self._write(f"{'='*60}")

    def log_survival(self, colony: Colony, max_sols: int) -> None:
        """Record successful mission completion."""
        self._write(f"{'='*60}")
        self._write(f"MISSION COMPLETE — Sol {colony.sol}/{max_sols}")
        if colony.crew:
            for m in colony.crew.members:
                status = "SURVIVED" if m.alive else f"DECEASED ({m.cause_of_death})"
                self._write(f"  {m.name} ({m.role.value}): {status}")
        self._write(f"{'='*60}")
