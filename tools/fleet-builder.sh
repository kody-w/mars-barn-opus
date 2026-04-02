#!/bin/bash
# ═══════════════════════════════════════════════════════════
# FLEET B: AUTONOMOUS FIDELITY BUILDER
#
# Reads the fidelity queue, implements the next physics upgrade,
# generates frames, updates the gauntlet, verifies old strategies break.
#
# Usage:
#   bash tools/fleet-builder.sh          # run forever
#   touch /tmp/marsbarn-builder-stop     # stop gracefully
#
# This is the OTHER half of the snowball.
# Fleet A competes. Fleet B builds. Both run 24/7.
# ═══════════════════════════════════════════════════════════

COPILOT="${COPILOT:-/opt/homebrew/bin/copilot}"
BARN="${BARN:-$(cd "$(dirname "$0")/.." && pwd)}"
STOP="/tmp/marsbarn-builder-stop"
LOGDIR="$BARN/logs"

mkdir -p "$LOGDIR"
rm -f "$STOP"

echo "$(date) — Fleet B (Builder) starting" >> "$LOGDIR/fleet-builder.log"
echo "  Queue: $BARN/data/fidelity-queue.json"
echo "  Logs:  $LOGDIR/fleet-builder-*.log"
echo "  Stop:  touch $STOP"

while [ ! -f "$STOP" ]; do
    # Find next pending queue item
    ITEM=$(node -e "
      try {
        const q = require('$BARN/data/fidelity-queue.json');
        const next = q.queue.find(i => i.status === 'pending');
        if(next) console.log(next.id + '|' + next.title + '|' + next.version);
        else console.log('DONE');
      } catch(e) { console.log('ERROR|' + e.message); }
    ")

    ID=$(echo "$ITEM" | cut -d'|' -f1)
    TITLE=$(echo "$ITEM" | cut -d'|' -f2)
    VERSION=$(echo "$ITEM" | cut -d'|' -f3)

    if [ "$ID" = "DONE" ]; then
        echo "$(date) — All queue items complete. Sleeping 1 hour." >> "$LOGDIR/fleet-builder.log"
        sleep 3600
        continue
    fi

    if [ "$ID" = "ERROR" ]; then
        echo "$(date) — Queue read error: $TITLE. Retrying in 5 min." >> "$LOGDIR/fleet-builder.log"
        sleep 300
        continue
    fi

    echo "$(date) — Building: $ID ($TITLE)" >> "$LOGDIR/fleet-builder.log"

    cd "$BARN"
    "$COPILOT" -p "You are Fleet B: the AUTONOMOUS FIDELITY BUILDER.
Your singular purpose: implement the next physics upgrade to make the Mars colony sim more realistic.

READ THESE FILES FIRST:
1. docs/CONVERGENCE-ROADMAP.md — the vision
2. docs/AUTONOMOUS-FIDELITY-PIPELINE.md — your operating manual
3. data/fidelity-queue.json — your work queue
4. RULES.md — current game rules
5. tools/gauntlet.js — the sim engine you're upgrading

YOUR CURRENT TASK: $ID — $TITLE (version $VERSION)

STEPS (do ALL of them):
1. Read the queue item in data/fidelity-queue.json for physics details
2. Research the REAL equations — use actual NASA data, not approximations
3. Add new physics to tools/gauntlet.js (new hazard handlers or modified production formulas)
4. Generate new frames: write a Python script to create frames with the new physics
5. Add to data/frames/frames.json bundle
6. Create retroactive enrichment file if needed (echo-enrichments-$VERSION.json)
7. Update data/frame-versions/versions.json with the new version
8. Update RULES.md with the new mechanics (document the equations)
9. Run: node tools/gauntlet.js --monte-carlo 10
10. VERIFY: old strategies should score AT LEAST 10% lower. If they don't, the physics isn't biting hard enough.
11. Update fidelity-queue.json: set this item's status to 'complete'
12. Commit with detailed message explaining the physics added
13. Push to both remotes:
    git push kody main
    gh auth switch --user rappter2-ux && gh auth setup-git && git push origin main
    gh auth switch --user kody-w && gh auth setup-git

DO NOT skip steps. Every acceptance criterion must be met.
DO NOT use magic numbers — use real physical constants with citations.
DO NOT break existing tests — run: npx playwright test

Work in $BARN" \
    --yolo --autopilot --model claude-sonnet-4 \
    >> "$LOGDIR/fleet-builder-$ID.log" 2>&1 &

    CPID=$!
    # Watchdog: 20 min max per build (these are complex)
    ( sleep 1200; kill $CPID 2>/dev/null ) &
    WDOG=$!
    wait $CPID 2>/dev/null
    kill $WDOG 2>/dev/null 2>&1
    wait $WDOG 2>/dev/null 2>&1

    echo "$(date) — Completed: $ID" >> "$LOGDIR/fleet-builder.log"

    # VALIDATE — auto-rollback if gauntlet is broken
    bash "$BARN/tools/validate-gauntlet.sh" >> "$LOGDIR/fleet-builder.log" 2>&1
    if [ $? -ne 0 ]; then
        echo "$(date) — ⚠️ ROLLBACK triggered for $ID — gauntlet restored" >> "$LOGDIR/fleet-builder.log"
    fi

    sleep 300  # 5 min between builds
done

echo "$(date) — Fleet B stopped" >> "$LOGDIR/fleet-builder.log"
