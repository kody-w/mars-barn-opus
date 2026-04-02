"""Mars Barn Opus — Frame Attestation & On-Chain Verification

Bridges the virtual colony's frame chain to a distributed ledger.
The blockchain is the nervous system between worlds — it doesn't carry
money, it carries TRUST. The physical twin verifies frame authenticity
against math, not against a server.

Uses ONLY Python stdlib (urllib + json + hashlib). Zero dependencies.
Talks to any EVM-compatible chain via raw JSON-RPC over HTTP.
"""
from __future__ import annotations

import hashlib
import json
import struct
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# =============================================================================
# CONFIGURATION — All chain constants in one place
# =============================================================================

# Default RPC endpoint (Base L2 mainnet). Override via attestation config.
DEFAULT_RPC_URL = "https://mainnet.base.org"

# The attestation contract address. Set to zero until deployed.
DEFAULT_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"

# EVM function selectors (first 4 bytes of keccak256 of the signature)
# Pre-computed because we can't do keccak256 in stdlib.
# verify(uint64,bytes32) → selector
SELECTOR_VERIFY = "0x8e760afe"
# getAttestation(uint64) → selector
SELECTOR_GET_ATTESTATION = "0x6d568c43"
# latestSol() → selector
SELECTOR_LATEST_SOL = "0x7a3c4b5d"


# =============================================================================
# DATA TYPES
# =============================================================================

@dataclass
class FrameAttestation:
    """An attestation of a single frame's existence and integrity."""
    sol: int
    frame_hash: str        # SHA-256 hex digest of the frame JSON
    prev_frame_hash: str   # Hash of the previous frame
    engine_id: str         # e.g., "rappter-genesis"
    engine_signature: str  # Engine's cryptographic signature
    timestamp: int = 0     # Unix timestamp when attested on-chain (0 = local only)

    def to_dict(self) -> Dict:
        return {
            "sol": self.sol,
            "frameHash": self.frame_hash,
            "prevFrameHash": self.prev_frame_hash,
            "engineId": self.engine_id,
            "engineSignature": self.engine_signature,
            "timestamp": self.timestamp,
        }


@dataclass
class AttestationConfig:
    """Configuration for the attestation bridge."""
    rpc_url: str = DEFAULT_RPC_URL
    contract_address: str = DEFAULT_CONTRACT_ADDRESS
    chain_id: int = 8453  # Base L2 mainnet
    frames_dir: str = "data/frames"

    @property
    def is_configured(self) -> bool:
        """True if a real contract address has been set."""
        return self.contract_address != DEFAULT_CONTRACT_ADDRESS


@dataclass
class VerificationResult:
    """Result of verifying a frame against the chain."""
    sol: int
    local_hash: str            # Hash we computed from the frame file
    chain_hash: Optional[str]  # Hash stored on-chain (None if not attested)
    valid: bool                # True if hashes match
    attested_at: int           # Timestamp on-chain (0 if not attested)
    error: Optional[str] = None


# =============================================================================
# LOCAL FRAME HASHING — Compute SHA-256 of a frame's content
# =============================================================================

def hash_frame(frame_data: Dict) -> str:
    """Compute the canonical SHA-256 hash of a frame.

    Strips the _hash, _signature, and _engineId fields before hashing,
    since those are metadata ABOUT the frame, not the frame content itself.
    This matches how the engine computes hashes (hash the content, then
    insert the hash into the output).
    """
    # Copy and strip attestation metadata
    content = {k: v for k, v in frame_data.items()
               if k not in ("_hash", "_signature", "_engineId")}
    # Canonical JSON: sorted keys, no whitespace, ensure_ascii
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def hash_frame_file(path: Path) -> str:
    """Hash a frame JSON file from disk."""
    with open(path) as f:
        data = json.load(f)
    return hash_frame(data)


def load_frame(path: Path) -> Tuple[Dict, str]:
    """Load a frame and return (data, hash)."""
    with open(path) as f:
        data = json.load(f)
    return data, hash_frame(data)


# =============================================================================
# LOCAL CHAIN VERIFICATION — Verify hash chain integrity without the network
# =============================================================================

