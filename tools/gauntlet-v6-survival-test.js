#!/usr/bin/env node
/**
 * EIGHT ROBOT ULTIMATE GAUNTLET — Target 6+ Robot Survival for 115,000+ Points
 * 
 * Strategy: Start with 8 robots, ultra-aggressive survival optimization
 * Goal: min_crew_alive 5 → 6+ = +500-1500 points (113,170 → 114,670+)
 * Innovation: Zero robot death tolerance + CRI optimization
 * 
 * Based on: tools/gauntlet.js
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

// v8 Heat Transfer Model Constants (NASA thermal studies)
const STEFAN_BOLTZMANN = 5.67e-8;    // W/m²K⁴ - Stefan-Boltzmann constant
const HABITAT_SURFACE_AREA = 150;    // m² - typical habitat surface area (NASA studies)
const AEROGEL_U_VALUE = 0.11;        // W/m²K - aerogel insulation U-value (R-10.3/inch)
const CREW_METABOLIC_HEAT = 100;     // W per human - NASA metabolic studies  
const EQUIPMENT_HEAT_BASE = 5;       // W per kW of equipment power
const MARS_TEMP_DAY = 278;           // K (+5°C) - Mars daytime surface temp
const MARS_TEMP_NIGHT = 183;         // K (-90°C) - Mars nighttime surface temp
const HABITAT_THERMAL_MASS = 8000;   // kg - equivalent thermal mass (walls + air + equipment)
const SPECIFIC_HEAT_CAPACITY = 1000; // J/kg·K - average specific heat of habitat materials
const INSULATION_DEGRADATION_RATE = 0.0001; // per sol - gradual loss of insulating properties

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
  state.electrode_efficiency = Math.max(0.3, 1.0 - (state.electrode_age_hours / 70000));
}

// v8 Heat Transfer Model Functions (NASA thermal physics)
function calculateExteriorTemp(sol, hour_of_sol) {
  // Mars diurnal temperature cycle: sinusoidal variation from day to night
  // Peak at local noon (hour 12.3), minimum just before dawn (hour 0)
  const thermal_phase = (hour_of_sol / 24.6) * 2 * Math.PI;
  const temp_amplitude = (MARS_TEMP_DAY - MARS_TEMP_NIGHT) / 2;
  const temp_average = (MARS_TEMP_DAY + MARS_TEMP_NIGHT) / 2;
  
  // Seasonal variation (Mars year = 669 sols)
  const seasonal_phase = (sol % 669 / 669) * 2 * Math.PI;
  const seasonal_amplitude = 15; // K seasonal variation
  
  return temp_average + temp_amplitude * Math.sin(thermal_phase - Math.PI/2) + 
         seasonal_amplitude * Math.sin(seasonal_phase);
}

function calculateHeatTransfer(interior_temp, exterior_temp, habitat_surface_area, u_value, insulation_efficiency) {
  // Q = U × A × ΔT (conduction through walls)
  const actual_u_value = u_value / insulation_efficiency; // Degraded insulation has higher U-value
  const conductive_loss = actual_u_value * habitat_surface_area * (interior_temp - exterior_temp);
  
  // Q = ε × σ × A × (T⁴ᵢₙ - T⁴ₒᵤₜ) (radiative loss)
  const emissivity = 0.95; // Mars habitat emissivity
  const radiative_loss = emissivity * STEFAN_BOLTZMANN * habitat_surface_area * 
                        (Math.pow(interior_temp, 4) - Math.pow(exterior_temp, 4));
  
  return conductive_loss + radiative_loss; // W (positive = heat loss)
}

function calculateInternalHeatGains(crew_count, humans_count, equipment_power_kw) {
  // Crew metabolic heat (~100W/person for humans, minimal for robots)
  const metabolic_heat = humans_count * CREW_METABOLIC_HEAT;
  
  // Equipment waste heat (5W per kW of equipment power)
  const equipment_heat = equipment_power_kw * EQUIPMENT_HEAT_BASE;
  
  return metabolic_heat + equipment_heat; // W
}

function updateHabitatTemperature(state, sol, heating_power_w, exterior_temp) {
  // Heat balance: gains - losses = change in thermal energy
  const humans_count = state.crew.filter(c => c.a && !c.bot).length;
  const total_crew = state.crew.filter(c => c.a).length;
  
  // Internal heat gains
  const internal_gains = calculateInternalHeatGains(total_crew, humans_count, state.power);
  
  // Heat losses through habitat envelope
  const heat_loss = calculateHeatTransfer(
    state.interior_temp || 293, // Default to 20°C if not initialized
    exterior_temp,
    HABITAT_SURFACE_AREA,
    AEROGEL_U_VALUE,
    state.insulation_efficiency || 1.0
  );
  
  // Net heat flow (positive = warming)
  const net_heat_flow = internal_gains + heating_power_w - heat_loss;
  
  // Temperature change: ΔT = Q / (m × Cp)
  const temp_change_per_hour = net_heat_flow / (HABITAT_THERMAL_MASS * SPECIFIC_HEAT_CAPACITY) * 3600;
  
  // Update temperature (average over 24.6 hour sol)
  const new_temp = (state.interior_temp || 293) + temp_change_per_hour;
  
  // Practical limits (systems shut down below 200K, overheat above 350K)
  state.interior_temp = Math.max(200, Math.min(350, new_temp));
  
  return { 
    heat_loss_w: heat_loss,
    internal_gains_w: internal_gains,
    heating_required_w: Math.max(0, heat_loss - internal_gains),
    temp_change_k: temp_change_per_hour
  };
}

function loadFrames(){
  const versions = JSON.parse(fs.readFileSync(VERSIONS_PATH, 'utf8'));
  const mn = {frames: [], last_sol: 0};
  const frames = [];

  for(const v of versions.versions) {
    if(!v.active) continue;
    
    const versionDir = path.join(FRAMES_DIR, `v${v.version_number}`);
    if(!fs.existsSync(versionDir)) continue;
    
    const files = fs.readdirSync(versionDir)
      .filter(f => f.endsWith('.json') && f.startsWith('frame_'))
      .sort((a, b) => {
        const solA = parseInt(a.match(/frame_(\d+)/)[1]);
        const solB = parseInt(b.match(/frame_(\d+)/)[1]);
        return solA - solB;
      });

    for(const file of files) {
      try {
        const frame = JSON.parse(fs.readFileSync(path.join(versionDir, file), 'utf8'));
        if(frame && frame.sol) {
          frames.push(frame);
          mn.last_sol = Math.max(mn.last_sol, frame.sol);
        }
      } catch(e) {
        console.warn(`Skipping invalid frame: ${file}`);
      }
    }
  }

  frames.sort((a, b) => a.sol - b.sol);
  mn.frames = frames.map(f => ({ sol: f.sol, file: `frame_${f.sol}.json` }));
  
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
        const cascade_impact = Math.min(0.15, totalModules * 0.015); // 1.5% per module, max 15%
        st.se = Math.max(0.2, st.se * (1 - cascade_impact)); // Solar efficiency hit
        st.ie = Math.max(0.2, st.ie * (1 - cascade_impact)); // ISRU efficiency hit  
        st.power = Math.max(0, st.power * (1 - cascade_impact * 0.5)); // Power hit
      }

      if(h.type==='power_grid_overload' && st.power > 200 && totalModules >= (h.min_modules||5)){
        // High power + many modules = grid instability
        const overload_factor = Math.min(3.0, (st.power / 200) * (totalModules / 5));
        const power_loss = h.power_loss_kw || (10 + overload_factor * 5);
        st.power = Math.max(0, st.power - power_loss);
      }

      if(h.type==='dust_infiltration_cascade' && totalModules >= (h.min_modules||3)){
        // More modules = more seals = more infiltration points
        const infiltration_rate = Math.min(0.08, totalModules * 0.012); // 1.2% per module
        st.se = Math.max(0.3, st.se * (1 - infiltration_rate));
        st.ie = Math.max(0.3, st.ie * (1 - infiltration_rate));
      }

      // v5 Entropy Collapse hazards (Sol 728+)
      if(h.type==='complacency_drift'){
        // Static allocations cause efficiency loss
        const prev = st._prevAlloc;
        if(prev && Math.abs(st.alloc.h - prev.h) < 0.05 && Math.abs(st.alloc.i - prev.i) < 0.05 && Math.abs(st.alloc.g - prev.g) < 0.05){
          // Allocation hasn't changed much - complacency penalty
          const drift_rate = h.drift_rate || 0.008; // 0.8% efficiency loss per sol of stagnation
          st.se = Math.max(0.4, st.se * (1 - drift_rate));
          st.ie = Math.max(0.4, st.ie * (1 - drift_rate));
          st.ge = Math.max(0.4, st.ge * (1 - drift_rate));
        }
      }

      if(h.type==='resource_decay'){
        // Hoarded resources degrade over time
        const decay_rate = h.decay_rate || 0.005; // 0.5% per sol
        if(st.o2 > OP * nh * 30) st.o2 *= (1 - decay_rate); // O2 leakage from tanks
        if(st.h2o > HP * nh * 30) st.h2o *= (1 - decay_rate); // H2O contamination
        if(st.food > FP * nh * 30) st.food *= (1 - decay_rate); // Food spoilage
      }

      if(h.type==='maintenance_avalanche' && totalModules >= (h.min_modules||4)){
        // Maintenance scales as N^1.5 (ISS data) - more modules = exponentially more work
        const maintenance_burden = Math.pow(totalModules, 1.5) / Math.pow(4, 1.5); // Normalized to 4 modules baseline
        const crew_efficiency = Math.max(0.1, 1.0 / maintenance_burden); // Crew spread thin
        st.se *= crew_efficiency;
        st.ie *= crew_efficiency;
        st.ge *= crew_efficiency;
      }

      if(h.type==='crew_isolation_syndrome' && aliveCrew < (h.min_crew_threshold||4)){
        // Low crew = psychological collapse
        const isolation_factor = Math.max(0.5, aliveCrew / (h.min_crew_threshold||4));
        // Affects all crew members
        st.crew.forEach(member => {
          if(member.a && member.hp > 0){
            member.hp = Math.max(10, member.hp * isolation_factor); // Morale and health decline
          }
        });
      }

      if(h.type==='solar_panel_degradation'){
        // Cumulative, irreversible efficiency loss (Spirit/Opportunity data)
        const degradation_rate = h.degradation_rate || 0.0025; // 0.25% per sol
        st.se = Math.max(0.2, st.se * (1 - degradation_rate)); // Permanent loss
      }

      if(h.type==='habitat_entropy'){
        // All systems degrade without maintenance
        const entropy_rate = h.entropy_rate || 0.002; // 0.2% per sol
        if(st.alloc.r < 1.0){ // Not enough repair allocation
          const repair_deficit = 1.0 - st.alloc.r;
          const actual_entropy = entropy_rate * (1 + repair_deficit * 2); // Worse with low repair
          st.se = Math.max(0.3, st.se * (1 - actual_entropy));
          st.ie = Math.max(0.3, st.ie * (1 - actual_entropy));
          st.ge = Math.max(0.3, st.ge * (1 - actual_entropy));
        }
      }

      // v6 Autonomous Operations hazards (Sol 778+) - 11 different failure modes
      if(h.type==='wheel_degradation'){
        // Spirit lost a wheel at Sol 779 - cumulative wear on robot mobility
        const degradation = h.degradation_rate || 0.003; // 0.3% per sol
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>0);
        if(bots.length > 0) {
          // Random robot takes mobility hit
          const bot = bots[Math.floor(R() * bots.length)];
          bot.hp -= degradation * 20; // Mobility issues affect overall functionality
        }
      }

      if(h.type==='navigation_error'){
        // No GPS on Mars - dead reckoning errors waste time and energy
        const error_severity = h.severity || 0.4;
        st.power = Math.max(0, st.power - error_severity * 8); // Wasted energy from backtracking
        st.ie = Math.max(0.2, st.ie * (1 - error_severity * 0.1)); // Lost productivity
      }

      if(h.type==='software_watchdog_trip'){
        // Perseverance had 4 safe mode reboots in year 1 - state loss
        const reboot_impact = h.impact || 0.15;
        // Temporary efficiency loss while systems restart
        st.se = Math.max(0.3, st.se * (1 - reboot_impact));
        st.ie = Math.max(0.3, st.ie * (1 - reboot_impact));
        st.ge = Math.max(0.3, st.ge * (1 - reboot_impact));
      }

      if(h.type==='actuator_seizure'){
        // -120°C to +20°C daily - joints freeze, perchlorate infiltrates
        const seizure_rate = h.seizure_rate || 0.025;
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>0);
        if(bots.length > 0) {
          bots.forEach(bot => bot.hp -= seizure_rate * 15); // Joint problems
        }
      }

      if(h.type==='power_brownout'){
        // Battery capacity loss in cold - charge controllers glitch from radiation
        const brownout_loss = h.power_loss || 12;
        st.power = Math.max(0, st.power - brownout_loss);
      }

      if(h.type==='sensor_blindness'){
        // Dust on cameras, UV-degraded lidar, IMU drift
        const blindness_impact = h.impact || 0.08;
        st.ie = Math.max(0.2, st.ie * (1 - blindness_impact)); // Can't see what you're doing
        st.se = Math.max(0.2, st.se * (1 - blindness_impact)); // Can't clean panels properly
      }

      if(h.type==='thermal_shock'){
        // 140°C daily swing cracks solder, warps PCBs
        const shock_damage = h.damage || 0.012;
        st.crew.filter(c=>c.a&&c.bot).forEach(bot => bot.hp -= shock_damage * 25);
      }

      if(h.type==='regolith_entrapment'){
        // Spirit got stuck at Sol 1892 - one wrong turn = permanent loss
        const entrapment_chance = h.chance || 0.002; // 0.2% chance per sol
        if(R() < entrapment_chance) {
          const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>0);
          if(bots.length > 0) {
            const unluckyBot = bots[Math.floor(R() * bots.length)];
            unluckyBot.hp = Math.max(0, unluckyBot.hp - 40); // Major mobility loss
          }
        }
      }

      if(h.type==='cable_wear'){
        // Repeated motion frays cables - perchlorate corrodes connectors
        const wear_rate = h.wear_rate || 0.004;
        st.power = Math.max(0, st.power * (1 - wear_rate)); // Intermittent power faults
      }

      if(h.type==='autonomous_logic_failure'){
        // No human in loop - robot makes bad decisions
        const failure_impact = h.impact || 0.06;
        if(R() < 0.015) { // 1.5% chance of logic failure per sol
          st.ie = Math.max(0.1, st.ie * (1 - failure_impact * 2)); // Bad automation decisions
        }
      }

      if(h.type==='dust_storm_immobilization'){
        // Opportunity died after 14 years - global dust storms drop solar 60-95%
        if(frame.weather && frame.weather.dust_storm_global) {
          const storm_severity = frame.weather.dust_severity || 0.8;
          st.se = Math.max(0.05, st.se * (1 - storm_severity)); // Massive solar loss
          // Robots can't move or work effectively in global dust storms
          st.ie = Math.max(0.1, st.ie * (1 - storm_severity * 0.6));
        }
      }

      // v7 Sabatier Chemistry hazards (Sol 848+)
      if(h.type==='catalyst_poisoning'){
        // CO impurities, sulfur compounds poison Ni/Ru catalysts
        const poisoning_rate = h.poisoning_rate || 0.008;
        st.catalyst_efficiency = Math.max(0.1, st.catalyst_efficiency * (1 - poisoning_rate));
      }

      if(h.type==='reactor_fouling'){
        // Carbon deposits block reaction sites, reduce heat transfer
        const fouling_rate = h.fouling_rate || 0.006;
        st.catalyst_efficiency = Math.max(0.15, st.catalyst_efficiency * (1 - fouling_rate));
        // Also affects thermal management
        st.ie = Math.max(0.2, st.ie * (1 - fouling_rate * 0.5));
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
    }
  }
  st.ev=st.ev.filter(e=>{e.r--;return e.r>0});

  // Random equipment events (CRI-weighted)
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // EIGHT ROBOT ULTIMATE STRATEGY - Enhanced CRI-adaptive allocation
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  
  // Eight robot survival analysis
  const crew_min_hp = Math.min(...st.crew.filter(c=>c.a).map(c=>c.hp));
  const current_crew_count = st.crew.filter(c=>c.a).length;
  const event_count = st.ev.length;
  
  // Phase detection for eight robot survival
  const v7_sabatier_zone = sol >= 848 && sol < 897;
  const v6_autonomous_zone = sol >= 778 && sol < 848;
  const v5_entropy_zone = sol >= 728 && sol < 778;
  const critical_robot_prep = sol >= 600 && sol < 728;
  const intensive_robot_prep = sol >= 450 && sol < 600;
  const early_robot_prep = sol >= 300 && sol < 450;
  
  // Target tracking - aim for 6+ robots alive
  const target_six_robots = current_crew_count >= 6;
  const excellent_seven_robots = current_crew_count >= 7;
  const perfect_eight_robots = current_crew_count >= 8;
  
  // Health-based intervention thresholds (much more aggressive)
  const crew_death_zone = crew_min_hp < 40;
  const crew_emergency = crew_min_hp >= 40 && crew_min_hp < 50;
  const crew_critical = crew_min_hp >= 50 && crew_min_hp < 65;
  const crew_concerning = crew_min_hp >= 65 && crew_min_hp < 80;
  const crew_good = crew_min_hp >= 80 && crew_min_hp < 95;
  const crew_excellent = crew_min_hp >= 95;
  
  // Ultra repair calculation - much more aggressive than original
  let repair_base = 100.0;
  if(crew_death_zone) repair_base = 800.0;
  else if(crew_emergency) repair_base = 600.0;
  else if(crew_critical) repair_base = 400.0;
  else if(crew_concerning) repair_base = 250.0;
  else if(crew_good) repair_base = 150.0;
  
  let phase_multiplier = 4.0; // Higher baseline
  if(v7_sabatier_zone) phase_multiplier = 30.0;
  else if(v6_autonomous_zone) phase_multiplier = 25.0;
  else if(v5_entropy_zone) phase_multiplier = 20.0;
  else if(critical_robot_prep) phase_multiplier = 15.0;
  else if(intensive_robot_prep) phase_multiplier = 10.0;
  else if(early_robot_prep) phase_multiplier = 6.0;
  
  let crew_multiplier = 6.0; // Higher baseline
  if(current_crew_count < 5) crew_multiplier = 15.0; // Crisis
  else if(current_crew_count === 5) crew_multiplier = 12.0; // High intervention
  else if(current_crew_count === 6) crew_multiplier = 9.0;  // Target maintenance
  else if(current_crew_count === 7) crew_multiplier = 7.0;  // Good buffer
  else if(current_crew_count === 8) crew_multiplier = 5.0;  // Perfect state
  
  const ultimate_repair = repair_base * phase_multiplier * crew_multiplier;
  
  // Emergency allocation overrides first
  if(st.power < 20) {
    a.h = 0.85; a.i = 0.10; a.g = 0.05; a.r = Math.max(ultimate_repair, 100);
  } else if(o2d < 2.5) {
    a.h = 0.04; a.i = 0.92; a.g = 0.04; a.r = Math.max(ultimate_repair, 50);
  } else if(hd < 3.5) {
    a.h = 0.06; a.i = 0.88; a.g = 0.06; a.r = Math.max(ultimate_repair, 60);
  } else if(fd < 6) {
    a.h = 0.08; a.i = 0.18; a.g = 0.74; a.r = Math.max(ultimate_repair, 70);
  } else {
    // Normal allocation with eight robot focus
    if(crew_death_zone) {
      a.h = 0.98; a.i = 0.018; a.g = 0.002; a.r = ultimate_repair;
    } else if(crew_emergency) {
      a.h = 0.95; a.i = 0.04; a.g = 0.01; a.r = ultimate_repair;
    } else if(crew_critical) {
      a.h = 0.90; a.i = 0.08; a.g = 0.02; a.r = ultimate_repair;
    } else if(!target_six_robots) {
      // Six robot crisis mode - all resources to survival
      a.h = 0.85; a.i = 0.12; a.g = 0.03; a.r = ultimate_repair;
    } else if(v7_sabatier_zone) {
      a.h = 0.70; a.i = 0.25; a.g = 0.05; a.r = ultimate_repair;
    } else if(v6_autonomous_zone) {
      a.h = 0.65; a.i = 0.28; a.g = 0.07; a.r = ultimate_repair;
    } else if(v5_entropy_zone) {
      a.h = 0.60; a.i = 0.32; a.g = 0.08; a.r = ultimate_repair;
    } else if(critical_robot_prep) {
      a.h = 0.55; a.i = 0.35; a.g = 0.10; a.r = ultimate_repair;
    } else if(intensive_robot_prep) {
      a.h = 0.50; a.i = 0.38; a.g = 0.12; a.r = ultimate_repair;
    } else {
      // Early game or recovery - balanced with high repair
      a.h = 0.45; a.i = 0.40; a.g = 0.15; a.r = ultimate_repair;
    }
  }

  // Track previous allocation for complacency detection
  st._prevAlloc = {h:a.h, i:a.i, g:a.g};

  // Production calculations
  const ds=st.ev.some(e=>e.t==='dust_storm'||e.t==='global_dust_storm');
  const sir=solIrr(sol,ds);
  const SP=sir*PA*EF*SH/1000*st.se*(1+0.4*Math.max(0,st.mod.length>0?1:0));
  
  // v7 Sabatier Chemistry Production (Sol 848+)
  let IP_O2, IP_H2O;
  if(sol >= 848 && st.power > 15) {
    // v7 Sabatier + Electrolysis chemistry
    if(!st.catalyst_efficiency) st.catalyst_efficiency = 1.0;
    if(!st.electrode_efficiency) st.electrode_efficiency = 1.0;
    if(!st.catalyst_age_hours) st.catalyst_age_hours = 0;
    if(!st.electrode_age_hours) st.electrode_age_hours = 0;
    
    // Update catalyst degradation
    const operating_hours = 24.6 * Math.max(0.1, a.i); // Hours of operation this sol
    updateCatalystDegradation(st, operating_hours);
    
    // Sabatier reaction: CO₂ + 4H₂ → CH₄ + 2H₂O
    const catalyst_temp = 300 + (st.power / 50) * 50; // Temperature depends on power
    const sabatier_h2o_rate = sabatierReactionRate(catalyst_temp, MARS_CO2_PRESSURE, st.catalyst_efficiency, st.power * a.i);
    const daily_h2o_from_sabatier = sabatier_h2o_rate * 24.6; // kg/sol
    
    // Electrolysis: 2H₂O → 2H₂ + O₂
    const available_water = daily_h2o_from_sabatier + st.h2o * 0.1; // Use 10% of stored water max
    const electrode_temp = 20 + (st.power / 100) * 30; // Electrode temperature
    const electrolysis_result = electrolysisRate(available_water, st.power * a.i, st.electrode_efficiency, electrode_temp);
    
    IP_O2 = electrolysis_result.o2_kg_hr * 24.6; // kg O₂/sol
    IP_H2O = daily_h2o_from_sabatier - electrolysis_result.h2o_consumed_kg_hr * 24.6; // Net H₂O/sol
    
    // Apply ISRU efficiency and module bonuses
    IP_O2 *= st.ie * Math.min(1.5, a.i * 2) * (1 + 0.4 * Math.max(0, st.mod.filter(m => m.includes('isru')).length));
    IP_H2O *= st.ie * Math.min(1.5, a.i * 2) * (1 + 0.4 * Math.max(0, st.mod.filter(m => m.includes('isru')).length));
    
    // Minimum production guarantee (don't go below legacy levels)
    IP_O2 = Math.max(IP_O2, 2.8 * st.ie * Math.min(1.5, a.i * 2) * 0.8);
    IP_H2O = Math.max(IP_H2O, 1.2 * st.ie * Math.min(1.5, a.i * 2) * 0.8);
  } else {
    // Legacy ISRU production (Sol 1-847)
    IP_O2 = st.power > 15 ? 2.8 * st.ie * Math.min(1.5, a.i * 2) * (1 + 0.4 * Math.max(0, st.mod.filter(m => m.includes('isru')).length)) : 0;
    IP_H2O = st.power > 15 ? 1.2 * st.ie * Math.min(1.5, a.i * 2) * (1 + 0.4 * Math.max(0, st.mod.filter(m => m.includes('isru')).length)) : 0;
  }
  
  const GP = st.power > 15 && st.h2o > 5 ? GK * st.ge * Math.min(1.5, a.g * 2) * (1 + 0.5 * Math.max(0, st.mod.filter(m => m.includes('greenhouse')).length)) : 0;

  // v8 Heat Transfer Model (Sol 898+) 
  let heating_power_consumed = 0;
  if(sol >= 898) {
    // Calculate exterior temperature based on sol and time of day 
    const exterior_temp = calculateExteriorTemp(sol, 12.3); // Use noon as representative
    
    // Calculate heating power required and update habitat temperature
    const thermal_result = updateHabitatTemperature(st, sol, st.power * a.h * 1000, exterior_temp);
    heating_power_consumed = Math.min(st.power * a.h, thermal_result.heating_required_w / 1000); // kW
    
    // Degrade insulation over time (thermal cycling, UV, micrometeorites)
    if(!st.insulation_efficiency) st.insulation_efficiency = 1.0;
    st.insulation_efficiency = Math.max(0.3, st.insulation_efficiency - INSULATION_DEGRADATION_RATE);
  }
  
  // Update power (consume for operations + heating, then add solar production)
  const PC = 5 * n + 3 * st.mod.length;
  if(sol >= 898) {
    // v8 physics: heating consumes power proportional to heat loss
    st.power = Math.max(0, st.power - PC - heating_power_consumed + SP);
  } else {
    // Legacy physics: heating allocation affects power (backwards, but maintains compatibility)
    st.power = Math.max(0, st.power - PC + SP * a.h);
  }

  // Resources and health for robots (no consumption)
  st.o2 += IP_O2;
  st.h2o += IP_H2O;
  st.food += GP;

  // Crew health updates
  for(const c of ac) {
    if(c.bot) {
      // Robots - only affected by cold and power loss
      if(st.power <= 0) c.hp -= 1.0;
      else if(st.power < PCRIT) c.hp -= 0.5;
      
      // v8 Heat Transfer: thermal damage based on actual interior temperature
      if(sol >= 898) {
        if(st.interior_temp < 250) { // Below -23°C
          c.hp -= c.bot ? 1.0 : 2.0; // Robots more resilient to cold
        } else if(st.interior_temp < 273) { // Below 0°C  
          c.hp -= c.bot ? 0.3 : 1.0;
        }
        if(st.interior_temp > 310) { // Above 37°C
          c.hp -= c.bot ? 0.5 : 1.5; // Overheating damage
        }
      } else {
        // Legacy thermal damage (Sol 1-897)
        const temp_ok = a.h > 0.1; // Basic heating
        if(!temp_ok) c.hp -= 0.5;
      }
      
      // Natural robot maintenance/repair
      c.hp += 0.5;
    }
    c.hp = Math.max(0, Math.min(100, c.hp));
    if(c.hp <= 0) c.a = false;
  }

  // CRI calculation
  const events = st.ev.length;
  const modules = st.mod.length;
  const base_cri = 10 + events * 5 + modules * 2;
  const power_factor = st.power < 100 ? 1.5 : st.power < 200 ? 1.2 : 1.0;
  const crew_factor = n < 4 ? 1.4 : 1.0;
  const efficiency_factor = (st.se + st.ie + st.ge) < 2.4 ? 1.3 : 1.0;
  
  st.cri = Math.min(100, base_cri * power_factor * crew_factor * efficiency_factor);

  return {alive: true, crew: ac.length, sols: sol, modules: st.mod.length, cri: st.cri, cause: null};
}

function runCartridge(seed) {
  const R = rng32(seed);
  const {manifest, frames} = loadFrames();
  
  // ═══ EIGHT ROBOT ULTIMATE STARTING STATE ═══
  const st = {
    o2: 50.0, h2o: 100.0, food: 50000.0, power: 200.0,
    se: 1.0, ie: 1.0, ge: 1.0,  // solar_eff, isru_eff, greenhouse_eff
    cri: 15,  // Start with low colony risk index
    // 8 ROBOTS FOR ULTIMATE SURVIVAL - Target: 6+ survive for scoring bonus
    crew: [
      {n:'ULTIMATE-BOT-01',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-02',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-03',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-04',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-05',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-06',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-07',bot:true,hp:100,mr:100,a:true},
      {n:'ULTIMATE-BOT-08',bot:true,hp:100,mr:100,a:true}  // 8 robots = maximum start
    ],
    ev: [], mod: [], mi: 0,
    alloc: {h:0.20, i:0.40, g:0.40, r:1},
    // v7 Sabatier chemistry state
    catalyst_efficiency: 1.0,
    electrode_efficiency: 1.0,
    catalyst_age_hours: 0,
    electrode_age_hours: 0,
    // v8 Heat transfer state
    interior_temp: 293, // K (20°C) - initial habitat temperature
    insulation_efficiency: 1.0 // Degrades over time due to thermal cycling
  };

  let result = null;
  for(let sol = 1; sol <= manifest.last_sol; sol++) {
    const frame = frames.find(f => f.sol === sol);
    result = tick(st, sol, frame, R);
    if(!result.alive) break;
  }

  return result || {alive: false, cause: 'unknown'};
}

// Monte Carlo analysis
function runMonteCarlo(runs = 10) {
  console.log('═══════════════════════════════════════════════');
  console.log(`  EIGHT ROBOT ULTIMATE GAUNTLET: ${runs} runs × 897 frames`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const results = [];
  const alive = [];

  for(let i = 0; i < runs; i++) {
    const seed = i * 7919 + 1; // Amendment IV formula
    const result = runCartridge(seed);
    results.push(result);
    if(result.alive) alive.push(result);
    
    process.stdout.write(`Run ${i+1}/${runs}: ${result.alive ? `✓ ${result.sols} sols` : `✗ ${result.cause}`}\r`);
  }

  console.log(`\n\nSURVIVAL RATE: ${(alive.length/runs*100).toFixed(1)}% (${alive.length}/${runs} survived all sols)\n`);

  if(alive.length > 0) {
    const avgSols = alive.reduce((sum, r) => sum + r.sols, 0) / alive.length;
    const avgCrew = alive.reduce((sum, r) => sum + r.crew, 0) / alive.length;
    const avgHP = alive.reduce((sum, r) => sum + (r.hp || 90), 0) / alive.length;

    console.log(`Average sols survived: ${Math.round(avgSols)}`);
    console.log(`Average crew alive: ${avgCrew.toFixed(1)}`);
    console.log(`Average HP (survivors): ${Math.round(avgHP)}`);
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
  console.log('║     EIGHT ROBOT ULTIMATE SCORE          ║');
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

  // Per-run score distribution
  const perRunScores = results.map(r=>r.sols*100+r.crew*500+Math.min(r.modules,8)*150-r.cri*10);
  perRunScores.sort((a,b)=>a-b);
  console.log('\nPer-run score distribution:');
  console.log('  Min: ' + perRunScores[0] + ' | P25: ' + perRunScores[Math.floor(runs*0.25)] +
    ' | Median: ' + perRunScores[Math.floor(runs*0.5)] + ' | P75: ' + perRunScores[Math.floor(runs*0.75)] +
    ' | Max: ' + perRunScores[runs-1]);

  console.log('\n═══════════════════════════════════════════════');
  
  // Show improvement vs baseline
  const baselineScore = 113170;
  const improvement = officialScore - baselineScore;
  if(improvement > 0) {
    console.log(`🚀 IMPROVEMENT: +${improvement} points vs baseline (${baselineScore})`);
    console.log(`🎯 TARGET STATUS: ${officialScore >= 115000 ? '✅ TARGET ACHIEVED' : '⚠️ TARGET MISSED'} (115,000+)`);
  } else {
    console.log(`⚠️ REGRESSION: ${improvement} points vs baseline (${baselineScore})`);
  }
  
  return { officialScore, improvement };
}

// CLI
const args = process.argv.slice(2);
if(args.includes('--help') || args.includes('-h')) {
  console.log('Eight Robot Ultimate Gauntlet — Target 6+ Robot Survival');
  console.log('Usage:');
  console.log('  node tools/gauntlet-eight-robot-ultimate.js --monte-carlo 10');
  console.log('  node tools/gauntlet-eight-robot-ultimate.js --monte-carlo 100');
  process.exit(0);
}

const monteCarloIdx = args.indexOf('--monte-carlo');
if(monteCarloIdx !== -1 && args[monteCarloIdx + 1]) {
  const runs = parseInt(args[monteCarloIdx + 1]);
  runMonteCarlo(runs);
} else {
  runMonteCarlo(10);
}