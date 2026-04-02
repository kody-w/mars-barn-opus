#!/bin/bash
# ═══════════════════════════════════════════════════════════
# GAUNTLET VALIDATOR — Verify gauntlet.js works, auto-rollback if broken
#
# Run after ANY change to gauntlet.js. If the gauntlet produces NaN,
# crashes, or fails syntax check, it auto-restores from known-good.
#
# Usage:
#   bash tools/validate-gauntlet.sh           # validate + rollback if broken
#   bash tools/validate-gauntlet.sh --snap    # snapshot current as known-good
#
# Called automatically by fleet-builder.sh after each fidelity upgrade.
# ═══════════════════════════════════════════════════════════

BARN="$(cd "$(dirname "$0")/.." && pwd)"
GAUNTLET="$BARN/tools/gauntlet.js"
KNOWN_GOOD="$BARN/tools/gauntlet.known-good.js"

# Snapshot mode
if [ "$1" = "--snap" ]; then
    cp "$GAUNTLET" "$KNOWN_GOOD"
    echo "✅ Snapshotted gauntlet.js as known-good"
    exit 0
fi

echo "🔍 Validating gauntlet.js..."

# 1. Syntax check
if ! node --check "$GAUNTLET" 2>/dev/null; then
    echo "❌ SYNTAX ERROR — rolling back"
    cp "$KNOWN_GOOD" "$GAUNTLET"
    echo "✅ Restored from known-good"
    exit 1
fi

# 2. Run 1 Monte Carlo — must produce a number
OUTPUT=$(node "$GAUNTLET" --monte-carlo 1 2>&1)
SCORE=$(echo "$OUTPUT" | grep -i "score" | grep -o '[0-9][0-9]*' | head -1)

if [ -z "$SCORE" ]; then
    echo "❌ NO SCORE FOUND — rolling back"
    cp "$KNOWN_GOOD" "$GAUNTLET"
    echo "✅ Restored from known-good"
    exit 1
fi

# 3. Score must be positive and reasonable (> 50000 for a real run)
if [ "$SCORE" -lt 50000 ] 2>/dev/null; then
    echo "⚠️  SCORE SUSPICIOUSLY LOW ($SCORE) — rolling back"
    cp "$KNOWN_GOOD" "$GAUNTLET"
    echo "✅ Restored from known-good"
    exit 1
fi

# 4. Must not contain NaN
if echo "$OUTPUT" | grep -q "NaN"; then
    echo "❌ NaN IN OUTPUT — rolling back"
    cp "$KNOWN_GOOD" "$GAUNTLET"
    echo "✅ Restored from known-good"
    exit 1
fi

echo "✅ Gauntlet valid — Score: $SCORE"

# If valid, update known-good snapshot
cp "$GAUNTLET" "$KNOWN_GOOD"
echo "📸 Updated known-good snapshot"
exit 0
