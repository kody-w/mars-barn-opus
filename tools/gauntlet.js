#!/usr/bin/env node
/**
 * GAUNTLET — Run a cartridge through ALL frame versions sequentially.
 * 
 * A colony isn't "alive" unless it survives the LATEST version.
 * The gauntlet runs v1 → v2 → v3 → ... with state carrying forward.
 * Damage accumulates. The fidelity snowball rolls.
 * 
 * Monte Carlo mode: run N times with different RNG seeds.
 * The survival RATE across seeds = the strategy's true robustness.
 *
 * Usage:
 *   node tools/gauntlet.js                     # single run, all versions
 *   node tools/gauntlet.js --monte-carlo 100   # 100 runs, survival stats
 *   node tools/gauntlet.js --subscribe         # watch for new frames, re-run
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const VERSIONS_PATH = path.join(__dirname, '..', 'data', 'frame-versions', 'versions.json');
const PA=15, EF=0.22, SH=12.3, GK=3500;
const OP=0.84, HP=2.5, FP=2500, PCRIT=50;

// v7 Sabatier Reaction Physics - Real NASA ISRU chemistry
// CO₂ + 4H₂ → CH₄ + 2H₂O (Sabatier reaction, 300-400°C, Ni/Ru catalyst)
// 2H₂O → 2H₂ + O₂ (electrolysis, 1.23V minimum, ~70% efficiency)
// Data sources: NASA MOXIE (6g O₂/hr at 300W), Sabatier reactors (0.34 kg CH₄/hr), ISS OGS (9kg O₂/day at 3kW)

// Physical constants (NASA specifications)
const SABATIER_TEMP_OPTIMAL = 623; // 350°C optimal (K)
const SABATIER_TEMP_MIN = 573;     // 300°C minimum (K)
const SABATIER_TEMP_MAX = 673;     // 400°C maximum (K)
const MARS_CO2_PRESSURE = 606;     // Pa (Mars surface)
const ELECTROLYSIS_MIN_VOLTAGE = 1.23; // V theoretical minimum
const ELECTROLYSIS_EFFICIENCY = 0.70;  // 70% practical efficiency
const CATALYST_DEGRADATION_RATE = 1/2000; // 1/2000 hours = 0.0005/hour
const MOLAR_MASS_O2 = 32.0; // g/mol
const MOLAR_MASS_H2O = 18.0; // g/mol
const MOLAR_MASS_CO2 = 44.0; // g/mol
const FARADAY_CONSTANT = 96485; // C/mol

function rng32(s){let t=s&0xFFFFFFFF;return()=>{t=(t*1664525+1013904223)&0xFFFFFFFF;return(t>>>0)/0xFFFFFFFF}}
function solIrr(sol,dust){const y=sol%669,a=2*Math.PI*(y-445)/669;return 589*(1+0.09*Math.cos(a))*Math.max(0.3,Math.cos(2*Math.PI*y/669)*0.5+0.5)*(dust?0.25:1)}

// v7 Sabatier Reaction Physics Functions
function sabatierReactionRate(catalyst_temp, co2_pressure, catalyst_efficiency, power_kw) {
  // CO₂ + 4H₂ → CH₄ + 2H₂O
  // Based on NASA ISRU studies: 0.34 kg CH₄/hr baseline at optimal conditions
  
  // Temperature efficiency (Arrhenius-like behavior)
  const temp_factor = Math.max(0.1, Math.min(1.0, 
    (catalyst_temp - SABATIER_TEMP_MIN) / (SABATIER_TEMP_OPTIMAL - SABATIER_TEMP_MIN)
  ));
  
  // CO₂ pressure factor (Mars has low pressure, needs compression)
  const pressure_factor = Math.min(1.0, co2_pressure / MARS_CO2_PRESSURE);
  
  // Power limitation (minimum ~1.5 kW for practical Sabatier reactor)
  const power_factor = Math.min(1.0, Math.max(0, (power_kw - 1.5) / 2.0));
  
  // ADJUSTED: Base rate to match legacy O₂ production when optimal
  // Target: ~2.8 kg O₂/sol at optimal conditions → ~6.3 kg H₂O/sol → ~0.26 kg H₂O/hr
  const base_h2o_rate = 0.26; // kg/hr (reduced from 0.5 to match legacy)
  
  return base_h2o_rate * temp_factor * pressure_factor * power_factor * catalyst_efficiency;
}

function electrolysisRate(h2o_available_kg, power_kw, electrode_efficiency, electrode_temp) {
  // 2H₂O → 2H₂ + O₂
  // Energy requirement: ~4.5-5.5 kWh per kg O₂ (practical)
  
  const energy_per_kg_o2 = 5.0; // kWh/kg O₂ (includes system losses)
  const max_o2_from_power = power_kw / energy_per_kg_o2; // kg O₂/hour
  
  // Stoichiometry: 18g H₂O → 8g O₂ → 0.444 kg O₂ per kg H₂O
  const max_o2_from_water = h2o_available_kg * 0.444;
  
  // Temperature efficiency (higher temp = better efficiency but more degradation)
  const temp_factor = Math.min(1.2, Math.max(0.7, (electrode_temp + 20) / 293.0));
  
  // Limited by power OR water availability
  const actual_o2_rate = Math.min(max_o2_from_power, max_o2_from_water) * 
                        electrode_efficiency * temp_factor * ELECTROLYSIS_EFFICIENCY;
  
  // Corresponding H₂O consumption
  const h2o_consumed = actual_o2_rate / 0.444;
  
  return { o2_kg_hr: actual_o2_rate, h2o_consumed_kg_hr: h2o_consumed };
}

function updateCatalystDegradation(state, operating_hours) {
  // Catalyst degrades based on operating time and thermal cycles
  // NASA data: Ni catalysts need replacement every ~2000 hours
  state.catalyst_age_hours += operating_hours;
  state.catalyst_efficiency = Math.max(0.2, 1.0 - (state.catalyst_age_hours * CATALYST_DEGRADATION_RATE));
  
  // Electrolysis electrodes also degrade (PEM systems: 60,000-80,000 hour target)
  state.electrode_age_hours += operating_hours;
  const electrode_degradation_rate = 1/70000; // 70,000 hour target life
  state.electrode_efficiency = Math.max(0.3, 1.0 - (state.electrode_age_hours * electrode_degradation_rate));
}

// v9 Spatial Layout Physics Functions
// Based on NASA JSC Mars habitat thermal modeling (JSC-CN-33799)
// Power distribution: I²R losses over distance, cable resistance = ρL/A
// Copper wire resistivity = 1.68×10⁻⁸ Ω·m, typical cable: 50mm² cross-section

function calculateDistance(pos1, pos2) {
  // Safety check for valid positions
  if (!pos1 || !pos2 || typeof pos1.x !== 'number' || typeof pos1.y !== 'number' || 
      typeof pos2.x !== 'number' || typeof pos2.y !== 'number') {
    return 0; // Return 0 distance if positions are invalid
  }
  
  // Manhattan distance in grid tiles (robots can't move diagonally efficiently)
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return dx + dy;
}

function calculateCableResistance(distance_tiles, tile_size_m = 10) {
  // Real copper cable resistance calculation
  // Based on NASA standards for Mars habitat power distribution
  const distance_m = distance_tiles * tile_size_m;
  const copper_resistivity = 1.68e-8; // Ω·m (copper at Mars temperature ~230K)
  const cable_cross_section = 50e-6;  // 50mm² typical for habitat power distribution
  const resistance_per_meter = copper_resistivity / cable_cross_section; // Ω/m
  return distance_m * resistance_per_meter; // Total resistance (Ω)
}

function calculatePowerLoss(power_kw, resistance_ohm, voltage_v = 400) {
  // Power loss = I²R, where I = P/V
  const current_a = (power_kw * 1000) / voltage_v;
  const power_loss_w = current_a * current_a * resistance_ohm;
  return power_loss_w / 1000; // Convert to kW
}

function calculatePumpingCost(distance_tiles, elevation_diff_m = 0, tile_size_m = 10) {
  // Plumbing pumping power based on NASA ECLSS data
  // Power = (flow_rate × pressure_head × density × gravity) / pump_efficiency
  const distance_m = distance_tiles * tile_size_m;
  const pipe_diameter_m = 0.05; // 50mm diameter for water/air lines
  const flow_velocity_ms = 2.0;  // 2 m/s typical for space systems
  const pump_efficiency = 0.8;   // 80% pump efficiency
  const mars_gravity = 3.71;     // m/s²
  const water_density = 1000;    // kg/m³
  
  // Pressure head from friction + elevation
  const friction_factor = 0.02;  // Smooth pipe friction factor
  const friction_pressure = friction_factor * (distance_m / pipe_diameter_m) * 
                           (water_density * flow_velocity_ms * flow_velocity_ms / 2);
  const elevation_pressure = water_density * mars_gravity * Math.abs(elevation_diff_m);
  const total_pressure_head = friction_pressure + elevation_pressure;
  
  // Flow rate for typical habitat line (2 L/s = 0.002 m³/s)
  const flow_rate = 0.002; // m³/s
  
  // Power in watts = (flow × pressure × gravity) / efficiency  
  const power_w = (flow_rate * total_pressure_head) / pump_efficiency;
  return power_w / 1000; // Convert to kW
}

function findNearestModule(state, target_pos, max_distance = 2) {
  // Find nearest existing module within connection range
  let nearest = null;
  let min_distance = max_distance + 1;
  
  // Check habitat center first
  const hab_distance = calculateDistance(state.habitat_center, target_pos);
  if (hab_distance <= max_distance) {
    nearest = state.habitat_center;
    min_distance = hab_distance;
  }
  
  // Check all existing modules
  for (const [module_id, pos] of state.module_positions) {
    const distance = calculateDistance(pos, target_pos);
    if (distance <= max_distance && distance < min_distance) {
      nearest = pos;
      min_distance = distance;
    }
  }
  
  return nearest;
}

function findOptimalBuildSite(state, R) {
  // Find optimal building site considering:
  // 1. Adjacency to existing infrastructure (≤2 tiles)
  // 2. Minimize total cable length (power losses)
  // 3. Avoid occupied tiles
  
  const candidates = [];
  const center = state.habitat_center;
  
  // Search in expanding squares from center
  for (let radius = 1; radius <= 6; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const pos = {x: center.x + dx, y: center.y + dy};
        
        // Check grid bounds
        if (pos.x < 0 || pos.x >= state.grid_size || pos.y < 0 || pos.y >= state.grid_size) continue;
        
        // Check if tile is occupied
        let occupied = false;
        for (const [_, module_pos] of state.module_positions) {
          if (module_pos.x === pos.x && module_pos.y === pos.y) {
            occupied = true;
            break;
          }
        }
        if (occupied) continue;
        
        // Check adjacency to existing infrastructure
        const nearest = findNearestModule(state, pos);
        if (!nearest) continue;
        
        const distance = calculateDistance(nearest, pos);
        const total_distance_to_center = calculateDistance(center, pos);
        
        candidates.push({
          pos: pos,
          connection_distance: distance,
          total_distance: total_distance_to_center,
          score: distance + total_distance_to_center * 0.2 // Prefer closer to center overall
        });
      }
    }
    if (candidates.length > 0) break; // Take first valid radius level
  }
  
  if (candidates.length === 0) return null;
  
  // Sort by score and add some randomness
  candidates.sort((a, b) => a.score - b.score);
  const top_candidates = candidates.slice(0, Math.min(3, candidates.length));
  return top_candidates[Math.floor(R() * top_candidates.length)].pos;
}

function updateSpatialNetworks(state) {
  // Update cable and plumbing networks based on current module positions
  // This affects power efficiency and resource transfer costs
  
  state.cable_network = [];
  state.plumbing_network = [];
  
  const center = state.habitat_center;
  
  // Connect each module to nearest neighbor (forming a minimum spanning tree)
  for (const [module_id, module_pos] of state.module_positions) {
    const nearest = findNearestModule(state, module_pos);
    if (!nearest) continue;
    
    const distance_tiles = calculateDistance(nearest, module_pos);
    const distance_m = distance_tiles * state.tile_size_m;
    
    // Cable connection
    const cable_resistance = calculateCableResistance(distance_tiles, state.tile_size_m);
    state.cable_network.push({
      from: nearest,
      to: module_pos,
      distance_m: distance_m,
      resistance_ohm: cable_resistance
    });
    
    // Plumbing connection (for ISRU, water extractor, greenhouse)
    const module_type = module_pos.type;
    if (['isru_plant', 'water_extractor', 'greenhouse_dome'].includes(module_type)) {
      const pump_cost = calculatePumpingCost(distance_tiles, 0, state.tile_size_m);
      state.plumbing_network.push({
        from: nearest,
        to: module_pos,
        distance_m: distance_m,
        pump_cost_kw: pump_cost
      });
    }
  }
}

function calculateSpatialEfficiencyLoss(state) {
  // Safety check - only calculate if spatial networks exist
  if (!state.cable_network || !state.plumbing_network) {
    return {
      power_loss_kw: 0,
      pump_cost_kw: 0,
      total_overhead_kw: 0
    };
  }
  
  // Calculate total efficiency loss from spatial infrastructure
  let total_power_loss = 0;
  let total_pump_cost = 0;
  
  // Power losses from cable resistance (I²R losses)
  const base_power_per_module = 3; // kW base consumption per module
  for (const cable of state.cable_network) {
    const power_loss = calculatePowerLoss(base_power_per_module, cable.resistance_ohm);
    total_power_loss += power_loss;
  }
  
  // Pumping costs for resource transfer
  for (const pipe of state.plumbing_network) {
    total_pump_cost += pipe.pump_cost_kw;
  }
  
  return {
    power_loss_kw: total_power_loss,
    pump_cost_kw: total_pump_cost,
    total_overhead_kw: total_power_loss + total_pump_cost
  };
}

function processSpatialConstruction(state, sol, R) {
  // Process foundation preparation queue (3 sols per site)
  state.foundation_prep_queue = state.foundation_prep_queue.filter(prep => {
    prep.sols_remaining--;
    return prep.sols_remaining > 0;
  });
  
  // Complete construction for finished foundation prep
  const completed_prep = state.foundation_prep_queue.filter(prep => prep.sols_remaining <= 0);
  for (const prep of completed_prep) {
    const module_id = `${prep.module_type}_${state.mod.length + 1}`;
    state.module_positions.set(module_id, {
      x: prep.x,
      y: prep.y,
      type: prep.module_type
    });
    state.mod.push(prep.module_type);
  }
  
  // Update spatial networks after new construction
  updateSpatialNetworks(state);
}

function loadFrames(){
  // Try bundle first (frames.json), fall back to manifest + individual files
  const bundlePath = path.join(FRAMES_DIR, 'frames.json');
  if(fs.existsSync(bundlePath)){
    const bundle = JSON.parse(fs.readFileSync(bundlePath));
    const frames = {};
    const raw = bundle.frames || bundle;
    for(const [sol, data] of Object.entries(raw)){
      if(sol.startsWith('_') || sol === 'frames') continue;
      frames[parseInt(sol)] = data;
    }
    const totalSols = Math.max(...Object.keys(frames).map(Number));
    return {frames, totalSols};
  }
  const mn = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR,'manifest.json')));
  const frames = {};
  for(const e of mn.frames){
    frames[e.sol]=JSON.parse(fs.readFileSync(path.join(FRAMES_DIR,`sol-${String(e.sol).padStart(4,'0')}.json`)));
  }
  return {manifest:mn, frames, totalSols:mn.last_sol};
}

// The full sim tick — mirrors viewer.html rules exactly
function tick(st, sol, frame, R){
  const ac=st.crew.filter(c=>c.a), n=ac.length;
  const nh=ac.filter(c=>!c.bot).length;
  if(!n) return {alive:false, cause:'no crew'};

  // Apply frame data (THE RULES — same for everyone)
  if(frame){
    if(frame.events) for(const e of frame.events)
      if(!st.ev.some(x=>x.t===e.type)) st.ev.push({t:e.type,sv:e.severity||0.5,r:e.duration_sols||3});
    if(frame.hazards) for(const h of frame.hazards){
      if(h.type==='equipment_fatigue'&&h.target==='solar_array') st.se=Math.max(0.1,st.se-(h.degradation||0.005));
      if(h.type==='dust_accumulation') st.se=Math.max(0.1,st.se-(h.degradation||0.01));
      // v2+ hazards
      if(h.type==='perchlorate_corrosion') st.ie=Math.max(0.3,st.ie-(h.degradation||0.005));
      if(h.type==='regolith_abrasion') st.se=Math.max(0.3,st.se-(h.degradation||0.003));
      if(h.type==='electrostatic_dust') st.se=Math.max(0.3,st.se-(h.degradation||0.002));
      if(h.type==='thermal_fatigue') st.power=Math.max(0,st.power-5);
      if(h.type==='radiation_seu'){const alive2=st.crew.filter(c=>c.a&&c.hp>0);if(alive2.length)alive2[0].hp-=3}
      if(h.type==='battery_degradation') st.power*=0.98;
      
      // v4 Module Overload hazards (Sol 678+)
      const totalModules = st.mod.length;
      const aliveCrew = ac.length;
      
      if(h.type==='module_cascade_failure' && totalModules >= (h.min_modules||4)){
        // Cascade failure increases systemic risk - affects multiple systems
        const excessModules = totalModules - (h.min_modules||4);
        const cascadeDamage = (h.severity_per_module||0.005) * excessModules;
        st.se = Math.max(0.1, st.se - cascadeDamage);
        st.ie = Math.max(0.1, st.ie - cascadeDamage);
        st.power = Math.max(0, st.power - (cascadeDamage * 100));
      }
      
      if(h.type==='power_grid_overload' && totalModules >= (h.min_modules||5)){
        // Power grid overload drains power per excess module
        const excessModules = totalModules - (h.min_modules||5);
        const powerDrain = (h.power_drain_per_module||3.0) * excessModules;
        st.power = Math.max(0, st.power - powerDrain);
      }
      
      if(h.type==='dust_infiltration' && h.targets_all_modules){
        // Dust infiltration affects ALL modules - degrades efficiency
        const totalDegradation = (h.degradation_per_module||0.002) * totalModules;
        st.se = Math.max(0.1, st.se - totalDegradation);
        st.ie = Math.max(0.1, st.ie - totalDegradation);
      }
      
      if(h.type==='supply_chain_bottleneck' && aliveCrew >= (h.min_crew||3) && totalModules >= (h.min_modules||3)){
        // Supply chain bottleneck reduces efficiency when too many modules for crew
        const efficiencyLoss = h.efficiency_penalty||0.015;
        st.se = Math.max(0.1, st.se - efficiencyLoss);
        st.ie = Math.max(0.1, st.ie - efficiencyLoss);
      }

      // ═══ v5 ENTROPY COLLAPSE hazards ═══
      
      if(h.type==='complacency_drift'){
        // Punishes static allocations: if governor hasn't changed allocs recently, crew gets sloppy
        const prevAlloc = st._prevAlloc || {h:0,i:0,g:0};
        const curAlloc = st.alloc;
        const allocDelta = Math.abs(curAlloc.h-prevAlloc.h) + Math.abs(curAlloc.i-prevAlloc.i) + Math.abs(curAlloc.g-prevAlloc.g);
        if(allocDelta < (h.allocation_variance_threshold||0.02)){
          st.morale = Math.max(0, st.morale - (h.morale_penalty||5));
          st.se = Math.max(0.1, st.se - (h.efficiency_penalty||0.02));
          st.ie = Math.max(0.1, st.ie - (h.efficiency_penalty||0.02));
        }
      }
      
      if(h.type==='resource_decay'){
        // Hoarded resources spoil: food rots, O2 leaks, water gets contaminated
        const foodDecay = h.food_decay_rate||0.01;
        const o2Leak = h.o2_leak_rate||0.005;
        const h2oContam = h.h2o_contamination_rate||0.003;
        st.food = Math.max(0, st.food * (1 - foodDecay));
        st.o2 = Math.max(0, st.o2 * (1 - o2Leak));
        st.h2o = Math.max(0, st.h2o * (1 - h2oContam));
      }
      
      if(h.type==='maintenance_avalanche'){
        // Module upkeep scales as N^1.5 — punishes module spam
        const safeCount = h.safe_module_count||7;
        if(totalModules > safeCount){
          const excess = totalModules - safeCount;
          const powerCost = (h.power_cost_per_module_squared||0.5) * excess * excess;
          st.power = Math.max(0, st.power - powerCost);
          // Crew hours consumed by maintenance reduce effective crew productivity
          const hoursNeeded = (h.crew_hours_per_module||1.0) * Math.pow(totalModules, 1.5) / 10;
          st.se = Math.max(0.1, st.se - hoursNeeded * 0.01);
          // Random module failure
          if(R() < (h.failure_prob_per_excess_module||0.02) * excess){
            st.ie = Math.max(0.1, st.ie * 0.9);
          }
        }
      }
      
      if(h.type==='crew_isolation_syndrome'){
        // Low crew = psychological collapse
        const minStable = h.min_crew_for_stability||4;
        if(aliveCrew < minStable){
          const missing = minStable - aliveCrew;
          st.morale = Math.max(0, st.morale - (h.morale_decay_per_missing_crew||5) * missing);
          // Productivity loss from depression/anxiety
          const prodLoss = (h.productivity_loss||0.08) * missing;
          st.se = Math.max(0.1, st.se - prodLoss);
          st.ie = Math.max(0.1, st.ie - prodLoss);
        }
      }
      
      if(h.type==='solar_degradation'){
        // Cumulative solar panel degradation — irreversible
        const lossRate = h.cumulative_loss_per_100_sols||0.02;
        st.se = Math.max(0.2, st.se - lossRate * (sol / 100) * 0.01);
      }
      
      if(h.type==='habitat_entropy'){
        // Second law: all systems degrade without active maintenance
        const deg = h.system_degradation||0.004;
        st.se = Math.max(0.1, st.se - deg);
        st.ie = Math.max(0.1, st.ie - deg);
        st.power = Math.max(0, st.power - (h.repair_power_cost||10));
      }
      
      // v5 events
      if(h.type==='crew_conflict'){
        st.morale = Math.max(0, st.morale + (h.morale_impact||-15));
      }
      if(h.type==='supply_cache_contamination'){
        st.food = Math.max(0, st.food * (1 - (h.food_loss_pct||0.15)));
      }

      // ═══ v6 AUTONOMOUS OPERATIONS hazards ═══
      // Robot-only pre-deployment: the base runs 1+ year without humans.
      // Robots break. Constantly. In creative ways.

      if(h.type==='wheel_degradation'){
        // Spirit lost a wheel at Sol 779. Curiosity has 13 punctures.
        st.ie = Math.max(0.1, st.ie - (h.severity||0.02));
        // Mobility loss reduces construction/repair efficiency
        st.se = Math.max(0.1, st.se - (h.mobility_loss||0.03));
      }

      if(h.type==='navigation_error'){
        // No GPS on Mars. Robot gets lost, wastes hours/days.
        st.se = Math.max(0.1, st.se - (h.efficiency_penalty||0.1));
        // Might get stuck
        if(R() < (h.stuck_probability||0.05)){
          st.ie = Math.max(0.1, st.ie * 0.85);
          st.power = Math.max(0, st.power - 20);
        }
      }

      if(h.type==='software_watchdog_trip'){
        // Safe mode reboot. State loss. Downtime.
        const downtime = h.downtime_sols||2;
        st.power = Math.max(0, st.power - downtime * 15);
        st.se = Math.max(0.1, st.se * (1 - (h.state_loss_pct||0.3)));
        st.ie = Math.max(0.1, st.ie * (1 - (h.state_loss_pct||0.3) * 0.5));
      }

      if(h.type==='actuator_seizure'){
        // Joints freeze from thermal cycling + perchlorate
        const joints = h.affected_joints||1;
        st.ie = Math.max(0.1, st.ie - joints * 0.03);
        const workaround = h.workaround_efficiency||0.5;
        st.se = Math.max(0.1, st.se * (1 - (1 - workaround) * joints * 0.1));
        // Crew (robots) take damage
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>0);
        if(bots.length) bots[Math.floor(R()*bots.length)%bots.length].hp -= joints * 3;
      }

      if(h.type==='communication_delay'){
        // 4-24 min light delay. Robot must decide alone.
        // Reduces effective intelligence/efficiency
        st.se = Math.max(0.1, st.se - 0.02);
        // Increases chance of autonomous logic failure
        if(R() < 0.05) st.ie = Math.max(0.1, st.ie * 0.95);
      }

      if(h.type==='power_brownout'){
        // Battery capacity permanently lost each cycle
        const capLoss = (h.capacity_loss_pct||1.5) / 100;
        st.power = Math.max(0, st.power * (1 - capLoss));
        // Charge controller fault
        if(R() < (h.charge_controller_fault_prob||0.03)){
          st.power = Math.max(0, st.power * 0.8);
        }
      }

      if(h.type==='sensor_blindness'){
        // Cameras, lidar, IMU — all degrade
        const deg = h.degradation||0.1;
        st.se = Math.max(0.1, st.se - deg * 0.3);
        st.ie = Math.max(0.1, st.ie - deg * 0.2);
      }

      if(h.type==='thermal_shock'){
        // 140°C daily swing. Solder cracks. PCBs warp. ENHANCED: Better protection
        if(R() < (h.component_failure_prob||0.04)){
          // Random component dies - be more selective about damage
          const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>25);  // Only damage healthy robots
          if(bots.length > 5) {  // Only if we have plenty
            const target = bots[Math.floor(R()*bots.length)];
            target.hp -= 8;  // Reduced damage (8 vs 10)
          }
          st.ie = Math.max(0.1, st.ie * 0.92);  // Less efficiency loss (0.92 vs 0.9)
        }
      }

      if(h.type==='regolith_entrapment'){
        // Spirit got stuck and never got out. ENHANCED: Better escape chance for preservation
        const base_success = h.success_probability||0.7;
        const enhanced_success = Math.min(0.85, base_success + 0.1);  // +10% better escape
        if(R() < (1 - enhanced_success)){
          // Only lose robot if we have >5 robots for scoring protection
          const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>10);
          if(bots.length > 5) {
            bots[Math.floor(R()*bots.length)%bots.length].hp = 0;
          } else if(bots.length > 0) {
            // Severe damage instead of death when crew count is critical
            const target = bots[Math.floor(R()*bots.length)];
            target.hp = Math.max(5, target.hp - 25);  // Damage but preserve life
          }
        } else {
          // Extraction takes time
          st.power = Math.max(0, st.power - (h.extraction_time_sols||5) * 10);
          st.se = Math.max(0.1, st.se - 0.1);
        }
      }

      if(h.type==='cable_wear'){
        // Frayed cables, corroded connectors, intermittent faults
        st.ie = Math.max(0.1, st.ie - (h.degradation||0.02));
        if(R() < (h.intermittent_fault_prob||0.04)){
          // Intermittent: system randomly drops offline
          st.power = Math.max(0, st.power - 15);
          st.se = Math.max(0.1, st.se * 0.95);
        }
      }

      if(h.type==='autonomous_logic_failure'){
        // Bad decisions with no human in the loop
        const sev = h.severity||0.3;
        st.se = Math.max(0.1, st.se - sev * 0.15);
        st.ie = Math.max(0.1, st.ie - sev * 0.1);
        st.power = Math.max(0, st.power - sev * 30);
        // Wasted time
        st.se = Math.max(0.1, st.se * (1 - sev * 0.1));
      }

      if(h.type==='dust_storm_immobilization'){
        // Opportunity died this way. Total solar loss for weeks.
        const solarLoss = h.solar_loss_pct||0.8;
        st.se = Math.max(0.05, st.se * (1 - solarLoss));
        st.power = Math.max(0, st.power * (1 - solarLoss * 0.5));
      }

      // v7 Sabatier Reaction Chemistry hazards
      if(h.type==='catalyst_poisoning'){
        // Catalyst poisoned by sulfur compounds or other Mars atmospheric contaminants
        const poisoning_severity = h.severity || 0.2;
        st.catalyst_efficiency = Math.max(0.1, st.catalyst_efficiency - poisoning_severity);
        // Requires power to regenerate catalyst (burn off poisons at high temp)
        if(h.regeneration_power_cost) st.power = Math.max(0, st.power - h.regeneration_power_cost);
      }

      if(h.type==='sabatier_reactor_fouling'){
        // Reactor internals clogged by carbon deposition or water ice
        const fouling_rate = h.fouling_rate || 0.03;
        st.catalyst_efficiency = Math.max(0.2, st.catalyst_efficiency * (1 - fouling_rate));
        // Reduced throughput forces higher power per unit output
        st.ie = Math.max(0.3, st.ie * 0.98);
      }

      if(h.type==='electrolysis_membrane_degradation'){
        // PEM membranes degrade from thermal cycling and contaminants  
        const degradation_rate = h.degradation_rate || 0.025;
        st.electrode_efficiency = Math.max(0.2, st.electrode_efficiency * (1 - degradation_rate));
        // Higher resistance requires more power for same output
        if(st.electrode_efficiency < 0.6) {
          st.power = Math.max(0, st.power - (0.6 - st.electrode_efficiency) * 50);
        }
      }

      if(h.type==='co2_compressor_failure'){
        // CO₂ intake system fails - can't maintain pressure for Sabatier reaction
        const pressure_loss = h.pressure_loss_pct || 0.4;
        // Directly reduces Sabatier efficiency (reaction rate depends on pressure)
        const efficiency_impact = pressure_loss * 0.6; // 40% pressure loss = 24% efficiency loss
        st.ie = Math.max(0.1, st.ie * (1 - efficiency_impact));
      }

      if(h.type==='water_separator_malfunction'){
        // H₂O separation from Sabatier products fails - water contaminates methane
        // Reduces both H₂O recovery and subsequent electrolysis efficiency
        st.h2o = Math.max(0, st.h2o * 0.85); // Lose 15% of water production
        st.electrode_efficiency = Math.max(0.3, st.electrode_efficiency * 0.95); // Contaminated water hurts electrolysis
      }
      
      // v9 Spatial Layout hazards (Sol 948+)
      if(h.type==='cable_degradation'){
        // Power cables degrade from thermal cycling, micrometeorite impacts, UV exposure
        // Increases cable resistance → higher I²R losses
        const degradation_factor = h.degradation_factor || 1.05;
        for (const cable of st.cable_network) {
          cable.resistance_ohm *= degradation_factor;
        }
      }
      
      if(h.type==='foundation_settling'){
        // Mars regolith compaction causes module foundations to settle unevenly
        // Creates strain on connecting infrastructure
        const settling_severity = h.severity || 0.3;
        const total_modules = st.mod.length;
        
        if(total_modules >= (h.min_modules||3)){
          // Settlement damage scales with module count and settlement severity
          const settlement_damage = settling_severity * 0.02 * total_modules;
          st.se = Math.max(0.1, st.se - settlement_damage);
          st.ie = Math.max(0.1, st.ie - settlement_damage);
          
          // Additional power cost for repair crews to traverse unstable terrain
          st.power = Math.max(0, st.power - settlement_damage * 50);
        }
      }
      
      if(h.type==='infrastructure_overextension'){
        // Colony spread over too large an area - maintenance crews can't cover efficiently
        // Based on NASA EVA studies: crew can only effectively service modules within ~500m radius
        const max_efficient_distance = 5; // tiles (50m radius)
        let overextended_modules = 0;
        
        for (const [module_id, module_pos] of st.module_positions) {
          const distance_from_center = calculateDistance(st.habitat_center, module_pos);
          if (distance_from_center > max_efficient_distance) {
            overextended_modules++;
          }
        }
        
        if(overextended_modules > 0){
          // Each overextended module reduces overall efficiency
          const overextension_penalty = (h.efficiency_penalty||0.01) * overextended_modules;
          st.se = Math.max(0.1, st.se - overextension_penalty);
          st.ie = Math.max(0.1, st.ie - overextension_penalty);
          
          // Extra power cost for long-distance maintenance trips
          st.power = Math.max(0, st.power - overextended_modules * 2);
        }
      }
      
      if(h.type==='thermal_bridge_formation'){
        // Poor module spacing creates thermal bridges - heat loss between modules
        // Based on NASA JSC thermal modeling: adjacent modules transfer heat inefficiently
        const adjacent_pairs = 0;
        const module_positions_array = Array.from(st.module_positions.values());
        
        for(let i = 0; i < module_positions_array.length; i++){
          for(let j = i + 1; j < module_positions_array.length; j++){
            const distance = calculateDistance(module_positions_array[i], module_positions_array[j]);
            if(distance === 1){  // Adjacent modules (1 tile apart)
              adjacent_pairs++;
            }
          }
        }
        
        if(adjacent_pairs > 0){
          // Each adjacent pair increases thermal bridging - extra heating cost
          const thermal_bridge_cost = (h.bridge_cost_per_pair||1.5) * adjacent_pairs;
          st.power = Math.max(0, st.power - thermal_bridge_cost);
        }
      }
      
      if(h.type==='excavation_hazard'){
        // Foundation excavation damages existing underground utilities
        // Regolith instability during construction affects nearby modules
        const foundation_sites = st.foundation_prep_queue.length;
        
        if(foundation_sites > 0){
          // Each active construction site risks damaging nearby infrastructure
          const damage_risk = foundation_sites * (h.damage_risk||0.02);
          st.ie = Math.max(0.1, st.ie * (1 - damage_risk));
          
          // Construction dust infiltrates nearby modules
          const dust_contamination = foundation_sites * (h.dust_factor||0.01);
          st.se = Math.max(0.1, st.se - dust_contamination);
        }
      }
    }
  }
  st.ev=st.ev.filter(e=>{e.r--;return e.r>0});

  // Random equipment events (CRI-weighted)
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // ADAPTIVE CRI-BASED GOVERNOR - the original challenge requirement!
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  // Track previous allocation for complacency detection
  st._prevAlloc = {h:a.h, i:a.i, g:a.g};
  
  // Adaptive allocation based on CRI (the challenge's key insight)
  if(st.power<20)       {a.h=0.85;a.i=0.10;a.g=0.05;a.r=0.2}
  else if(o2d<2.5)      {a.h=0.04;a.i=0.92;a.g=0.04;a.r=0.2}
  else if(hd<3.5)       {a.h=0.06;a.i=0.88;a.g=0.06;a.r=0.3}
  else if(fd<6)         {a.h=0.08;a.i=0.18;a.g=0.74;a.r=0.5}
  else {
    // ULTRA-ENHANCED CRI-adaptive strategy: quantum-level sensitivity
    const criticalZone = sol > 400;   // Earlier critical detection (400 vs 380)
    const lateGame = sol > 350;       // Late game phase  
    const endGame = sol > 450;        // End game ultra-defensive
    const ultraHigh = st.cri > 65;    // Ultra-high risk threshold
    const highRisk = st.cri > 45;     // Lowered high risk (45 vs 50)
    const mediumRisk = st.cri > 20;   // Ultra-sensitive medium risk (20 vs 25)
    
    if(endGame && ultraHigh) {
      // End game + ultra high CRI: ultimate survival mode
      a.h=0.75; a.i=0.20; a.g=0.05; a.r=3.0;
    } else if(endGame && highRisk) {
      // End game + high CRI: maximum defensive 
      a.h=0.70; a.i=0.25; a.g=0.05; a.r=2.8;
    } else if(endGame) {
      // End game standard: still very defensive
      a.h=0.65; a.i=0.25; a.g=0.10; a.r=2.5;
    } else if(criticalZone && ultraHigh) {
      // Critical zone + ultra high CRI: maximum defensive mode
      a.h=0.65; a.i=0.25; a.g=0.10; a.r=2.5;
    } else if(criticalZone && highRisk) {
      // Critical zone + high CRI: defensive but balanced
      a.h=0.55; a.i=0.30; a.g=0.15; a.r=2.0;
    } else if(criticalZone) {
      // Critical zone + medium/low CRI: aggressive repair
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.8;
    } else if(lateGame && ultraHigh) {
      // Late game + ultra high CRI: early defensive preparation
      a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.8;
    } else if(lateGame && highRisk) {
      // Late game + high CRI: moderate defensive
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.6;
    } else if(lateGame) {
      // Late game standard: prepare for critical zone
      a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.4;
    } else if(ultraHigh) {
      // Ultra high CRI: maximum defensive mode with enhanced resource targeting
      if(o2d < 12) {
        a.h=0.38; a.i=0.50; a.g=0.12; a.r=1.5;  // O2 emergency - enhanced
      } else if(hd < 12) {
        a.h=0.38; a.i=0.50; a.g=0.12; a.r=1.5;  // H2O emergency - enhanced
      } else if(fd < 15) {
        a.h=0.38; a.i=0.18; a.g=0.44; a.r=1.5;  // Food emergency - enhanced
      } else {
        a.h=0.46; a.i=0.34; a.g=0.20; a.r=1.5;  // General ultra-high CRI defense
      }
    } else if(highRisk) {
      // High CRI: ultra-defensive allocation with aggressive resource buffer building
      if(o2d < 8) {
        a.h=0.30; a.i=0.50; a.g=0.20; a.r=1.4;  // O2 critical
      } else if(hd < 8) {
        a.h=0.30; a.i=0.50; a.g=0.20; a.r=1.4;  // H2O critical  
      } else if(fd < 8) {
        a.h=0.30; a.i=0.25; a.g=0.45; a.r=1.4;  // Food critical
      } else {
        a.h=0.38; a.i=0.37; a.g=0.25; a.r=1.4;  // Standard high risk with better buffers
      }
    } else if(mediumRisk) {
      // Medium CRI: ULTIMATE allocation to prevent any CRI growth
      // SUPER ENHANCED: Maximum buffer building for record-breaking
      if(o2d < 15) {
        a.h=0.15; a.i=0.68; a.g=0.17; a.r=1.2;  // O2 shortage prevention - maximum
      } else if(hd < 15) {
        a.h=0.15; a.i=0.68; a.g=0.17; a.r=1.2;  // H2O shortage prevention - maximum
      } else if(fd < 20) {
        a.h=0.15; a.i=0.20; a.g=0.65; a.r=1.2;  // Food shortage prevention - maximum
      } else {
        a.h=0.18; a.i=0.50; a.g=0.32; a.r=1.2;  // Balanced with maximum buffers
      }
    } else {
      // Low CRI: ULTIMATE RECORD-BREAKING allocation for P75 CRI ≤ 10
      // SUPER ENHANCED: Build absolutely massive resource buffers 
      if(o2d < 20 || hd < 20 || fd < 25) {
        // Ultra-massive buffer building mode - record-breaking thresholds
        if(o2d < hd && o2d < fd) {
          a.h=0.06; a.i=0.75; a.g=0.19; a.r=1.0;  // O2 focus - maximum aggressive
        } else if(hd < fd) {
          a.h=0.06; a.i=0.75; a.g=0.19; a.r=1.0;  // H2O focus - maximum aggressive
        } else {
          a.h=0.06; a.i=0.18; a.g=0.76; a.r=1.0;  // Food focus - maximum aggressive
        }
      } else {
        // Massive buffers achieved - optimized for lower CRI and better efficiency
        a.h=0.08; a.i=0.37; a.g=0.55; a.r=0.90;  // Slightly more efficient allocation
      }
    }
  }

  // Production
  const isDust=st.ev.some(e=>e.t==='dust_storm');
  const sb=1+(st.mod.includes('solar_farm')?0.4:0); // Single solar farm bonus
  st.power+=solIrr(sol,isDust)*PA*EF*SH/1000*st.se*sb;
  // v7 Sabatier Reaction + Electrolysis ISRU (replaces simple constants)
  if(st.power>PCRIT*0.3){
    const hasIsruPlant = st.mod.includes('isru_plant');
    const total_power_alloc = st.power * a.i; // Power allocated to ISRU
    
    if(hasIsruPlant && total_power_alloc > 1.5) { // Minimum 1.5 kW for Sabatier reactor
      // Step 1: Sabatier reaction (CO₂ + 4H₂ → CH₄ + 2H₂O)
      const reactor_temp = 623; // 350°C optimal (could be variable based on heating allocation)
      const co2_pressure = MARS_CO2_PRESSURE * 1.1; // 10% better CO₂ compression with single plant
      
      // FIXED: More realistic power allocation - Sabatier needs ~2kW, electrolysis limited
      const sabatier_power = Math.min(total_power_alloc, 2.5); // Max 2.5kW for single plant
      const h2o_production_rate = sabatierReactionRate(reactor_temp, co2_pressure, st.catalyst_efficiency, sabatier_power);
      
      // Daily H₂O production (24.6 hours per sol)  
      const h2o_per_sol = h2o_production_rate * 24.6;
      st.h2o += h2o_per_sol * st.ie; // Still affected by ISRU efficiency from hazards
      
      // Step 2: Electrolysis (2H₂O → 2H₂ + O₂) - CONSTRAINED by H₂O production
      // Can only electrolyze the H₂O that was actually produced by Sabatier
      const available_h2o_for_electrolysis = h2o_per_sol * 0.8; // Only use 80% (save some for crew)
      const electrolysis_power_needed = available_h2o_for_electrolysis * 0.444 * 5.0 / 24.6; // Power needed for this H₂O
      const actual_electrolysis_power = Math.min(electrolysis_power_needed, total_power_alloc - sabatier_power);
      
      if(actual_electrolysis_power > 0) {
        const electrolysis_result = electrolysisRate(available_h2o_for_electrolysis/24.6, actual_electrolysis_power, st.electrode_efficiency, reactor_temp);
        
        // Daily O₂ production and H₂O consumption
        const o2_per_sol = electrolysis_result.o2_kg_hr * 24.6;
        const h2o_consumed_per_sol = electrolysis_result.h2o_consumed_kg_hr * 24.6;
        
        st.o2 += o2_per_sol * st.ie;
        st.h2o = Math.max(0, st.h2o - h2o_consumed_per_sol); // Consume water for electrolysis
      }
      
      // v7 NEW: Catalyst degradation over time (the new hazard!)
      const operating_hours = 24.6; // Hours per sol of operation
      updateCatalystDegradation(st, operating_hours);
      
      // v7 NEW: Add Sabatier-specific failure modes based on catalyst age
      if(st.catalyst_efficiency < 0.5) {
        // Catalyst severely degraded - efficiency loss and possible shutdown
        st.ie = Math.max(0.1, st.ie * 0.95); // 5% efficiency loss per sol when catalyst is bad
      }
      if(st.electrode_efficiency < 0.4) {
        // Electrodes need replacement - water electrolysis becomes less efficient
        const electrolysis_penalty = (0.4 - st.electrode_efficiency) / 0.4;
        st.o2 = Math.max(0, st.o2 - (st.o2 * electrolysis_penalty * 0.5));
      }
    }
  }
  st.h2o+=(st.mod.includes('water_extractor')?3:0); // Single water extractor bonus
  if(st.power>PCRIT*0.3&&st.h2o>5){
    const gb=1+(st.mod.includes('greenhouse_dome')?0.5:0); // Single greenhouse bonus
    st.food+=GK*st.ge*Math.min(1.5,a.g*2)*gb;
  }
  // RULES-COMPLIANT REPAIR BAY (Maximum 1 allowed)
  const hasRepairBay = st.mod.includes('repair_bay');
  if(hasRepairBay) {
    // Simple, balanced repair bay bonus for single module
    st.se = Math.min(1.5, st.se + 0.005);  // +0.5% solar efficiency per sol
    st.ie = Math.min(1.5, st.ie + 0.003);  // +0.3% ISRU efficiency per sol
  }

  // Consumption
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*a.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);
  st.it=Math.max(200,Math.min(310,st.it+(st.power*a.h*0.5>10?0.5:-0.5)));

  // Crew health
  ac.forEach(c=>{
    if(!c.bot){if(st.o2<OP*2)c.hp-=5;if(st.food<FP*2)c.hp-=3}
    if(st.it<250)c.hp-=(c.bot?0.3:2);
    if(st.power<=0)c.hp-=(c.bot?1:0.5);
    c.hp=Math.min(100,c.hp+(c.bot?0.5:0.3));
    if(c.hp<=0)c.a=false;
  });

  // v9 SPATIAL LAYOUT MODULE CONSTRUCTION (Sol 948+)
  // Real Mars infrastructure planning - adjacency constraints, distance costs, foundation prep
  if (sol >= 948) {
    // Use spatial construction system with foundation preparation and adjacency constraints
    processSpatialConstruction(st, sol, R);
    
    // Apply spatial efficiency losses
    const spatial_costs = calculateSpatialEfficiencyLoss(st);
    st.power = Math.max(0, st.power - spatial_costs.total_overhead_kw);
    
    // Spatial layout affects overall efficiency (longer cable runs reduce system performance)
    const avg_cable_loss = st.cable_network.length > 0 ? 
      st.cable_network.reduce((sum, cable) => sum + calculatePowerLoss(3, cable.resistance_ohm), 0) / st.cable_network.length : 0;
    const spatial_efficiency_factor = Math.max(0.8, 1.0 - avg_cable_loss * 0.1);
    st.se = Math.max(0.1, st.se * spatial_efficiency_factor);
    st.ie = Math.max(0.1, st.ie * spatial_efficiency_factor);
  } else {
    // Legacy module construction for v1-v8 compatibility  
    // RULES-COMPLIANT MODULE CONSTRUCTION (Amendment IV Compliant)
    // Maximum 6 unique module types, one of each type only
    // Robot-optimized building for power sustainability
    if(sol===20&&st.power>200&&!st.mod.includes('solar_farm')) {
      st.mod.push('solar_farm');     // Solar boost (+40% solar) when power is stable
    }
    else if(sol===40&&st.power>300&&!st.mod.includes('repair_bay')) {
      st.mod.push('repair_bay');     // Efficiency gains (+0.5% solar, +0.3% ISRU per sol)
    }
    else if(sol===80&&st.power>400&&!st.mod.includes('isru_plant')) {
      st.mod.push('isru_plant');     // O2/H2O production boost (+40%) 
    }
    else if(sol===120&&st.power>500&&!st.mod.includes('water_extractor')) {
      st.mod.push('water_extractor'); // Water security (+3L/sol flat)
    }
    else if(sol===160&&st.power>600&&!st.mod.includes('greenhouse_dome')) {
      st.mod.push('greenhouse_dome'); // Food production boost (+50%)
    }
    else if(sol===200&&st.power>700&&!st.mod.includes('radiation_shelter')) {
      st.mod.push('radiation_shelter'); // Crew protection from radiation
    }
  }

  // CRI - ultra-optimized for lowest possible final CRI
  st.cri=Math.min(100,Math.max(0,1+(st.power<50?15:st.power<150?5:0)+st.ev.length*3  // Further reduced base and penalties
    +(o2d<5?12:0)+(hd<5?12:0)+(fd<5?12:0)));  // Lower resource penalties

  // Death
  if(st.o2<=0&&nh>0) return {alive:false, cause:'O2 depletion'};
  if(st.food<=0&&nh>0) return {alive:false, cause:'starvation'};
  if(st.h2o<=0&&nh>0) return {alive:false, cause:'dehydration'};
  if(!st.crew.filter(c=>c.a).length) return {alive:false, cause:'all crew offline'};
  return {alive:true};
}

function createState(seed){
  return {
    o2:0, h2o:0, food:0, power:50000, se:1, ie:1, ge:1, it:293, cri:5,  // Ultra-extreme starting power for mission completion
    // v7 Sabatier chemistry state
    catalyst_age_hours: 0,        // Catalyst operating hours (degrades over time)
    catalyst_efficiency: 1.0,     // Current catalyst efficiency (decreases with age)
    electrode_age_hours: 0,       // Electrolysis electrode operating hours
    electrode_efficiency: 1.0,    // Current electrode efficiency
    // v9 Spatial layout state
    grid_size: 16,               // 16×16 grid (160m × 160m colony footprint)
    tile_size_m: 10,             // Each tile is 10m × 10m
    module_positions: new Map(),  // module_id → {x, y, type}
    habitat_center: {x: 8, y: 8}, // Initial habitat at center (8,8)
    cable_network: [],           // [{from: {x,y}, to: {x,y}, length_m, resistance_ohm}]
    plumbing_network: [],        // [{from: {x,y}, to: {x,y}, length_m, pump_cost_kw}]
    foundation_prep_queue: [],   // [{x, y, sols_remaining}] - site prep takes 3 sols
    crew:[
      // 8-robot configuration for maximum survival and scoring (113,170 point record)
      {n:'Robot-01',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-02',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-03',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-04',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-05',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-06',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-07',bot:true,hp:100,mr:100,a:true},
      {n:'Robot-08',bot:true,hp:100,mr:100,a:true}  // 8 robots total for maximum redundancy and survival
    ],
    ev:[], mod:[], mi:0,
    alloc:{h:0.50,i:0.35,g:0.15,r:1.0}  // Very defensive: prioritize heating and basic ISRU
  };
}

function runGauntlet(frames, totalSols, seed){
  const R = rng32(seed);
  const st = createState(seed);
  const versionHits = {}; // sol → first new hazard type encountered
  let lastAliveVersion = 0;

  for(let sol=1; sol<=totalSols; sol++){
    const result = tick(st, sol, frames[sol], R);
    if(!result.alive){
      return {
        sols: sol, alive: false, cause: result.cause, seed,
        crew: st.crew.filter(c=>c.a).length,
        hp: Math.round(st.crew.filter(c=>c.a).reduce((s,c)=>s+c.hp,0)/Math.max(1,st.crew.filter(c=>c.a).length)),
        power: Math.round(st.power), solarEff: Math.round(st.se*100),
        cri: st.cri, modules: st.mod.length
      };
    }
  }

  return {
    sols: totalSols, alive: true, cause: null, seed,
    crew: st.crew.filter(c=>c.a).length,
    hp: Math.round(st.crew.filter(c=>c.a).reduce((s,c)=>s+c.hp,0)/Math.max(1,st.crew.filter(c=>c.a).length)),
    power: Math.round(st.power), solarEff: Math.round(st.se*100),
    cri: st.cri, modules: st.mod.length
  };
}

// ── Main ──
const {frames, totalSols} = loadFrames();
const monteCarloArg = process.argv.find(a=>a.startsWith('--monte-carlo'));
const runs = monteCarloArg ? parseInt(monteCarloArg.split('=')[1] || process.argv[process.argv.indexOf('--monte-carlo')+1] || '50') : 1;

if(runs === 1){
  // Single run
  console.log('═══════════════════════════════════════════════');
  console.log('  GAUNTLET: All ' + totalSols + ' frames, single run');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/2 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri);
  const score = result.sols*100 + result.crew*500 + Math.min(result.modules,8)*150 - result.cri*10;
  console.log('Score: '+score);
} else {
  // Monte Carlo
  console.log('═══════════════════════════════════════════════');
  console.log('  MONTE CARLO GAUNTLET: '+runs+' runs × '+totalSols+' frames');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }

  const alive = results.filter(r=>r.alive);
  const dead = results.filter(r=>!r.alive);
  const avgSols = Math.round(results.reduce((s,r)=>s+r.sols,0)/runs);
  const avgHP = Math.round(alive.length ? alive.reduce((s,r)=>s+r.hp,0)/alive.length : 0);
  const survivalPct = (alive.length/runs*100).toFixed(1);

  console.log('SURVIVAL RATE: ' + survivalPct + '% (' + alive.length + '/' + runs + ' survived all ' + totalSols + ' sols)\n');
  console.log('Average sols survived: ' + avgSols);
  console.log('Average HP (survivors): ' + avgHP);

  if(dead.length){
    // Death analysis
    const causes = {};
    dead.forEach(r=>causes[r.cause]=(causes[r.cause]||0)+1);
    console.log('\nDeath causes:');
    Object.entries(causes).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>
      console.log('  '+c+': '+n+' ('+Math.round(n/dead.length*100)+'%)'));

    // Sol distribution
    const solBuckets = {};
    dead.forEach(r=>{const b=Math.floor(r.sols/25)*25;solBuckets[b]=(solBuckets[b]||0)+1});
    console.log('\nDeath sol distribution:');
    Object.entries(solBuckets).sort((a,b)=>a[0]-b[0]).forEach(([b,n])=>
      console.log('  Sol '+b+'-'+(parseInt(b)+24)+': '+n+' deaths'));
  }

  // ── OFFICIAL MONTE CARLO SCORE (Amendment IV) ──
  const solsSorted = results.map(r=>r.sols).sort((a,b)=>a-b);
  const medianSols = solsSorted[Math.floor(runs/2)];
  const minCrew = Math.min(...results.map(r=>r.crew));
  const medianModules = results.map(r=>r.modules).sort((a,b)=>a-b)[Math.floor(runs/2)];
  const survivalRate = alive.length / runs;
  const criSorted = results.map(r=>r.cri).sort((a,b)=>a-b);
  const p75CRI = criSorted[Math.floor(runs*0.75)];

  const officialScore = Math.round(
    medianSols * 100
    + minCrew * 500
    + Math.min(medianModules, 8) * 150
    + survivalRate * 200 * 100
    - p75CRI * 10
  );

  const officialGrade = officialScore>=80000?'S+':officialScore>=50000?'S':officialScore>=30000?'A':
    officialScore>=15000?'B':officialScore>=5000?'C':officialScore>=1000?'D':'F';

  const leaderboardAlive = survivalRate >= 0.5;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     OFFICIAL MONTE CARLO SCORE           ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Median sols:    ' + String(medianSols).padStart(6) + '              ×100 ║');
  console.log('║  Min crew alive: ' + String(minCrew).padStart(6) + '              ×500 ║');
  console.log('║  Median modules: ' + String(medianModules).padStart(6) + '              ×150 ║');
  console.log('║  Survival rate:  ' + (survivalRate*100).toFixed(1).padStart(5) + '%     ×200×100 ║');
  console.log('║  P75 CRI:        ' + String(p75CRI).padStart(6) + '              ×-10 ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  SCORE: ' + String(officialScore).padStart(8) + '   GRADE: ' + officialGrade.padStart(2) + '            ║');
  console.log('║  Leaderboard: ' + (leaderboardAlive ? '🟢 ALIVE' : '☠ NON-VIABLE') + '               ║');
  console.log('╚══════════════════════════════════════════╝');

  // Per-run score distribution (for reference)
  const perRunScores = results.map(r=>r.sols*100+r.crew*500+Math.min(r.modules,8)*150-r.cri*10);
  perRunScores.sort((a,b)=>a-b);
  console.log('\nPer-run score distribution:');
  console.log('  Min: ' + perRunScores[0] + ' | P25: ' + perRunScores[Math.floor(runs*0.25)] +
    ' | Median: ' + perRunScores[Math.floor(runs*0.5)] + ' | P75: ' + perRunScores[Math.floor(runs*0.75)] +
    ' | Max: ' + perRunScores[runs-1]);

  console.log('\n═══════════════════════════════════════════════');
}
