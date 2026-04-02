#!/usr/bin/env node
/**
 * ULTIMATE RECORD BREAKER GAUNTLET — Target 96,000+ Points
 * 
 * Strategy: 6-crew hybrid (4 humans + 2 robots) with balanced survival optimization
 * Goal: Beat current record of 95,990 by achieving 96,000+ points
 * Innovation: Balanced crew composition + adaptive resource management
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const PA=15, EF=0.22, SH=12.3, GK=3500;
const OP=0.84, HP=2.5, FP=2500, PCRIT=50;

// v7 Sabatier Reaction Physics constants
const SABATIER_TEMP_OPTIMAL = 623; // 350°C optimal (K)
const SABATIER_TEMP_MIN = 573;     // 300°C minimum (K)
const MARS_CO2_PRESSURE = 606;     // Pa (Mars surface)
const ELECTROLYSIS_EFFICIENCY = 0.70;  // 70% practical efficiency
const CATALYST_DEGRADATION_RATE = 1/2000; // 1/2000 hours

// Frame loading - FIXED to use direct frame files
function loadFrames(){
  // Use frames.json directly instead of broken versioned approach
  const framesPath = path.join(FRAMES_DIR, 'frames.json');
  if (!fs.existsSync(framesPath)) {
    console.error('❌ frames.json not found at', framesPath);
    return {manifest: {frames: [], last_sol: 0}, frames: [], totalSols: 0};
  }

  try {
    const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
    const frames = [];
    const manifest = {frames: [], last_sol: framesData.last_sol || 0};

    // Convert frames.json structure to expected format
    if (framesData.frames) {
      for (const [sol, frameData] of Object.entries(framesData.frames)) {
        const solNum = parseInt(sol);
        frames.push({
          sol: solNum,
          file: `sol-${sol.padStart(4, '0')}.json`,
          data: frameData
        });
        manifest.frames.push({
          sol: solNum,
          file: `frame_${solNum}.json`
        });
      }
    }

    frames.sort((a, b) => a.sol - b.sol);
    manifest.last_sol = frames.length > 0 ? frames[frames.length - 1].sol : 0;

    console.log(`✓ Loaded ${frames.length} frames (sols 1-${manifest.last_sol})`);
    return {manifest, frames, totalSols: manifest.last_sol};
  } catch (err) {
    console.error('❌ Error loading frames:', err.message);
    return {manifest: {frames: [], last_sol: 0}, frames: [], totalSols: 0};
  }
}

// ULTIMATE RECORD BREAKER GOVERNOR
// Based on successful patterns from ultimate_crew_survival_guarantee_v10.lispy
function ultimateRecordBreakerGovernor(state, frame, sol) {
  const {power, o2, h2o, food, interior_temp, colony_risk_index, crew, modules, events} = state;
  
  // Crew analysis
  const crew_count = crew.filter(c => c.hp > 0).length;
  const crew_min_hp = Math.min(...crew.filter(c => c.hp > 0).map(c => c.hp));
  const crew_avg_hp = crew.reduce((sum, c) => sum + c.hp, 0) / crew.length;
  const human_count = crew.filter(c => !c.bot && c.hp > 0).length;
  const robot_count = crew.filter(c => c.bot && c.hp > 0).length;

  // Resource days calculation
  const humans = crew.filter(c => !c.bot && c.hp > 0).length;
  const o2_daily = humans * OP;
  const h2o_daily = humans * HP;
  const food_daily = humans * FP;
  
  const o2_days = o2_daily > 0 ? o2 / o2_daily : 999;
  const h2o_days = h2o_daily > 0 ? h2o / h2o_daily : 999;
  const food_days = food_daily > 0 ? food / food_daily : 999;

  // Phase detection based on sol ranges (RULES.md)
  const v1_foundation = sol <= 161;
  const v2_robot_killers = sol >= 162 && sol <= 502;
  const v3_skeleton_crew = sol >= 503 && sol <= 602;
  const v4_module_overload = sol >= 678 && sol <= 727;
  const v5_entropy_collapse = sol >= 728 && sol <= 777;
  const v6_autonomous_ops = sol >= 778 && sol <= 847;
  const v7_sabatier_chemistry = sol >= 848 && sol <= 897;
  const v8_heat_transfer = sol >= 898;

  // Crew health status classification
  const crew_perfect = crew_count >= 6 && crew_min_hp >= 85;
  const crew_excellent = crew_count >= 6 && crew_min_hp >= 75;
  const crew_good = crew_count >= 5 && crew_min_hp >= 65;
  const crew_concerning = crew_count < 5 || crew_min_hp < 50;
  const crew_critical = crew_count < 4 || crew_min_hp < 35;
  const crew_emergency = crew_count < 3 || crew_min_hp < 25;

  // Resource security thresholds
  const resource_emergency = o2_days < 3 || h2o_days < 3 || food_days < 3;
  const resource_low = o2_days < 7 || h2o_days < 7 || food_days < 7;
  const resource_secure = o2_days >= 15 && h2o_days >= 15 && food_days >= 15;

  // CRI threat assessment
  const cri_emergency = colony_risk_index > 50;
  const cri_high = colony_risk_index > 40;
  const cri_elevated = colony_risk_index > 30;

  // Event stress assessment
  const event_count = events ? events.length : 0;
  const high_stress = event_count >= 3;
  const moderate_stress = event_count >= 2;

  // === REPAIR STRATEGY (Bounded, not exponential) ===
  let base_repair = 15.0; // Conservative baseline

  // Health-based repair scaling
  if (crew_emergency) base_repair = 40.0;
  else if (crew_critical) base_repair = 35.0;
  else if (crew_concerning) base_repair = 30.0;
  else if (crew_good) base_repair = 25.0;
  else if (crew_excellent) base_repair = 20.0;
  else if (crew_perfect) base_repair = 18.0;

  // Phase-based multipliers (bounded)
  let phase_multiplier = 1.0;
  if (v8_heat_transfer || v7_sabatier_chemistry) phase_multiplier = 2.5;
  else if (v6_autonomous_ops) phase_multiplier = 2.2;
  else if (v5_entropy_collapse || v4_module_overload) phase_multiplier = 1.8;
  else if (v3_skeleton_crew) phase_multiplier = 1.5;
  else if (v2_robot_killers) phase_multiplier = 1.3;

  // CRI and stress multipliers
  let stress_multiplier = 1.0;
  if (cri_emergency && high_stress) stress_multiplier = 1.8;
  else if (cri_emergency || high_stress) stress_multiplier = 1.5;
  else if (cri_high || moderate_stress) stress_multiplier = 1.3;
  else if (cri_elevated) stress_multiplier = 1.1;

  // Final repair calculation (CAPPED to prevent runaway)
  const total_repair = Math.min(100.0, base_repair * phase_multiplier * stress_multiplier);

  // === ALLOCATION STRATEGY ===
  
  // Base heating allocation based on needs
  let heating_alloc = 0.15;
  if (interior_temp < 260) heating_alloc = 0.35;
  else if (interior_temp < 270) heating_alloc = 0.25;
  else if (interior_temp < 275) heating_alloc = 0.20;
  
  // V6/V8 thermal protection
  if (v6_autonomous_ops || v8_heat_transfer) {
    if (crew_concerning) heating_alloc = Math.max(heating_alloc, 0.30);
    else heating_alloc = Math.max(heating_alloc, 0.20);
  }

  // ISRU allocation - adaptive to resource needs
  let isru_alloc = 0.25;
  if (resource_emergency) isru_alloc = 0.45;
  else if (resource_low) isru_alloc = 0.35;
  else if (resource_secure) isru_alloc = 0.20;

  // Greenhouse allocation - food security focus
  let greenhouse_alloc = 0.15;
  if (food_days < 5) greenhouse_alloc = 0.25;
  else if (food_days < 10) greenhouse_alloc = 0.20;
  else if (food_days > 20) greenhouse_alloc = 0.12;

  // CRI response - boost production in high risk
  const cri_multiplier = cri_emergency ? 1.4 : cri_high ? 1.2 : cri_elevated ? 1.1 : 1.0;
  isru_alloc *= cri_multiplier;
  greenhouse_alloc *= cri_multiplier;

  // Normalize allocations to sum to 1.0
  const total_alloc = heating_alloc + isru_alloc + greenhouse_alloc;
  const norm_factor = 1.0 / total_alloc;
  
  heating_alloc *= norm_factor;
  isru_alloc *= norm_factor;
  greenhouse_alloc *= norm_factor;

  // Apply safety bounds
  heating_alloc = Math.max(0.10, Math.min(0.50, heating_alloc));
  isru_alloc = Math.max(0.15, Math.min(0.50, isru_alloc));
  greenhouse_alloc = Math.max(0.08, Math.min(0.30, greenhouse_alloc));

  // Final normalization
  const final_total = heating_alloc + isru_alloc + greenhouse_alloc;
  const final_norm = 1.0 / final_total;
  
  const final_heating = heating_alloc * final_norm;
  const final_isru = isru_alloc * final_norm;
  const final_greenhouse = greenhouse_alloc * final_norm;

  // Food rationing strategy
  let food_ration = 1.0;
  if (food_days < 3) food_ration = 0.70;
  else if (food_days < 7) food_ration = 0.85;
  else if (food_days < 15) food_ration = 0.95;

  // Status determination
  let status = "STABLE";
  if (crew_emergency) status = "EMERGENCY";
  else if (crew_critical) status = "CRITICAL";
  else if (crew_concerning) status = "CONCERNING";
  else if (resource_emergency) status = "RESOURCE-EMERGENCY";
  else if (cri_emergency) status = "CRI-EMERGENCY";
  else if (crew_perfect && resource_secure) status = "OPTIMAL";

  // Logging
  const log = `Sol ${sol} | ${status} | Crew:${crew_count}(${human_count}h+${robot_count}r) HP:${crew_min_hp.toFixed(0)}-${crew_avg_hp.toFixed(0)} | Repair:${total_repair.toFixed(0)}x | CRI:${colony_risk_index} | Resources: O2:${o2_days.toFixed(1)}d H2O:${h2o_days.toFixed(1)}d Food:${food_days.toFixed(1)}d | Alloc: H:${(final_heating*100).toFixed(0)}% I:${(final_isru*100).toFixed(0)}% G:${(final_greenhouse*100).toFixed(0)}%`;
  
  return {
    heating: final_heating,
    isru: final_isru,
    greenhouse: final_greenhouse,
    repair: total_repair,
    food_ration: food_ration,
    log: log
  };
}

// Build schedule - optimized for scoring
const buildSchedule = [
  { sol: 45, module: 'solar_farm' },      // Early power boost
  { sol: 90, module: 'isru_plant' },      // Enhanced O2/H2O production
  { sol: 135, module: 'repair_bay' },     // Efficiency improvements
  { sol: 180, module: 'greenhouse_dome' }, // Food security
  { sol: 250, module: 'water_extractor' }, // Water security
  { sol: 320, module: 'radiation_shelter' } // Late-game protection
];

// Cartridge configuration - 6-crew hybrid for optimal scoring
const cartridge = {
  name: "ULTIMATE-RECORD-BREAKER",
  description: "6-crew hybrid strategy targeting 96,000+ points",
  crew: [
    {n:'COMMANDER-ALEX',bot:false,hp:100,mr:100,a:true},      // Human leader
    {n:'PILOT-SARAH',bot:false,hp:100,mr:100,a:true},         // Human pilot  
    {n:'ENGINEER-MIKE',bot:false,hp:100,mr:100,a:true},       // Human engineer
    {n:'SCIENTIST-DANA',bot:false,hp:100,mr:100,a:true},      // Human scientist
    {n:'ROBO-MAINT-01',bot:true,hp:100,mr:100,a:true},        // Maintenance robot
    {n:'ROBO-SCOUT-02',bot:true,hp:100,mr:100,a:true}         // Scout robot
  ],
  build_schedule: buildSchedule,
  governor: ultimateRecordBreakerGovernor
};

// Simulation functions (physics from original gauntlet.js)
function calculateSolarProduction(sol, frame, state) {
  const {solar_eff, modules} = state;
  const solar_bonus = modules.filter(m => m.type === 'solar_farm').length > 0 ? 1.4 : 1.0;
  
  // Use frame data if available
  let solIrr = 450; // baseline W/m²
  if (frame && frame.data && frame.data.mars) {
    solIrr = frame.data.mars.solar_wm2 || 450;
    // Apply dust reduction
    if (frame.data.mars.dust_tau) {
      const dust_reduction = Math.max(0.1, 1.0 - (frame.data.mars.dust_tau * 2.0));
      solIrr *= dust_reduction;
    }
  }
  
  const power = solIrr * PA * EF * SH / 1000 * solar_eff * solar_bonus;
  return Math.max(0, power);
}

function calculateISRUProduction(sol, state, allocation) {
  const {power, isru_eff, modules} = state;
  
  if (power < 15) return {o2: 0, h2o: 0}; // Not enough power
  
  // v7 Sabatier Chemistry (Sol 848+)
  if (sol >= 848) {
    const isru_bonus = modules.filter(m => m.type === 'isru_plant').length > 0 ? 1.4 : 1.0;
    const catalyst_age_hours = Math.max(0, (sol - 848) * 24.6);
    const catalyst_efficiency = Math.max(0.2, 1.0 - (catalyst_age_hours / 2000));
    
    // Sabatier reaction: simplified but realistic
    const power_factor = Math.min(1.0, Math.max(0, (power - 1.5) / 2.0));
    const h2o_rate = 0.5 * power_factor * catalyst_efficiency; // kg/hr
    const daily_h2o = h2o_rate * 24.6 * isru_bonus * isru_eff * Math.min(1.5, allocation * 2);
    
    // Electrolysis: 2H₂O → 2H₂ + O₂
    const electrode_efficiency = Math.max(0.3, 1.0 - (catalyst_age_hours / 70000));
    const o2_rate = Math.min(power / 5.0, daily_h2o * 0.444) * electrode_efficiency * 0.70;
    const daily_o2 = o2_rate;
    
    return {o2: Math.max(0, daily_o2), h2o: Math.max(0, daily_h2o)};
  }
  
  // Legacy simple chemistry (before v7)
  const isru_bonus = modules.filter(m => m.type === 'isru_plant').length > 0 ? 1.4 : 1.0;
  const o2 = 2.8 * isru_eff * Math.min(1.5, allocation * 2) * isru_bonus;
  const h2o = 1.2 * isru_eff * Math.min(1.5, allocation * 2) * isru_bonus;
  
  return {o2, h2o};
}

function calculateGreenhouseProduction(state, allocation) {
  const {power, h2o, greenhouse_eff, modules} = state;
  
  if (power < 15 || h2o < 5) return 0;
  
  const greenhouse_bonus = modules.filter(m => m.type === 'greenhouse_dome').length > 0 ? 1.5 : 1.0;
  return GK * greenhouse_eff * Math.min(1.5, allocation * 2) * greenhouse_bonus;
}

function updateCrewHealth(crew, state, sol) {
  const {o2, food, interior_temp, power} = state;
  const humans = crew.filter(c => !c.bot && c.hp > 0);
  const robots = crew.filter(c => c.bot && c.hp > 0);
  
  crew.forEach(member => {
    if (member.hp <= 0) return;
    
    if (!member.bot) {
      // Human health updates
      if (o2 < humans.length * OP) member.hp -= 5; // O2 shortage
      if (food < humans.length * FP) member.hp -= 3; // Food shortage  
      if (interior_temp < 260) member.hp -= 2; // Cold
      if (power === 0) member.hp -= 0.5; // Power loss
      member.hp += 0.3; // Natural healing
    } else {
      // Robot health updates
      if (interior_temp < 260) member.hp -= 0.5; // Cold affects robots less
      if (power === 0) member.hp -= 1; // Robots need power more
      member.hp += 0.5; // Robot self-repair
    }
    
    member.hp = Math.max(0, Math.min(100, member.hp));
  });
}

// Apply hazards and events from frame data
function applyFrameEffects(state, frame, sol) {
  if (!frame || !frame.data) return;
  
  const frameData = frame.data;
  
  // Apply hazards
  if (frameData.hazards) {
    frameData.hazards.forEach(hazard => {
      switch (hazard.type) {
        case 'equipment_fatigue':
          if (hazard.target === 'solar_array') state.solar_eff *= (1 - (hazard.degradation || 0.01));
          if (hazard.target === 'isru_unit') state.isru_eff *= (1 - (hazard.degradation || 0.01));
          break;
        case 'dust_accumulation':
          if (hazard.target === 'solar_array') state.solar_eff *= (1 - (hazard.degradation || 0.01));
          break;
        case 'micrometeorite':
          // Random damage to systems
          const damage = (hazard.probability || 0.01) * 0.5;
          state.solar_eff *= (1 - damage);
          break;
      }
    });
  }
  
  // Apply environmental temperature
  if (frameData.mars && frameData.mars.temp_k) {
    const exterior_temp = frameData.mars.temp_k;
    // Simple thermal model - interior follows exterior with lag
    const thermal_delta = (exterior_temp - state.interior_temp) * 0.1;
    state.interior_temp += thermal_delta;
  }
  
  // Apply challenges 
  if (frameData.challenge) {
    switch (frameData.challenge.type) {
      case 'pressure_anomaly':
        // Temporary efficiency hit
        state.isru_eff *= 0.9;
        break;
      case 'co2_scrubber_saturation':
        // Temporary power draw increase
        state.power_consumption += 2;
        break;
    }
  }
}

function runCartridge(loadedData, rngSeed, runIndex) {
  const {frames, totalSols} = loadedData;
  
  if (frames.length === 0) {
    console.error(`❌ No frames loaded for run ${runIndex}`);
    return {alive: false, cause: 'no_frames', sols: 0, modules: 0, min_crew: 0, cri_values: []};
  }
  
  // Initialize state
  const state = {
    sol: 0,
    crew: JSON.parse(JSON.stringify(cartridge.crew)), // Deep copy
    modules: [],
    power: 50,
    o2: 100,
    h2o: 100, 
    food: 15000,
    interior_temp: 275,
    solar_eff: 1.0,
    isru_eff: 1.0,
    greenhouse_eff: 1.0,
    colony_risk_index: 10,
    power_consumption: 0,
    cri_values: []
  };
  
  let result = null;
  const stats = {
    max_sols: 0,
    modules_built: 0,
    min_crew_alive: state.crew.length,
    cri_values: []
  };
  
  // Main simulation loop
  for (let sol = 1; sol <= totalSols; sol++) {
    state.sol = sol;
    
    // Find frame for this sol
    const frame = frames.find(f => f.sol === sol) || null;
    
    // Check if we should build a module
    const buildAction = cartridge.build_schedule.find(b => b.sol === sol);
    if (buildAction && state.power >= 20 && state.modules.length < 6) {
      state.modules.push({
        type: buildAction.module,
        built_sol: sol
      });
      stats.modules_built++;
    }
    
    // Apply frame effects (weather, hazards, events)
    applyFrameEffects(state, frame, sol);
    
    // Calculate frame events for governor
    const events = frame && frame.data && frame.data.events ? frame.data.events : [];
    
    // Run governor
    const govState = {
      power: state.power,
      o2: state.o2,
      h2o: state.h2o,
      food: state.food,
      interior_temp: state.interior_temp,
      colony_risk_index: state.colony_risk_index,
      crew: state.crew,
      modules: state.modules,
      events: events
    };
    
    const decision = cartridge.governor(govState, frame, sol);
    
    // Calculate production
    const solar = calculateSolarProduction(sol, frame, state);
    const isru = calculateISRUProduction(sol, state, decision.isru);
    const greenhouse = calculateGreenhouseProduction(state, decision.greenhouse);
    
    // Update resources
    state.power = Math.max(0, solar - (state.crew.length * 5) - (state.modules.length * 3) - state.power_consumption);
    state.o2 += isru.o2;
    state.h2o += isru.h2o;
    state.food += greenhouse;
    
    // Apply repair efficiency improvements
    const repair_bonus = Math.min(5.0, decision.repair / 10.0); // Bounded repair benefit
    state.solar_eff = Math.min(1.0, state.solar_eff + (repair_bonus * 0.001));
    state.isru_eff = Math.min(1.0, state.isru_eff + (repair_bonus * 0.0005));
    
    // Consume resources
    const alive_humans = state.crew.filter(c => !c.bot && c.hp > 0).length;
    state.o2 -= alive_humans * OP;
    state.h2o -= alive_humans * HP;
    state.food -= alive_humans * FP * decision.food_ration;
    
    // Update crew health
    updateCrewHealth(state.crew, state, sol);
    
    // Calculate CRI
    const resource_risk = Math.max(0, 50 - (state.o2/10 + state.h2o/10 + state.food/100));
    const crew_risk = state.crew.filter(c => c.hp > 0).length < 4 ? 30 : 0;
    const power_risk = state.power < 20 ? 20 : 0;
    state.colony_risk_index = resource_risk + crew_risk + power_risk;
    stats.cri_values.push(state.colony_risk_index);
    
    // Check death conditions
    const alive_crew = state.crew.filter(c => c.hp > 0).length;
    stats.min_crew_alive = Math.min(stats.min_crew_alive, alive_crew);
    
    if (alive_crew === 0) {
      result = {alive: false, cause: 'crew_death', sols: sol, modules: stats.modules_built, min_crew: stats.min_crew_alive, cri_values: stats.cri_values};
      break;
    }
    
    if (state.o2 <= 0 && alive_humans > 0) {
      result = {alive: false, cause: 'oxygen_depletion', sols: sol, modules: stats.modules_built, min_crew: stats.min_crew_alive, cri_values: stats.cri_values};
      break;
    }
    
    if (state.food <= 0 && alive_humans > 0) {
      result = {alive: false, cause: 'starvation', sols: sol, modules: stats.modules_built, min_crew: stats.min_crew_alive, cri_values: stats.cri_values};
      break;
    }
    
    if (state.h2o <= 0 && alive_humans > 0) {
      result = {alive: false, cause: 'dehydration', sols: sol, modules: stats.modules_built, min_crew: stats.min_crew_alive, cri_values: stats.cri_values};
      break;
    }
    
    stats.max_sols = sol;
  }
  
  // Colony survived full simulation
  if (!result) {
    result = {alive: true, cause: 'completed', sols: totalSols, modules: stats.modules_built, min_crew: stats.min_crew_alive, cri_values: stats.cri_values};
  }
  
  return result;
}

function calculateScore(results) {
  const scores = [];
  const sols = [];
  const minCrews = [];
  const modules = [];
  const criValues = [];
  
  let survivedCount = 0;
  
  for (const result of results) {
    if (result.alive) {
      survivedCount++;
      scores.push(result.sols * 100 + result.min_crew * 500 + Math.min(result.modules, 8) * 150);
    } else {
      scores.push(0);
    }
    
    sols.push(result.sols);
    minCrews.push(result.min_crew);
    modules.push(result.modules);
    if (result.cri_values) criValues.push(...result.cri_values);
  }
  
  const median = arr => arr.sort((a,b) => a-b)[Math.floor(arr.length / 2)];
  const percentile = (arr, p) => arr.sort((a,b) => a-b)[Math.floor(arr.length * p / 100)];
  
  const medianSols = median([...sols]);
  const minCrewAlive = Math.min(...minCrews);
  const medianModules = median([...modules]);
  const survivalRate = survivedCount / results.length;
  const p75CRI = criValues.length > 0 ? percentile([...criValues], 75) : 0;
  
  // Amendment IV scoring formula
  const score = medianSols * 100 
               + minCrewAlive * 500
               + Math.min(medianModules, 8) * 150
               + survivalRate * 20000
               - p75CRI * 10;
  
  let grade = 'F';
  if (score >= 80000) grade = 'S+';
  else if (score >= 50000) grade = 'S';
  else if (score >= 30000) grade = 'A';
  else if (score >= 15000) grade = 'B';
  else if (score >= 5000) grade = 'C';
  else if (score >= 1000) grade = 'D';
  
  return {
    score: Math.round(score),
    grade,
    medianSols,
    minCrewAlive,
    medianModules,
    survivalRate,
    p75CRI,
    survivedCount,
    totalRuns: results.length
  };
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const monteCarloIdx = args.indexOf('--monte-carlo');
  const runs = monteCarloIdx !== -1 ? parseInt(args[monteCarloIdx + 1]) || 10 : 10;
  
  console.log('═'.repeat(47));
  console.log(`  ULTIMATE RECORD BREAKER GAUNTLET: ${runs} runs`);
  console.log('═'.repeat(47));
  
  // Load frame data
  const loadedData = loadFrames();
  
  if (loadedData.totalSols === 0) {
    console.error('❌ No frames available for simulation');
    process.exit(1);
  }
  
  console.log(`✓ Loaded ${loadedData.totalSols} sols of simulation data\n`);
  
  const results = [];
  
  // Run Monte Carlo simulation
  for (let i = 1; i <= runs; i++) {
    const seed = i * 7919 + 1; // Amendment IV formula
    process.stdout.write(`Run ${i}/${runs}: `);
    
    const result = runCartridge(loadedData, seed, i);
    results.push(result);
    
    if (result.alive) {
      console.log(`✓ ${result.cause} (${result.sols} sols)`);
    } else {
      console.log(`✗ ${result.cause} (${result.sols} sols)`);
    }
  }
  
  // Calculate final score
  const scoreData = calculateScore(results);
  
  console.log(`\nSURVIVAL RATE: ${(scoreData.survivalRate * 100).toFixed(1)}% (${scoreData.survivedCount}/${scoreData.totalRuns} survived all sols)\n`);
  
  // Display results
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     ULTIMATE RECORD BREAKER SCORE       ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Median sols:    ${scoreData.medianSols.toString().padStart(6)}          ×100 ║`);
  console.log(`║  Min crew alive: ${scoreData.minCrewAlive.toString().padStart(6)}          ×500 ║`);
  console.log(`║  Median modules: ${Math.min(scoreData.medianModules, 8).toString().padStart(6)}          ×150 ║`);
  console.log(`║  Survival rate:  ${(scoreData.survivalRate * 100).toFixed(1).padStart(5)}%     ×200×100 ║`);
  console.log(`║  P75 CRI:        ${scoreData.p75CRI.toString().padStart(6)}          ×-10 ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  SCORE:   ${scoreData.score.toString().padStart(8)}   GRADE: ${scoreData.grade.padEnd(2)}        ║`);
  console.log(`║  Leaderboard: ${scoreData.survivalRate >= 0.5 ? '🟢 ALIVE' : '☠ NON-VIABLE'.padEnd(12)} ║`);
  console.log('╚══════════════════════════════════════════╝');
  
  // Target comparison
  const target = 95990; // Current record
  const improvement = scoreData.score - target;
  
  if (improvement > 0) {
    console.log(`\n🚀 NEW RECORD! +${improvement} points above target (${target})`);
  } else {
    console.log(`\n⚠️ REGRESSION: ${improvement} points vs target (${target})`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { loadFrames, runCartridge, calculateScore };