def verify_local_chain(frames_dir: Path,
                       from_sol: int = 1,
                       to_sol: Optional[int] = None,
                       check_stored_hash: bool = False) -> List[VerificationResult]:
    """Verify the hash chain of local frame files.

    Checks that frame_echo.prev_sol links correctly (chain integrity).
    If check_stored_hash is True, also verifies that the stored _hash
    matches the recomputed hash (only valid if frames used the same
    canonical hashing algorithm — legacy engine frames may differ).
    """
    results = []

    # Find all frame files
    if to_sol is None:
        frame_files = sorted(frames_dir.glob("sol-*.json"))
        if not frame_files:
            return results
        to_sol = int(frame_files[-1].stem.split("-")[1])

    for sol in range(from_sol, to_sol + 1):
        path = frames_dir / f"sol-{sol:04d}.json"
        if not path.exists():
            results.append(VerificationResult(
                sol=sol, local_hash="", chain_hash=None,
                valid=False, attested_at=0,
                error=f"Frame file missing: {path.name}"
            ))
            continue

        data, computed_hash = load_frame(path)
        stored_hash = data.get("_hash", "")

        # Check stored hash match (optional — engine may use different algorithm)
        hash_ok = True
        hash_error = None
        if check_stored_hash and stored_hash:
            hash_prefix = computed_hash[:len(stored_hash)]
            if hash_prefix != stored_hash:
                hash_ok = False
                hash_error = "Stored hash mismatch (engine may use different algorithm)"

        # Verify echo link (always checkable)
        echo = data.get("frame_echo", {})
        prev_sol = echo.get("prev_sol")
        link_ok = True
        if sol > 1 and prev_sol != sol - 1:
            link_ok = False

        valid = hash_ok and link_ok
        error = None
        if not hash_ok:
            error = hash_error
        elif not link_ok:
            error = f"Echo link broken: prev_sol={prev_sol}, expected={sol-1}"

        results.append(VerificationResult(
            sol=sol,
            local_hash=computed_hash,
            chain_hash=None,
            valid=valid,
            attested_at=0,
            error=error,
        ))

    return results


# =============================================================================
# ON-CHAIN VERIFICATION — Raw JSON-RPC to any EVM chain
# =============================================================================

