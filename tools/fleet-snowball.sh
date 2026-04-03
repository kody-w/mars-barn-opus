#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# FLEET A — SNOWBALL COMPETITION
# Evolves .lispy governor strategies for maximum score.
# Rules: NEVER touch gauntlet.js (Amendment VII — SACRED)
# Stop: touch /tmp/marsbarn-stop
# ═══════════════════════════════════════════════════════════════

set -euo pipefail
cd "$(dirname "$0")/.."

COPILOT="${COPILOT:-gh copilot}"
STOP_FILE="/tmp/marsbarn-stop"
LOG="logs/fleet.log"
BEST_FILE="strategies/fleet/best-governor.lispy"
CYCLE=0

mkdir -p logs strategies/fleet

# Remove old stop file if exists
rm -f "$STOP_FILE"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] FLEET-A: $*" | tee -a "$LOG"; }

# Get score from a .lispy file
score() {
  local gov="$1"
  local output
  output=$(cd tools && node gauntlet.js < /dev/null 2>&1 <<< "" | cat) 2>/dev/null || true
  # Actually run it properly
  cp "$gov" /tmp/marsbarn-test-gov.lispy
  output=$(cd tools && node -e "
    const fs = require('fs');
    const gov = fs.readFileSync('/tmp/marsbarn-test-gov.lispy', 'utf8');
    // Run gauntlet with this governor
    const origArgv = process.argv;
    process.argv = ['node', 'gauntlet.js', '--governor', '/tmp/marsbarn-test-gov.lispy'];
    " 2>&1 | grep -oP 'Score:\s*\K[0-9]+' || echo "0")
  echo "$output"
}

# Get score by running gauntlet directly
run_score() {
  local gov_file="$1"
  local result
  result=$(cd tools && node gauntlet.js 2>&1 < /dev/null) || true
  local score_val
  score_val=$(echo "$result" | grep -o 'Score: *[0-9]*' | grep -o '[0-9]*' | tail -1)
  echo "${score_val:-0}"
}

# Get baseline score
log "Starting snowball competition"
log "Current governor: $(wc -l < governor.lispy) lines"

# Run initial score
BASELINE=$(cd tools && node gauntlet.js 2>&1 | grep -o 'SCORE: *[0-9]*' | grep -o '[0-9]*' | tail -1)
BASELINE=${BASELINE:-0}
log "Baseline score: $BASELINE"

BEST_SCORE=$BASELINE
cp governor.lispy "$BEST_FILE" 2>/dev/null || true

while [ ! -f "$STOP_FILE" ]; do
  CYCLE=$((CYCLE + 1))
  log "═══ Cycle $CYCLE (best: $BEST_SCORE) ═══"

  # Generate candidate strategy
  CANDIDATE="strategies/fleet/candidate-c${CYCLE}.lispy"

  # Use copilot to evolve the governor
  $COPILOT -q "You are an expert Mars colony AI governor writer for the Mars Barn Opus simulation.

RULES (MUST FOLLOW):
- Write a .lispy governor strategy that maximizes the official score
- Score formula: median_sols × 100 + min_crew × 500 + min(median_modules, 8) × 150 + survival_rate × 20000 - P75_CRI × 10
- You MUST output ONLY valid LisPy code, nothing else
- DO NOT modify gauntlet.js — it is SACRED (Amendment VII)
- The governor runs each sol. Available variables: sol, power_kwh, o2_days, h2o_days, food_days,
  crew_count, crew_min_hp, dust_tau, solar_eff, isru_eff, greenhouse_eff, cri, modules_built
- Available actions: (alloc-habitat pct) (alloc-isru pct) (alloc-greenhouse pct) (set-repair-priority val)
  (build-module type) where type is one of: solar_farm, repair_bay, isru_plant, greenhouse_dome,
  water_extractor, radiation_shelter
- Current best score: $BEST_SCORE
- Key insights: robots survive better than humans, build solar_farm first for power,
  then repair_bay for efficiency recovery, then isru_plant for resources
- Keep CRI low (under 15), maintain power above 100 kWh, build all 6 modules by sol 300

Write an improved governor. Be creative with allocation strategies and build ordering.
Output ONLY the .lispy code." > "$CANDIDATE" 2>/dev/null || true

  # Check if file was created and has content
  if [ ! -s "$CANDIDATE" ]; then
    log "Candidate empty, skipping"
    sleep 10
    continue
  fi

  # Test the candidate
  cp governor.lispy /tmp/marsbarn-gov-backup.lispy
  cp "$CANDIDATE" governor.lispy

  NEW_SCORE=$(cd tools && timeout 120 node gauntlet.js 2>&1 | grep -o 'SCORE: *[0-9]*' | grep -o '[0-9]*' | tail -1)
  NEW_SCORE=${NEW_SCORE:-0}

  log "Candidate C$CYCLE score: $NEW_SCORE (best: $BEST_SCORE)"

  if [ "$NEW_SCORE" -gt "$BEST_SCORE" ] 2>/dev/null; then
    BEST_SCORE=$NEW_SCORE
    cp governor.lispy "$BEST_FILE"
    log "🏆 NEW BEST: $NEW_SCORE (cycle $CYCLE)"
    git add governor.lispy "$CANDIDATE" "$BEST_FILE"
    git commit -m "Fleet A cycle $CYCLE: score $NEW_SCORE (improved from $BASELINE)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" || true
    git push kody main 2>/dev/null || true
  else
    # Revert
    cp /tmp/marsbarn-gov-backup.lispy governor.lispy
    log "Reverted (${NEW_SCORE} < ${BEST_SCORE})"
  fi

  # Watchdog: kill if stuck
  sleep 5

  # Check stop file
  if [ -f "$STOP_FILE" ]; then
    log "Stop file detected, shutting down"
    break
  fi
done

log "Fleet A snowball complete. Best score: $BEST_SCORE after $CYCLE cycles"
