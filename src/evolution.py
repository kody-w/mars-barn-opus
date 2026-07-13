"""Mars Barn Opus — Genetic Algorithm Governor Evolution

Run N colonies with random governor trait vectors. The top survivors
breed (crossover + mutation). After G generations, the evolved governor
is objectively the best Mars survival strategy ever discovered.

The genome is a vector of 7 trait values (0-1):
  risk_tolerance, efficiency_focus, social_trust,
  innovation_drive, crisis_aggression, trade_willingness, sabotage_threshold

Fitness = composite score from scoring.py (survival + efficiency + morale).
"""
from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from config import GOVERNOR_ARCHETYPES, DEFAULT_SOLS, BENCHMARK_SEEDS


TRAIT_NAMES = [
    "risk_tolerance", "efficiency_focus", "social_trust",
    "innovation_drive", "crisis_aggression", "trade_willingness",
    "sabotage_threshold",
]


@dataclass
class Genome:
    """A governor's genetic code — 7 trait values."""
    traits: Dict[str, float] = field(default_factory=dict)
    fitness: float = 0.0
    survived_sols: int = 0
    generation: int = 0
    genome_id: str = ""

    def __post_init__(self):
        if not self.traits:
            self.traits = {t: 0.5 for t in TRAIT_NAMES}
        if not self.genome_id:
            self.genome_id = f"G{self.generation}-{id(self) % 10000:04d}"

    def serialize(self) -> Dict:
        """Serialize for export."""
        return {
            "id": self.genome_id,
            "generation": self.generation,
            "traits": {k: round(v, 3) for k, v in self.traits.items()},
            "fitness": round(self.fitness, 2),
            "survived_sols": self.survived_sols,
        }


def random_genome(generation: int = 0, rng: random.Random = None) -> Genome:
    """Create a random genome."""
    if rng is None:
        rng = random.Random()
    traits = {t: rng.random() for t in TRAIT_NAMES}
    return Genome(traits=traits, generation=generation)


def crossover(parent1: Genome, parent2: Genome, generation: int,
              rng: random.Random) -> Genome:
    """Breed two parents via single-point crossover."""
    child_traits = {}
    crossover_point = rng.randint(1, len(TRAIT_NAMES) - 1)
    for i, trait in enumerate(TRAIT_NAMES):
        if i < crossover_point:
            child_traits[trait] = parent1.traits[trait]
        else:
            child_traits[trait] = parent2.traits[trait]
    return Genome(traits=child_traits, generation=generation)


def mutate(genome: Genome, mutation_rate: float = 0.1,
           mutation_strength: float = 0.15,
           rng: random.Random = None) -> None:
    """Mutate genome traits in-place."""
    if rng is None:
        rng = random.Random()
    for trait in TRAIT_NAMES:
        if rng.random() < mutation_rate:
            delta = rng.gauss(0, mutation_strength)
            genome.traits[trait] = max(0.0, min(1.0,
                genome.traits[trait] + delta))


def evaluate_genome(genome: Genome, seeds: List[int] = None,
                    max_sols: int = 300) -> float:
    """Run a colony with this genome's traits and return fitness score.

    Runs across multiple seeds for robustness.
    """
    from colony import create_colony, Allocation, step
    from governor import Governor, GovernorMemory
    from events import EventEngine
    from mars import daily_mean_irradiance, atmosphere_at, radiation_dose
    from scoring import score_run
    from colony import Resources

    if seeds is None:
        seeds = [42, 137, 256]

    total_score = 0.0
    total_survived = 0

    for seed in seeds:
        colony = create_colony("Evo", location_x=16, location_y=16)
        gov = Governor(
            name="EvoGov",
            archetype="evolved",
            traits=dict(genome.traits),
            memory=GovernorMemory(),
        )
        events = EventEngine()
        events.set_seed(seed)

        prev = Resources(
            o2_kg=colony.resources.o2_kg,
            h2o_liters=colony.resources.h2o_liters,
            food_kcal=colony.resources.food_kcal,
            power_kwh=colony.resources.power_kwh,
            crew_size=colony.resources.crew_size,
            power_capacity_kwh=colony.resources.power_capacity_kwh,
        )

        for sol in range(max_sols):
            if not colony.alive:
                break
            new_events = events.tick(sol + 1)
            agg = events.aggregate_effects()
            sol_of_year = (sol + 1) % 669
            dust_factor = agg.get("dust_factor", 1.0)
            solar_mult = agg.get("solar_multiplier", 1.0)

            irradiance = daily_mean_irradiance(0.0, sol_of_year, dust_factor) * solar_mult
            atm = atmosphere_at(0.0, 0.0, sol_of_year, dust_factor=dust_factor)
            ext_temp = atm.temperature_k
            rad = radiation_dose(
                sol_count=1, in_habitat=True, solar_flare=False)

            allocation = gov.decide(colony, len(events.active_events), prev)
            prev = Resources(
                o2_kg=colony.resources.o2_kg,
                h2o_liters=colony.resources.h2o_liters,
                food_kcal=colony.resources.food_kcal,
                power_kwh=colony.resources.power_kwh,
                crew_size=colony.resources.crew_size,
                power_capacity_kwh=colony.resources.power_capacity_kwh,
            )
            step(colony, irradiance, ext_temp, allocation,
                 active_events=events.active_event_dicts(),
                 radiation_msv=rad)

        result = {
            "survived_sols": colony.sol,
            "alive": colony.alive,
            "morale": colony.morale,
            "reputation": 0.5,
            "trades_completed": 0,
            "sols_on_rations": colony.sols_on_rations,
            "final_resources": {
                "o2_kg": colony.resources.o2_kg,
                "h2o_liters": colony.resources.h2o_liters,
                "food_kcal": colony.resources.food_kcal,
                "power_kwh": colony.resources.power_kwh,
            },
        }
        score = score_run(result, max_sols=max_sols)
        total_score += score.composite
        total_survived += colony.sol

    genome.fitness = total_score / len(seeds)
    genome.survived_sols = total_survived // len(seeds)
    return genome.fitness


