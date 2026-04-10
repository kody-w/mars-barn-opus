#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# FLEET A — SNOWBALL COMPETITION
# Evolves .lispy governor strategies for maximum score.
# Rules: NEVER touch gauntlet.js (Amendment VII — SACRED)
# Stop: touch /tmp/marsbarn-stop
# ═══════════════════════════════════════════════════════════════

set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

STOP_FILE="/tmp/marsbarn-stop"
STREAM_ID="${STREAM_ID:-0}"
LOG="logs/fleet.log"
BEST_FILE="strategies/fleet/best-governor.lispy"
LOCK_FILE="/tmp/marsbarn-governor.lock"
BEST_SCORE_FILE="/tmp/marsbarn-best-score"
CYCLE=0

# Each stream gets its own isolated workspace for copilot
WORK_DIR="/tmp/marsbarn-stream-${STREAM_ID}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" logs strategies/fleet

# Remove old stop file if exists (only for stream 0 / standalone)
[ "$STREAM_ID" = "0" ] && rm -f "$STOP_FILE"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] FLEET-A[S${STREAM_ID}]: $*" | tee -a "$LOG"; }

# Get SCORE from gauntlet output (handles both "Score:" and "SCORE:")
parse_score() {
  grep -oi 'score: *[0-9]*' | grep -o '[0-9]*' | tail -1
}

# Get baseline score
log "Starting snowball competition"
log "Current governor: $(wc -l < governor.lispy) lines"

BASELINE=$(cd tools && node gauntlet.js 2>&1 | parse_score)
BASELINE=${BASELINE:-0}
log "Baseline score: $BASELINE"

# Initialize shared best score (only if not already set by another stream)
if [ ! -f "$BEST_SCORE_FILE" ] || [ "$BASELINE" -gt "$(cat "$BEST_SCORE_FILE" 2>/dev/null || echo 0)" ] 2>/dev/null; then
  echo "$BASELINE" > "$BEST_SCORE_FILE"
fi
BEST_SCORE=$BASELINE
cp governor.lispy "$BEST_FILE" 2>/dev/null || true

while [ ! -f "$STOP_FILE" ]; do
  CYCLE=$((CYCLE + 1))
  BEST_SCORE=$(cat "$BEST_SCORE_FILE" 2>/dev/null || echo 0)
  log "═══ Cycle $CYCLE (best: $BEST_SCORE) ═══"

  CANDIDATE="strategies/fleet/candidate-s${STREAM_ID}-c${CYCLE}.lispy"

  # Prepare isolated workspace — copilot will write governor.lispy here
  cp governor.lispy "$WORK_DIR/governor.lispy"
  cp LISPY.md "$WORK_DIR/LISPY.md" 2>/dev/null || true

  # Run copilot in isolated dir with --yolo so it can write the file
  cd "$WORK_DIR"
  gh copilot -- --yolo -p "You are an expert Mars colony AI governor writer. Read governor.lispy for context. Then OVERWRITE governor.lispy with a new, improved strategy that maximizes: median_sols*100 + min_crew*500 + min(median_modules,8)*150 + survival_rate*20000 - P75_CRI*10. Variables: sol, power_kwh, o2_days, h2o_days, food_days, crew_count, crew_min_hp, dust_tau, solar_eff, isru_eff, greenhouse_eff, cri, modules_built. Actions: (set! heating_alloc N) (set! isru_alloc N) (set! greenhouse_alloc N) (set! food_ration N) (set! repair_alloc N) (build-module TYPE). Types: solar_farm, repair_bay, isru_plant, greenhouse_dome, water_extractor, radiation_shelter. Current best: $BEST_SCORE. Build solar_farm first, then repair_bay, then isru_plant. Keep CRI under 15. Write the .lispy governor starting with (begin ...) to governor.lispy." > /dev/null 2>&1 || true
  cd "$PROJECT_DIR"

  # Check if copilot modified the governor in the workspace
  if [ -f "$WORK_DIR/governor.lispy" ] && ! diff -q governor.lispy "$WORK_DIR/governor.lispy" > /dev/null 2>&1; then
    # Copilot wrote something different — use it as candidate
    cp "$WORK_DIR/governor.lispy" "$CANDIDATE"
    log "Candidate S${STREAM_ID}C$CYCLE generated ($(wc -l < "$CANDIDATE") lines)"
  else
    log "Candidate empty/unchanged, skipping"
    sleep 5
    continue
  fi

  # Validate candidate has (begin
  if ! grep -q '(begin' "$CANDIDATE" 2>/dev/null; then
    log "Candidate invalid (no begin), skipping"
    sleep 2
    continue
  fi

  # Test the candidate (locked critical section)
  while ! mkdir "$LOCK_FILE" 2>/dev/null; do sleep 0.2; done
  trap 'rmdir "$LOCK_FILE" 2>/dev/null; exit' INT TERM

  BEST_SCORE=$(cat "$BEST_SCORE_FILE" 2>/dev/null || echo 0)

  cp governor.lispy /tmp/marsbarn-gov-backup-s${STREAM_ID}.lispy
  cp "$CANDIDATE" governor.lispy

  NEW_SCORE=$(cd tools && node gauntlet.js 2>&1 | parse_score)
  NEW_SCORE=${NEW_SCORE:-0}

  log "Candidate S${STREAM_ID}C$CYCLE score: $NEW_SCORE (best: $BEST_SCORE)"

  if [ "$NEW_SCORE" -gt "$BEST_SCORE" ] 2>/dev/null; then
    echo "$NEW_SCORE" > "$BEST_SCORE_FILE"
    cp governor.lispy "$BEST_FILE"
    log "🏆 NEW BEST: $NEW_SCORE (stream $STREAM_ID, cycle $CYCLE)"
    git add governor.lispy "$CANDIDATE" "$BEST_FILE"
    git commit -m "Fleet A S${STREAM_ID}C${CYCLE}: score $NEW_SCORE

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" || true
    git push kody main 2>/dev/null || true
  else
    cp "/tmp/marsbarn-gov-backup-s${STREAM_ID}.lispy" governor.lispy
    log "Reverted S${STREAM_ID}C${CYCLE} (${NEW_SCORE} ≤ ${BEST_SCORE})"
  fi

  rmdir "$LOCK_FILE" 2>/dev/null || true
  sleep 2

  if [ -f "$STOP_FILE" ]; then
    log "Stop file detected, shutting down"
    break
  fi
done

log "Fleet A snowball complete. Best score: $BEST_SCORE after $CYCLE cycles"
