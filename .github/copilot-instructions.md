# Copilot Instructions — First Principles to Mars

## Build & Test

```bash
# Run all tests (299 tests, no dependencies to install)
python3 -m pytest tests/ -v

# Run a single test file
python3 -m pytest tests/test_colony.py -v

# Run a single test class or method
python3 -m pytest tests/test_colony.py::TestResources::test_create_with_defaults -v

# Run simulation
python3 src/sim.py --mission-control
python3 src/sim.py --benchmark
python3 src/sim.py --autonomy --sols 500
```

No build step. No linter configured. Python 3.9+ stdlib only — **no pip dependencies, ever**. This is a constitutional constraint (CONSTITUTION.md Article IV §1).

## Architecture

Mars colony survival sim + Oregon Trail-style game with a unidirectional data flow that ticks once per sol:

```
mars.py (physics) → events.py (stochastic) → governor.py (AI decisions)
  → colony.py (apply allocation) → crew.py (individual health)
    → mission_control.py (render) → twin state JSON (physical sync)
```

**Core game loop** (CONSTITUTION Article V):
```
Choose mission → Real Mars weather seeds start → AI + LisPy runs colony
  → Papers Please tasks emerge from echo frames → Player decides
    → Consequences cascade → Colony lives or dies → Post-mortem → Repeat
```

**Echo frames**: Every sol produces a delta frame. Output of frame N drives frame N+1. Tasks, hazards, and visuals all react to echo data. This is the colony's nervous system.

**Colony Risk Index (CRI)**: LisPy-computed VIX for Mars. 10 variables, range 0-100. Higher CRI = higher probability of failures. `riskRoll(baseProb)` applies the CRI multiplier.

**Entry point**: `src/sim.py` — CLI. `docs/viewer.html` — browser game (the main experience).

**Web layer** (`docs/`): `viewer.html` IS the game. index.html redirects to it. Zero server dependencies.

## Key Conventions

**Constants**: Every numeric constant lives in `config.py` with a NASA-sourced comment. Zero magic numbers.

**Data modeling**: Dataclasses + free functions. `step()`, `produce()`, `consume()`.

**Imports**: `from __future__ import annotations` on every module. Explicit imports from config.

**Tests**: `sys.path.insert` pattern. Classes grouping assertions. Tests are the specification.

**No duplicates**: One implementation per concept. Git handles versioning.

**Two remotes**: `kody` → `kody-w/mars-barn-opus` (primary), `origin` → `rappter2-ux/mars-barn-opus`. Push to both.