def evolve(population_size: int = 50, generations: int = 30,
           elite_count: int = 5, mutation_rate: float = 0.15,
           max_sols: int = 200, seeds: List[int] = None,
           verbose: bool = True) -> List[Genome]:
    """Run the genetic algorithm. Returns final population sorted by fitness.

    Args:
        population_size: Number of genomes per generation
        generations: Number of breeding cycles
        elite_count: Top N genomes that survive unchanged
        mutation_rate: Probability of mutating each trait
        max_sols: Sols per evaluation run
        seeds: RNG seeds for evaluation
        verbose: Print progress
    """
    if seeds is None:
        seeds = [42, 137, 256]

    rng = random.Random(42)
    start_time = time.time()

    # Initialize population
    population = [random_genome(generation=0, rng=rng)
                  for _ in range(population_size)]

    # Also seed with known archetypes
    for i, (arch_name, arch_data) in enumerate(GOVERNOR_ARCHETYPES.items()):
        if i < population_size:
            population[i].traits = {k: v for k, v in arch_data.items()
                                     if k in TRAIT_NAMES}

    best_ever = None

    for gen in range(generations):
        # Evaluate
        for genome in population:
            evaluate_genome(genome, seeds=seeds, max_sols=max_sols)

        # Sort by fitness
        population.sort(key=lambda g: -g.fitness)

        best = population[0]
        avg_fitness = sum(g.fitness for g in population) / len(population)
        avg_survival = sum(g.survived_sols for g in population) / len(population)

        if best_ever is None or best.fitness > best_ever.fitness:
            best_ever = Genome(
                traits=dict(best.traits),
                fitness=best.fitness,
                survived_sols=best.survived_sols,
                generation=gen,
            )

        if verbose:
            elapsed = time.time() - start_time
            print(f"  Gen {gen+1:>3}/{generations}: "
                  f"best={best.fitness:.1f} avg={avg_fitness:.1f} "
                  f"survival={best.survived_sols} avg_surv={avg_survival:.0f} "
                  f"({elapsed:.1f}s)")

        # Select + breed next generation
        new_population = []

        # Elite: top N survive unchanged
        for i in range(min(elite_count, len(population))):
            elite = Genome(traits=dict(population[i].traits),
                          generation=gen + 1)
            new_population.append(elite)

        # Breed the rest via tournament selection + crossover + mutation
        while len(new_population) < population_size:
            # Tournament selection (pick 3, take best)
            t1 = rng.choice(population[:population_size // 2])
            t2 = rng.choice(population[:population_size // 2])
            parent1 = t1 if t1.fitness > t2.fitness else t2

            t3 = rng.choice(population[:population_size // 2])
            t4 = rng.choice(population[:population_size // 2])
            parent2 = t3 if t3.fitness > t4.fitness else t4

            child = crossover(parent1, parent2, gen + 1, rng)
            mutate(child, mutation_rate=mutation_rate, rng=rng)
            new_population.append(child)

        population = new_population

    # Final evaluation
    for genome in population:
        evaluate_genome(genome, seeds=seeds, max_sols=max_sols)
    population.sort(key=lambda g: -g.fitness)

    if verbose:
        elapsed = time.time() - start_time
        best = population[0]
        print(f"\n  EVOLUTION COMPLETE ({elapsed:.1f}s)")
        print(f"  Best genome: fitness={best.fitness:.1f} "
              f"survived={best.survived_sols} sols")
        print(f"  Traits:")
        for trait, val in best.traits.items():
            bar = "#" * int(val * 20) + "." * (20 - int(val * 20))
            print(f"    {trait:>22}: [{bar}] {val:.3f}")

    return population


def display_evolution_results(population: List[Genome]) -> None:
    """Print a formatted evolution results table."""
    print(f"\n{'='*70}")
    print(f"  MARS BARN OPUS — Governor Evolution Results")
    print(f"{'='*70}")

    print(f"\n  {'#':<4} {'Fitness':>8} {'Sols':>6} {'Gen':>4}  Traits")
    print(f"  {'-'*65}")

    for i, g in enumerate(population[:10]):
        traits_str = " ".join(f"{v:.2f}" for v in g.traits.values())
        print(f"  {i+1:<4} {g.fitness:>8.1f} {g.survived_sols:>6} {g.generation:>4}  {traits_str}")

    # Compare best evolved vs best archetype
    best = population[0]
    print(f"\n  Best Evolved Governor:")
    for trait, val in best.traits.items():
        print(f"    {trait:>22}: {val:.3f}")
    print(f"  Fitness: {best.fitness:.1f} | Avg Survival: {best.survived_sols} sols")
    print(f"{'='*70}\n")