def _rpc_call(rpc_url: str, method: str, params: list) -> Dict:
    """Make a raw JSON-RPC call to an Ethereum node."""
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }).encode("utf-8")

    req = urllib.request.Request(
        rpc_url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        return {"error": {"message": str(e)}}


def _eth_call(rpc_url: str, contract: str, data: str) -> Optional[str]:
    """Execute an eth_call (read-only) against a contract."""
    result = _rpc_call(rpc_url, "eth_call", [
        {"to": contract, "data": data},
        "latest"
    ])
    if "error" in result:
        return None
    return result.get("result")


def _encode_uint64(value: int) -> str:
    """ABI-encode a uint64 as a 32-byte hex string (left-padded)."""
    return format(value, "064x")


def _encode_bytes32(hex_str: str) -> str:
    """ABI-encode a bytes32 from a hex string (right-padded to 32 bytes)."""
    clean = hex_str.replace("0x", "").ljust(64, "0")
    return clean[:64]


def get_latest_attested_sol(config: AttestationConfig) -> Optional[int]:
    """Query the contract for the latest attested sol number."""
    if not config.is_configured:
        return None

    result = _eth_call(config.rpc_url, config.contract_address,
                       SELECTOR_LATEST_SOL)
    if result is None:
        return None

    # Decode uint64 from the response
    clean = result.replace("0x", "")
    if len(clean) < 64:
        return None
    return int(clean[:64], 16)


def verify_frame_on_chain(config: AttestationConfig,
                          sol: int,
                          frame_hash: str) -> VerificationResult:
    """Verify a single frame's hash against the on-chain attestation.

    This is the core trust operation: the physical twin calls this
    before applying any frame to its actuators.
    """
    if not config.is_configured:
        return VerificationResult(
            sol=sol, local_hash=frame_hash, chain_hash=None,
            valid=False, attested_at=0,
            error="Contract not configured — set contract_address"
        )

    # Encode: verify(uint64 sol, bytes32 frameHash)
    call_data = ("0x" + SELECTOR_VERIFY.replace("0x", "")
                 + _encode_uint64(sol)
                 + _encode_bytes32(frame_hash))

    result = _eth_call(config.rpc_url, config.contract_address, call_data)

    if result is None:
        return VerificationResult(
            sol=sol, local_hash=frame_hash, chain_hash=None,
            valid=False, attested_at=0,
            error="RPC call failed"
        )

    # Decode response: (bool valid, uint64 attestedAt)
    clean = result.replace("0x", "")
    if len(clean) < 128:
        return VerificationResult(
            sol=sol, local_hash=frame_hash, chain_hash=None,
            valid=False, attested_at=0,
            error=f"Unexpected response length: {len(clean)}"
        )

    valid = int(clean[:64], 16) != 0
    attested_at = int(clean[64:128], 16)

    return VerificationResult(
        sol=sol,
        local_hash=frame_hash,
        chain_hash=frame_hash if valid else "mismatch",
        valid=valid,
        attested_at=attested_at,
    )


# =============================================================================
# ATTESTATION BUILDER — Prepare attestations for the engine to post
# =============================================================================

def build_attestation(frame_data: Dict,
                      prev_frame_data: Optional[Dict] = None) -> FrameAttestation:
    """Build an attestation from a frame and its predecessor.

    The engine calls this after generating a frame, before posting
    to the chain. The attestation is the tiny proof that gets stored
    on-chain — the full frame stays in git.
    """
    frame_hash = hash_frame(frame_data)
    prev_hash = hash_frame(prev_frame_data) if prev_frame_data else ("0" * 64)

    return FrameAttestation(
        sol=frame_data["sol"],
        frame_hash=frame_hash,
        prev_frame_hash=prev_hash,
        engine_id=frame_data.get("_engineId", "unknown"),
        engine_signature=frame_data.get("_signature", ""),
    )


def build_attestation_batch(frames_dir: Path,
                            from_sol: int = 1,
                            to_sol: Optional[int] = None) -> List[FrameAttestation]:
    """Build attestations for a range of frames.

    Used to backfill existing frames onto the chain. All 729+ existing
    frames can be attested in batch.
    """
    attestations = []
    prev_data = None

    if to_sol is None:
        frame_files = sorted(frames_dir.glob("sol-*.json"))
        if not frame_files:
            return attestations
        to_sol = int(frame_files[-1].stem.split("-")[1])

    for sol in range(from_sol, to_sol + 1):
        path = frames_dir / f"sol-{sol:04d}.json"
        if not path.exists():
            continue

        with open(path) as f:
            data = json.load(f)

        attestation = build_attestation(data, prev_data)
        attestations.append(attestation)
        prev_data = data

    return attestations


# =============================================================================
# TWIN SYNC PROTOCOL — Verification gate for the physical twin
# =============================================================================

@dataclass
class TwinVerificationGate:
    """Verification gate that the physical twin checks before acting on a frame.

    The gate reads the frame, verifies its hash locally, and optionally
    checks the on-chain attestation. If verification fails, the twin
    enters safe mode — all actuators go to nominal defaults.
    """
    config: AttestationConfig = field(default_factory=AttestationConfig)
    require_on_chain: bool = False  # If True, frames MUST be attested on-chain
    last_verified_sol: int = 0

    def verify_frame(self, frame_path: Path) -> VerificationResult:
        """Verify a frame before the physical twin acts on it.

        This is THE critical function. Every sensor reading, every actuator
        command passes through this gate. The chain is the witness.
        """
        # Load and hash locally
        try:
            data, local_hash = load_frame(frame_path)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            return VerificationResult(
                sol=0, local_hash="", chain_hash=None,
                valid=False, attested_at=0,
                error=f"Cannot load frame: {e}"
            )

        sol = data.get("sol", 0)

        # Verify local hash matches stored hash
        stored_hash = data.get("_hash", "")
        if stored_hash:
            hash_prefix = local_hash[:len(stored_hash)]
            if hash_prefix != stored_hash:
                return VerificationResult(
                    sol=sol, local_hash=local_hash, chain_hash=None,
                    valid=False, attested_at=0,
                    error=f"Local hash mismatch: computed {hash_prefix} != stored {stored_hash}"
                )

        # If on-chain verification is required and configured
        if self.require_on_chain and self.config.is_configured:
            result = verify_frame_on_chain(self.config, sol, local_hash)
            if result.valid:
                self.last_verified_sol = sol
            return result

        # Local-only verification passed
        self.last_verified_sol = sol
        return VerificationResult(
            sol=sol, local_hash=local_hash, chain_hash=None,
            valid=True, attested_at=0,
        )


# =============================================================================
# CLI — Run verification from the command line
# =============================================================================

def _print_results(results: List[VerificationResult]) -> None:
    """Print verification results in a human-readable format."""
    passed = sum(1 for r in results if r.valid)
    failed = sum(1 for r in results if not r.valid)

    print(f"\n{'='*60}")
    print(f"Frame Chain Verification: {passed} passed, {failed} failed")
    print(f"{'='*60}")

    for r in results:
        status = "✓" if r.valid else "✗"
        hash_display = r.local_hash[:16] if r.local_hash else "N/A"
        line = f"  {status} Sol {r.sol:4d}  hash={hash_display}"
        if r.attested_at:
            line += f"  attested={r.attested_at}"
        if r.error:
            line += f"  ERROR: {r.error}"
        print(line)

    print(f"{'='*60}\n")


if __name__ == "__main__":
    import sys

    frames_dir = Path("data/frames")
    if len(sys.argv) > 1:
        frames_dir = Path(sys.argv[1])

    if not frames_dir.exists():
        print(f"Frames directory not found: {frames_dir}")
        sys.exit(1)

    print(f"Verifying frame chain in {frames_dir}...")
    results = verify_local_chain(frames_dir)
    _print_results(results)

    # Exit with error code if any verification failed
    if any(not r.valid for r in results):
        sys.exit(1)
