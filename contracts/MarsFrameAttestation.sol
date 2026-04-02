// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MarsFrameAttestation
/// @notice On-chain attestation of Mars Barn Opus environmental frames.
///         Stores frame hashes — not full frames — creating a trustless
///         bridge between the virtual colony and any physical twin.
///         The contract only VERIFIES. It never generates. The goose stays home.
/// @dev Designed for Base L2 (or any EVM chain). ~200 bytes per attestation.
///      At 1 sol/day, costs < $0.01/year on L2.

contract MarsFrameAttestation {

    // ─── Types ───────────────────────────────────────────────────────────

    struct Attestation {
        uint64 sol;              // Sol number (1-indexed)
        bytes32 frameHash;       // SHA-256 hash of the frame JSON
        bytes32 prevFrameHash;   // Hash of the previous frame (chain link)
        bytes24 engineSignature; // Engine's signature over the frame
        bytes16 engineId;        // Engine identifier (e.g., "rappter-genesis")
        uint64 timestamp;        // Block timestamp when attested
    }

    // ─── State ───────────────────────────────────────────────────────────

    /// @notice Owner who can authorize engines.
    address public owner;

    /// @notice Mapping of sol number → attestation.
    mapping(uint64 => Attestation) public attestations;

    /// @notice The latest attested sol number.
    uint64 public latestSol;

    /// @notice Authorized engine addresses that can post attestations.
    mapping(address => bool) public authorizedEngines;

    /// @notice Total number of attestations posted.
    uint64 public totalAttestations;

    // ─── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when a new frame is attested on-chain.
    event FrameAttested(
        uint64 indexed sol,
        bytes32 frameHash,
        bytes16 engineId,
        uint64 timestamp
    );

    /// @notice Emitted when an engine is authorized or revoked.
    event EngineAuthorizationChanged(address indexed engine, bool authorized);

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorizedEngine() {
        require(authorizedEngines[msg.sender], "Not authorized engine");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        authorizedEngines[msg.sender] = true;
    }

    // ─── Engine Management ───────────────────────────────────────────────

    /// @notice Authorize an address to post attestations.
    function authorizeEngine(address engine) external onlyOwner {
        authorizedEngines[engine] = true;
        emit EngineAuthorizationChanged(engine, true);
    }

    /// @notice Revoke an engine's authorization.
    function revokeEngine(address engine) external onlyOwner {
        authorizedEngines[engine] = false;
        emit EngineAuthorizationChanged(engine, false);
    }

    // ─── Attestation ─────────────────────────────────────────────────────

    /// @notice Post a frame attestation. Must be sequential (sol == latestSol + 1)
    ///         or the genesis frame (sol == 1 when no attestations exist).
    /// @param sol The sol number of the frame.
    /// @param frameHash SHA-256 hash of the frame JSON content.
    /// @param prevFrameHash Hash of the previous frame (zero for genesis).
    /// @param engineSignature The engine's cryptographic signature.
    /// @param engineId Identifier of the engine that generated the frame.
    function attest(
        uint64 sol,
        bytes32 frameHash,
        bytes32 prevFrameHash,
        bytes24 engineSignature,
        bytes16 engineId
    ) external onlyAuthorizedEngine {
        // Chain continuity: must be sequential or genesis
        if (totalAttestations == 0) {
            require(sol == 1, "First attestation must be sol 1");
        } else {
            require(sol == latestSol + 1, "Must attest sequentially");
            // Verify chain link: prevFrameHash must match the stored hash
            require(
                prevFrameHash == attestations[latestSol].frameHash,
                "Chain link broken: prevFrameHash mismatch"
            );
        }

        // No duplicate attestations
        require(attestations[sol].timestamp == 0, "Sol already attested");

        // Store the attestation
        attestations[sol] = Attestation({
            sol: sol,
            frameHash: frameHash,
            prevFrameHash: prevFrameHash,
            engineSignature: engineSignature,
            engineId: engineId,
            timestamp: uint64(block.timestamp)
        });

        latestSol = sol;
        totalAttestations++;

        emit FrameAttested(sol, frameHash, engineId, uint64(block.timestamp));
    }

    // ─── Verification (free — view functions) ────────────────────────────

    /// @notice Verify that a frame hash matches the on-chain attestation.
    /// @param sol The sol number to verify.
    /// @param frameHash The hash to check against.
    /// @return valid True if the hash matches.
    /// @return attestedAt Timestamp when the attestation was posted (0 if not found).
    function verify(uint64 sol, bytes32 frameHash)
        external
        view
        returns (bool valid, uint64 attestedAt)
    {
        Attestation memory a = attestations[sol];
        if (a.timestamp == 0) {
            return (false, 0);
        }
        return (a.frameHash == frameHash, a.timestamp);
    }

    /// @notice Get the full attestation for a sol.
    function getAttestation(uint64 sol)
        external
        view
        returns (Attestation memory)
    {
        return attestations[sol];
    }

    /// @notice Verify chain integrity between two sols (inclusive).
    /// @dev Checks that each frame's prevFrameHash matches the prior attestation.
    function verifyChainSegment(uint64 fromSol, uint64 toSol)
        external
        view
        returns (bool intact)
    {
        require(fromSol >= 1 && toSol >= fromSol, "Invalid range");
        require(toSol <= latestSol, "Range exceeds latest");

        for (uint64 s = fromSol + 1; s <= toSol; s++) {
            if (attestations[s].prevFrameHash != attestations[s - 1].frameHash) {
                return false;
            }
        }
        return true;
    }

    // ─── Ownership ───────────────────────────────────────────────────────

    /// @notice Transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
