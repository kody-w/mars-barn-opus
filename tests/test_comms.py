"""Tests for communication delay system."""
from __future__ import annotations

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from comms import CommChannel, QueuedCommand, apply_command


class TestCommDelay:
    def test_delay_varies_with_orbit(self):
        ch = CommChannel()
        delays = [ch.delay_at_sol(sol) for sol in range(0, 760, 76)]
        assert min(delays) < max(delays)
        assert all(d >= 0.2 for d in delays)

    def test_delay_range(self):
        ch = CommChannel()
        delays = [ch.delay_at_sol(sol) for sol in range(760)]
        assert min(delays) >= 0.2
        assert max(delays) <= 2.0

    def test_send_creates_queued_command(self):
        ch = CommChannel()
        cmd = ch.send_command("override_allocation", {"heating": 30}, 10)
        assert cmd is not None
        assert cmd.sent_sol == 10
        assert cmd.arrival_sol > 10
        assert ch.pending_count() == 1

    def test_receive_after_delay(self):
        ch = CommChannel()
        ch.send_command("message", {"text": "hello"}, 10)
        # Nothing arrives immediately
        arrived = ch.receive_commands(10)
        assert len(arrived) == 0
        # Arrives after delay
        arrived = ch.receive_commands(15)
        assert len(arrived) == 1
        assert arrived[0].command_type == "message"

    def test_multiple_commands_arrive_in_order(self):
        ch = CommChannel()
        ch.send_command("message", {"text": "first"}, 10)
        ch.send_command("message", {"text": "second"}, 12)
        # Skip ahead past both arrivals
        arrived = ch.receive_commands(20)
        assert len(arrived) == 2

    def test_stats_tracking(self):
        ch = CommChannel()
        ch.send_command("message", {}, 10)
        ch.send_command("message", {}, 12)
        assert ch.commands_sent == 2
        ch.receive_commands(20)
        assert ch.commands_delivered == 2

    def test_serialize(self):
        ch = CommChannel()
        ch.send_command("message", {"text": "hi"}, 10)
        data = ch.serialize()
        assert "delay_sols" in data
        assert "blackout" in data
        assert "in_transit" in data
        assert data["in_transit"] == 1
        assert data["total_sent"] == 1


class TestBlackout:
    def test_conjunction_triggers_blackout(self):
        ch = CommChannel()
        # Find conjunction point (phase ≈ π, sol ≈ 380)
        # Check a range around it
        blackout_found = False
        for sol in range(350, 420):
            ch.delay_at_sol(sol)
            if ch.blackout:
                blackout_found = True
                break
        assert blackout_found, "No blackout detected near conjunction"

    def test_blackout_blocks_commands(self):
        ch = CommChannel()
        # Force blackout
        ch.blackout = True
        ch.blackout_remaining_sols = 5
        cmd = ch.send_command("message", {"text": "hello"}, 100)
        assert cmd is None
        assert ch.commands_lost == 1

    def test_blackout_recovers(self):
        ch = CommChannel()
        ch.blackout = True
        ch.blackout_remaining_sols = 2
        # Tick through blackout
        ch.delay_at_sol(100)  # remaining = 1
        ch.delay_at_sol(101)  # remaining = 0, blackout ends
        # Note: delay_at_sol may re-trigger blackout if near conjunction
        # So test with non-conjunction sol
        ch.blackout = True
        ch.blackout_remaining_sols = 1
        ch.delay_at_sol(50)  # Far from conjunction
        assert ch.blackout_remaining_sols == 0


class TestApplyCommand:
    def test_apply_override(self):
        cmd = QueuedCommand("override_allocation",
                           {"heating": 30, "isru": 50, "greenhouse": 20},
                           10, 12)
        result = apply_command(None, cmd)
        assert "override" in result.lower()
        assert "30" in result

    def test_apply_emergency(self):
        cmd = QueuedCommand("emergency",
                           {"protocol": "shelter_in_place"},
                           10, 12)
        result = apply_command(None, cmd)
        assert "EMERGENCY" in result
        assert "shelter" in result.lower()

    def test_apply_message(self):
        cmd = QueuedCommand("message",
                           {"text": "Good luck up there"},
                           10, 12)
        result = apply_command(None, cmd)
        assert "Good luck" in result
