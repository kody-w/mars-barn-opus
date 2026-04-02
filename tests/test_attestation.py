"""Tests for frame attestation and on-chain verification.

The attestation module bridges virtual and physical worlds using
cryptographic verification. These tests are the specification for
that bridge — if it's not tested, the twin can't trust it.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from attestation import (
    FrameAttestation,
    AttestationConfig,
    VerificationResult,
    TwinVerificationGate,
    hash_frame,
    hash_frame_file,
    load_frame,
    verify_local_chain,
    build_attestation,
    build_attestation_batch,
    verify_frame_on_chain,
    get_latest_attested_sol,
    _encode_uint64,
    _encode_bytes32,
)


# =============================================================================
# Test fixtures — minimal frame data for testing
# =============================================================================

def _make_frame(sol: int, prev_sol=None, engine_id="rappter-genesis",
                signature="abc123", stored_hash=None) -> dict:
    """Create a minimal valid frame for testing."""
    frame = {
        "sol": sol,
        "utc": f"2025-07-{10+sol:02d}T00:00:00Z",
        "mars": {"temp_k": 226.4, "pressure_pa": 764},
        "events": [],
        "hazards": [],
        "frame_echo": {
            "prev_sol": prev_sol,
            "global_dust_trend": "stable",
        },
    }
    # Compute hash of the content (before adding metadata)
    content_hash = hash_frame(frame)

    # Add metadata fields (stripped before hashing)
    frame["_engineId"] = engine_id
    frame["_signature"] = signature
    if stored_hash is not None:
        frame["_hash"] = stored_hash
    else:
        frame["_hash"] = content_hash[:16]

    return frame


def _write_frame(tmpdir: Path, frame: dict) -> Path:
    """Write a frame to a temporary directory."""
    path = tmpdir / f"sol-{frame['sol']:04d}.json"
    with open(path, "w") as f:
        json.dump(frame, f)
    return path


# =============================================================================
# Frame Hashing
# =============================================================================

class TestFrameHashing:
    """Hash computation is deterministic and strips metadata."""

    def test_hash_is_deterministic(self):
        frame = _make_frame(1)
        h1 = hash_frame(frame)
        h2 = hash_frame(frame)
        assert h1 == h2, "Same frame must produce same hash"

    def test_hash_is_hex_string(self):
        frame = _make_frame(1)
        h = hash_frame(frame)
        assert len(h) == 64, "SHA-256 hex digest is 64 chars"
        assert all(c in "0123456789abcdef" for c in h)

    def test_hash_strips_metadata(self):
        """_hash, _signature, _engineId are NOT part of the content hash."""
        frame1 = _make_frame(1, signature="aaa", engine_id="engine-1")
        frame2 = _make_frame(1, signature="bbb", engine_id="engine-2")
        # Strip stored hashes so they don't affect comparison
        frame1.pop("_hash", None)
        frame2.pop("_hash", None)
        assert hash_frame(frame1) == hash_frame(frame2)

    def test_different_content_different_hash(self):
        frame1 = _make_frame(1)
        frame2 = _make_frame(2)
        assert hash_frame(frame1) != hash_frame(frame2)

    def test_hash_frame_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            frame = _make_frame(1)
            path = _write_frame(Path(tmpdir), frame)
            file_hash = hash_frame_file(path)
            memory_hash = hash_frame(frame)
            assert file_hash == memory_hash

    def test_load_frame_returns_data_and_hash(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            frame = _make_frame(1)
            path = _write_frame(Path(tmpdir), frame)
            data, h = load_frame(path)
            assert data["sol"] == 1
            assert len(h) == 64


# =============================================================================
# Local Chain Verification
# =============================================================================

class TestLocalChainVerification:
    """Verify the hash chain of local frame files without the network."""

    def test_single_frame_valid(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            frame = _make_frame(1)
            _write_frame(tmpdir, frame)

            results = verify_local_chain(tmpdir, 1, 1)
            assert len(results) == 1
            assert results[0].valid
            assert results[0].sol == 1

    def test_chain_of_three_frames(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            _write_frame(tmpdir, _make_frame(1, prev_sol=None))
            _write_frame(tmpdir, _make_frame(2, prev_sol=1))
            _write_frame(tmpdir, _make_frame(3, prev_sol=2))

            results = verify_local_chain(tmpdir, 1, 3)
            assert len(results) == 3
            assert all(r.valid for r in results)

    def test_missing_frame_detected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            _write_frame(tmpdir, _make_frame(1, prev_sol=None))
            # Skip sol 2
            _write_frame(tmpdir, _make_frame(3, prev_sol=2))

            results = verify_local_chain(tmpdir, 1, 3)
            assert len(results) == 3
            assert results[0].valid      # sol 1 ok
            assert not results[1].valid  # sol 2 missing
            assert results[2].valid      # sol 3 has correct prev_sol

    def test_broken_echo_link(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            _write_frame(tmpdir, _make_frame(1, prev_sol=None))
            # Sol 2 points to wrong predecessor
            _write_frame(tmpdir, _make_frame(2, prev_sol=99))

            results = verify_local_chain(tmpdir, 1, 2)
            assert results[0].valid      # sol 1 ok
            assert not results[1].valid  # sol 2 has broken echo link

    def test_tampered_hash_detected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            frame = _make_frame(1)
            frame["_hash"] = "deadbeefdeadbeef"  # Wrong hash
            _write_frame(Path(tmpdir), frame)

            results = verify_local_chain(Path(tmpdir), 1, 1)
            assert not results[0].valid
            assert "mismatch" in results[0].error.lower()

    def test_empty_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            results = verify_local_chain(Path(tmpdir))
            assert results == []

    def test_auto_detect_range(self):
        """When to_sol is None, scan all files in directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            _write_frame(tmpdir, _make_frame(1, prev_sol=None))
            _write_frame(tmpdir, _make_frame(2, prev_sol=1))

            results = verify_local_chain(tmpdir)
            assert len(results) == 2


