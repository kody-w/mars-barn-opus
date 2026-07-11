# Copilot Instructions — First Principles to Mars

## Build & Test

```bash
# Run the complete release gate
npm test

# Run only Python tests
python3 tools/run_tests.py

# Run a single test file
python3 tools/run_tests.py tests/test_colony.py

# Run a single test class or method
python3 tools/run_tests.py tests/test_colony.py::TestResources::test_create_with_defaults

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

## IP Separation — ENGINE vs OUTPUT

**CRITICAL: This is how Wildhaven Homes LLC IP is protected.**

```
PRIVATE (engine — never public):
  rappter2-ux/rappter (private repo)
  ├── The Rappter engine core
  ├── LisPy VM source of truth (src/lispy.py is the reference)
  ├── Frame generation algorithms (the HOW)
  ├── Governor evolution strategies
  ├── Treasury governor internals
  ├── Proprietary nervous system implementation details
  └── Any future ML models, training data, or weights

PUBLIC (output — static data + consumer code):
  kody-w/mars-barn-opus (public repo)
  ├── data/frames/*.json    ← OUTPUT of the engine (static, safe to share)
  ├── data/chain/            ← chain state (public by design)
  ├── docs/*.html            ← consumer applications (viewer, control, simhub)
  ├── docs/blog/             ← thought leadership (patterns, not implementation)
  ├── src/                   ← simplified sim (not the full engine)
  └── tests/                 ← test the simplified sim only
```

**Rules:**
1. The private engine generates frames → pushes STATIC OUTPUT to the public repo
2. The public repo CONSUMES frames but NEVER contains the generation logic
3. `tools/generate_frames.py` in the public repo is a SIMPLIFIED seed generator, NOT the real engine
4. The real engine (private) can be cloned locally and pointed at any public repo via a manifest
5. Blog posts document PATTERNS (the shape), not IMPLEMENTATION (the code)
6. The JS LisPy VM in viewer.html is a PORT — the canonical implementation stays private
7. Governor programs (the LisPy text) are shareable — the VM that runs them is the IP

**Manifest Protocol** (how the private engine finds a public repo):
The engine reads `manifest.json` from a public repo to know:
- Where to push frames (`data/frames/`)
- What chain nodes exist (`data/chain/nodes.json`)
- What the latest frame is (`data/frames/latest.json`)
- The repo URL and Pages URL

Any public repo with the right manifest can receive frames from the private engine.
The engine is the golden goose. The frames are the eggs. The eggs are public. The goose stays home.
