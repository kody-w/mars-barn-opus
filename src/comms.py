"""Mars Barn Opus — Communication Delay

Earth-Mars communication with realistic light-speed delay.
Commands from the operator arrive delayed. The colony must survive
autonomously during the gap. This is the core tension of real
Mars operations.

Light delay: 4-24 minutes one-way depending on orbital position.
Round-trip: 8-48 minutes. At opposition (closest): ~4 min.
At conjunction (farthest, behind the Sun): ~24 min.
During solar conjunction: total blackout for ~2 weeks.

In the simulation, delay is measured in sols (not minutes) for
playability, but the principle is the same: the operator cannot
react in real time. The colony lives or dies on its own decisions.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Dict

from config import MARS_YEAR_SOLS


@dataclass
class QueuedCommand:
    """A command in transit from Earth to Mars."""
    command_type: str         # "override_allocation", "emergency", "message"
    payload: Dict             # Command-specific data
    sent_sol: int             # Sol when operator sent it
    arrival_sol: int          # Sol when colony receives it
    description: str = ""    # Human-readable description

    @property
    def in_transit(self) -> bool:
        """Whether this command is still in transit."""
        return True  # Checked by CommChannel against current sol


@dataclass
class CommChannel:
    """Earth-Mars communication channel with light-speed delay."""
    queue: List[QueuedCommand] = field(default_factory=list)
    delivered: List[QueuedCommand] = field(default_factory=list)
    blackout: bool = False
    blackout_remaining_sols: int = 0
    current_delay_sols: float = 0.5  # Default: half a sol (~12 hours)

    # Telemetry stats
    commands_sent: int = 0
    commands_delivered: int = 0
    commands_lost: int = 0  # Lost during blackout

    def delay_at_sol(self, sol: int) -> float:
        """Calculate communication delay based on orbital position.

        Models Earth-Mars distance varying with orbital mechanics:
        - Opposition (~closest): 0.3 sols delay (~7 hours round-trip)
        - Quadrature (90°): 0.7 sols delay
        - Conjunction (~farthest): 1.5 sols delay (~36 hours round-trip)
        - Solar conjunction: BLACKOUT (no comms for ~14 sols)

        Simplified: sinusoidal approximation of synodic period.
        Earth-Mars synodic period ≈ 780 days ≈ 760 sols.
        """
        synodic_period = 760.0  # sols
        phase = 2 * math.pi * sol / synodic_period

        # Base delay: varies from 0.3 to 1.5 sols
        base_delay = 0.9 + 0.6 * math.cos(phase)

        # Solar conjunction blackout: ~14 sols every synodic period
        # Conjunction happens at phase ≈ π (halfway through synodic period)
        conjunction_distance = abs(math.sin(phase))
        if conjunction_distance < 0.05:  # Within ~3% of conjunction
            self.blackout = True
            self.blackout_remaining_sols = max(
                self.blackout_remaining_sols,
                int(14 * (1.0 - conjunction_distance / 0.05))
            )
        elif self.blackout_remaining_sols > 0:
            self.blackout_remaining_sols -= 1
            if self.blackout_remaining_sols <= 0:
                self.blackout = False

        self.current_delay_sols = max(0.2, base_delay)
        return self.current_delay_sols

    def send_command(self, command_type: str, payload: Dict,
                     current_sol: int, description: str = "") -> Optional[QueuedCommand]:
        """Send a command from Earth. Returns the queued command, or None if blackout."""
        delay = self.delay_at_sol(current_sol)

        if self.blackout:
            self.commands_lost += 1
            return None

        arrival = current_sol + max(1, int(math.ceil(delay)))
        cmd = QueuedCommand(
            command_type=command_type,
            payload=payload,
            sent_sol=current_sol,
            arrival_sol=arrival,
            description=description or f"{command_type} (delay: {delay:.1f} sols)",
        )
        self.queue.append(cmd)
        self.commands_sent += 1
        return cmd

    def receive_commands(self, current_sol: int) -> List[QueuedCommand]:
        """Check for commands that have arrived this sol."""
        arrived = [cmd for cmd in self.queue if cmd.arrival_sol <= current_sol]
        self.queue = [cmd for cmd in self.queue if cmd.arrival_sol > current_sol]
        self.delivered.extend(arrived)
        self.commands_delivered += len(arrived)
        return arrived

    def pending_count(self) -> int:
        """Number of commands still in transit."""
        return len(self.queue)

    def serialize(self) -> Dict:
        """Serialize for twin state."""
        return {
            "delay_sols": round(self.current_delay_sols, 2),
            "blackout": self.blackout,
            "blackout_remaining": self.blackout_remaining_sols,
            "in_transit": self.pending_count(),
            "total_sent": self.commands_sent,
            "total_delivered": self.commands_delivered,
            "total_lost": self.commands_lost,
            "queue": [
                {"type": cmd.command_type, "sent": cmd.sent_sol,
                 "arrives": cmd.arrival_sol, "desc": cmd.description}
                for cmd in self.queue
            ],
        }


def apply_command(colony, cmd: QueuedCommand) -> str:
    """Apply a delivered command to the colony. Returns description of effect."""
    from colony import Allocation

    if cmd.command_type == "override_allocation":
        # Override takes effect immediately on arrival
        p = cmd.payload
        return (f"Allocation override received (sent sol {cmd.sent_sol}): "
                f"H:{p.get('heating', 25)}% I:{p.get('isru', 40)}% "
                f"G:{p.get('greenhouse', 35)}%")

    elif cmd.command_type == "emergency":
        protocol = cmd.payload.get("protocol", "unknown")
        if protocol == "shelter_in_place":
            return f"EMERGENCY: Shelter in place ordered (sent sol {cmd.sent_sol})"
        elif protocol == "emergency_isru":
            return f"EMERGENCY: All power to ISRU (sent sol {cmd.sent_sol})"
        elif protocol == "reduce_rations":
            level = cmd.payload.get("level", 50)
            return f"EMERGENCY: Rations reduced to {level}% (sent sol {cmd.sent_sol})"
        return f"EMERGENCY: {protocol} (sent sol {cmd.sent_sol})"

    elif cmd.command_type == "message":
        text = cmd.payload.get("text", "")
        return f"Message from Earth (sent sol {cmd.sent_sol}): {text}"

    return f"Unknown command: {cmd.command_type}"