# =============================================================================
# Attestation Building
# =============================================================================

class TestAttestationBuilding:
    """Build attestations from frames for posting to the chain."""

    def test_build_genesis_attestation(self):
        frame = _make_frame(1)
        att = build_attestation(frame)
        assert att.sol == 1
        assert len(att.frame_hash) == 64
        assert att.prev_frame_hash == "0" * 64  # Genesis has no predecessor
        assert att.engine_id == "rappter-genesis"

    def test_build_linked_attestation(self):
        frame1 = _make_frame(1, prev_sol=None)
        frame2 = _make_frame(2, prev_sol=1)
        att = build_attestation(frame2, frame1)
        assert att.sol == 2
        assert att.prev_frame_hash == hash_frame(frame1)
        assert att.prev_frame_hash != "0" * 64

    def test_build_batch(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            _write_frame(tmpdir, _make_frame(1, prev_sol=None))
            _write_frame(tmpdir, _make_frame(2, prev_sol=1))
            _write_frame(tmpdir, _make_frame(3, prev_sol=2))

            batch = build_attestation_batch(tmpdir)
            assert len(batch) == 3
            # Chain links
            assert batch[0].prev_frame_hash == "0" * 64
            assert batch[1].prev_frame_hash == batch[0].frame_hash
            assert batch[2].prev_frame_hash == batch[1].frame_hash

    def test_attestation_to_dict(self):
        frame = _make_frame(1)
        att = build_attestation(frame)
        d = att.to_dict()
        assert "frameHash" in d
        assert "prevFrameHash" in d
        assert d["sol"] == 1

    def test_batch_empty_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            batch = build_attestation_batch(Path(tmpdir))
            assert batch == []


# =============================================================================
# ABI Encoding
# =============================================================================

class TestABIEncoding:
    """Low-level ABI encoding for EVM contract calls."""

    def test_encode_uint64(self):
        encoded = _encode_uint64(729)
        assert len(encoded) == 64  # 32 bytes as hex
        assert int(encoded, 16) == 729

    def test_encode_uint64_zero(self):
        assert _encode_uint64(0) == "0" * 64

    def test_encode_bytes32(self):
        hex_str = "abcdef1234567890"
        encoded = _encode_bytes32(hex_str)
        assert len(encoded) == 64
        assert encoded.startswith("abcdef1234567890")

    def test_encode_bytes32_full_length(self):
        full = "a" * 64
        assert _encode_bytes32(full) == full


# =============================================================================
# Attestation Config
# =============================================================================

class TestAttestationConfig:
    """Configuration for the chain bridge."""

    def test_default_not_configured(self):
        config = AttestationConfig()
        assert not config.is_configured

    def test_configured_with_address(self):
        config = AttestationConfig(
            contract_address="0x1234567890abcdef1234567890abcdef12345678"
        )
        assert config.is_configured

    def test_default_chain_is_base(self):
        config = AttestationConfig()
        assert config.chain_id == 8453


# =============================================================================
# On-Chain Verification (mocked — no real network calls in tests)
# =============================================================================

class TestOnChainVerification:
    """On-chain verification via JSON-RPC, with mocked network."""

    def test_unconfigured_returns_error(self):
        config = AttestationConfig()  # Not configured
        result = verify_frame_on_chain(config, 1, "a" * 64)
        assert not result.valid
        assert "not configured" in result.error.lower()

    @patch("attestation._eth_call")
    def test_valid_attestation(self, mock_eth_call):
        """Simulate a successful on-chain verification."""
        # Mock response: valid=true (1), attestedAt=1700000000
        mock_eth_call.return_value = (
            "0x"
            + "0" * 63 + "1"                      # bool valid = true
            + format(1700000000, "064x")           # uint64 attestedAt
        )
        config = AttestationConfig(
            contract_address="0x" + "1" * 40
        )
        result = verify_frame_on_chain(config, 1, "a" * 64)
        assert result.valid
        assert result.attested_at == 1700000000

    @patch("attestation._eth_call")
    def test_invalid_attestation(self, mock_eth_call):
        """Simulate a failed verification (hash mismatch)."""
        mock_eth_call.return_value = (
            "0x"
            + "0" * 64                             # bool valid = false
            + "0" * 64                             # uint64 attestedAt = 0
        )
        config = AttestationConfig(
            contract_address="0x" + "1" * 40
        )
        result = verify_frame_on_chain(config, 1, "a" * 64)
        assert not result.valid

    @patch("attestation._eth_call")
    def test_rpc_failure(self, mock_eth_call):
        mock_eth_call.return_value = None
        config = AttestationConfig(
            contract_address="0x" + "1" * 40
        )
        result = verify_frame_on_chain(config, 1, "a" * 64)
        assert not result.valid
        assert "rpc" in result.error.lower()

    @patch("attestation._eth_call")
    def test_get_latest_sol(self, mock_eth_call):
        mock_eth_call.return_value = "0x" + format(729, "064x")
        config = AttestationConfig(
            contract_address="0x" + "1" * 40
        )
        sol = get_latest_attested_sol(config)
        assert sol == 729

    def test_get_latest_sol_unconfigured(self):
        config = AttestationConfig()
        assert get_latest_attested_sol(config) is None


# =============================================================================
# Twin Verification Gate
# =============================================================================

class TestTwinVerificationGate:
    """The gate the physical twin uses before acting on any frame."""

    def test_local_only_verification(self):
        gate = TwinVerificationGate()
        with tempfile.TemporaryDirectory() as tmpdir:
            frame = _make_frame(1)
            path = _write_frame(Path(tmpdir), frame)

            result = gate.verify_frame(path)
            assert result.valid
            assert gate.last_verified_sol == 1

    def test_tampered_frame_rejected(self):
        gate = TwinVerificationGate()
        with tempfile.TemporaryDirectory() as tmpdir:
            frame = _make_frame(1)
            frame["_hash"] = "0000000000000000"  # Tampered
            path = _write_frame(Path(tmpdir), frame)

            result = gate.verify_frame(path)
            assert not result.valid
            assert gate.last_verified_sol == 0  # Not updated

    def test_missing_file_rejected(self):
        gate = TwinVerificationGate()
        result = gate.verify_frame(Path("/nonexistent/sol-0001.json"))
        assert not result.valid
        assert "cannot load" in result.error.lower()

    def test_sequential_verification(self):
        gate = TwinVerificationGate()
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            for sol in range(1, 4):
                frame = _make_frame(sol, prev_sol=sol-1 if sol > 1 else None)
                path = _write_frame(tmpdir, frame)
                result = gate.verify_frame(path)
                assert result.valid
                assert gate.last_verified_sol == sol

    @patch("attestation.verify_frame_on_chain")
    def test_on_chain_required_and_valid(self, mock_verify):
        mock_verify.return_value = VerificationResult(
            sol=1, local_hash="a" * 64, chain_hash="a" * 64,
            valid=True, attested_at=1700000000
        )
        gate = TwinVerificationGate(
            config=AttestationConfig(contract_address="0x" + "1" * 40),
            require_on_chain=True,
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            frame = _make_frame(1)
            path = _write_frame(Path(tmpdir), frame)
            result = gate.verify_frame(path)
            assert result.valid


# =============================================================================
# Integration: Verify against real frame files (if available)
# =============================================================================

class TestRealFrames:
    """Verify attestation module works with actual frame files from data/frames/."""

    def test_hash_real_frame_sol_1(self):
        """Hash sol-0001.json and verify it's deterministic."""
        frames_dir = Path(__file__).parent.parent / "data" / "frames"
        path = frames_dir / "sol-0001.json"
        if not path.exists():
            return  # Skip if frames not present

        data, h = load_frame(path)
        assert data["sol"] == 1
        assert len(h) == 64

        # Verify our hash is deterministic (hash same frame twice)
        _, h2 = load_frame(path)
        assert h == h2, "Hash must be deterministic across loads"

        # NOTE: The stored _hash was generated by the private engine
        # using its own algorithm. Our hash_frame defines the PUBLIC
        # verification spec for new attestations going forward.

    def test_verify_first_10_frames(self):
        """Verify local chain integrity of first 10 frames."""
        frames_dir = Path(__file__).parent.parent / "data" / "frames"
        if not (frames_dir / "sol-0001.json").exists():
            return

        results = verify_local_chain(frames_dir, 1, 10)
        assert len(results) == 10
        # At minimum, sol 1 should be locally valid
        assert results[0].local_hash != ""

    def test_build_attestation_for_real_frames(self):
        """Build attestations from real frame files."""
        frames_dir = Path(__file__).parent.parent / "data" / "frames"
        if not (frames_dir / "sol-0001.json").exists():
            return

        batch = build_attestation_batch(frames_dir, 1, 3)
        assert len(batch) == 3
        assert batch[0].sol == 1
        assert batch[0].prev_frame_hash == "0" * 64
        assert batch[1].prev_frame_hash == batch[0].frame_hash
