# Mars Barn Opus — Ideas & Notes

## The Vision
This isn't a game. It's a mission control interface that scales from simulation
to physical Earth rehearsal to actual Mars colony. Same software, same dashboard,
same twin state contract at every stage.

## What We Have (Cycle 5 complete)
- [x] Core simulation: terrain, atmosphere, solar, thermal, radiation, events
- [x] Colony lifecycle: resources, production, consumption, failure cascade
- [x] Governor AI: 10 archetypes, personality-driven, memory-augmented
- [x] Multi-colony: trade, sabotage, supply drops, game theory
- [x] Mission Control: autonomous colony observation from Earth
- [x] Digital twin state file: JSON sync contract per sol
- [x] HTML reports: inline SVG charts
- [x] Scoring: 5-dimension composite, letter grades, 95% CI
- [x] Interactive play mode
- [x] CLI: --benchmark, --leaderboard, --play, --mission-control, --html, --json
- [x] 186 tests, all passing
- [x] Crew simulation: named individuals, health, fatigue, roles, death
- [x] Communication delay: orbital mechanics, conjunction blackout
- [x] Colony expansion: 9 module types, AI auto-build
- [x] 3D viewer: Globe.gl planet + Three.js ground with modules and robots
- [x] Warmap: tactical 2D satellite view with POIs
- [x] Web playable: GitHub Pages, import/export saves
- [x] CONSTITUTION.md: 8 commandments, the law of the codebase

## What Would Make This Unbeatable

### High Priority (Cycle 3-5)
- [ ] **Crew simulation**: individual crew members with skills, health, morale
      Not just "crew_size=4" — actual people with names, specializations,
      fatigue, radiation sickness, psychology. This is what makes it feel REAL.
- [ ] **Communication delay**: Earth-Mars light delay (4-24 min one-way).
      Operator commands arrive delayed. Colony must survive autonomously
      during the gap. This is the CORE TENSION of the real mission.
- [ ] **Colony expansion**: build new modules over time. Start with landing
      habitat, expand to greenhouse dome, ISRU plant, repair bay, radiation
      shelter. Each module has build time, resource cost, and effect.
- [ ] **Mission log**: persistent narrative. What happened each sol in
      human-readable prose. "Sol 47: Dust storm hit. Governor shifted 70%
      to ISRU. O2 reserves dropped to 3-day supply. Crew morale: tense."

### Medium Priority (Cycle 5-8)
- [ ] **Terrain awareness**: colony placement matters. Crater = shelter from
      wind but less solar. Ridge = more solar but exposed. Ice deposits =
      water bonus. Location choice is the first strategic decision.
- [ ] **Research system**: crew can research improvements (better solar panels,
      more efficient ISRU, radiation shielding). Takes sols, costs resources,
      but permanently improves systems.
- [ ] **Emergency protocols**: predefined response plans the operator can
      activate. "Shelter in place" (reduce all activity, minimize consumption).
      "Emergency ISRU" (all power to O2/H2O). "Abandon module" (sacrifice
      a module to save the colony).
- [ ] **Multi-mission**: sequential missions. First mission establishes base.
      Second mission expands. Third mission is self-sustaining. Carryover
      between missions.

### Lower Priority (Nice to have)
- [ ] **Web dashboard**: serve the mission control UI as localhost HTML
      instead of terminal ASCII. Better charts, clickable controls.
- [ ] **Replay mode**: load a twin state file and replay the mission
      from any sol. See what decisions were made and why.
- [ ] **Difficulty modes**: Tourist (forgiving), Realistic (NASA parameters),
      Hardcore (real Mars weather data, permadeath, no supply drops)
- [ ] **Sound design spec**: what Mission Control SOUNDS like. Beeps for
      alerts, hum for nominal, alarm for cascade. (For physical twin.)

## Swarm Weaknesses to Exploit
- No crew simulation (just crew_size integer)
- No communication delay
- No colony expansion
- No mission log narrative
- No operator interface at all
- 5 duplicate decision engines, 5 duplicate multicolony modules
- Magic numbers everywhere
- 11 tests

## Notes
- Keep Python stdlib only. No pip. No npm.
- Twin state JSON is the sacred contract. Physical twin reads it.
- Every feature should work in both sim mode AND mission control mode.
- The operator should never NEED to intervene. But they CAN.
