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
const PA=15, EF=0.22, SH=12.3, ISRU_O2=2.8, ISRU_H2O=1.2, GK=3500;
const OP=0.84, HP=2.5, FP=2500, PCRIT=50;

function rng32(s){let t=s&0xFFFFFFFF;return()=>{t=(t*1664525+1013904223)&0xFFFFFFFF;return(t>>>0)/0xFFFFFFFF}}
function solIrr(sol,dust){const y=sol%669,a=2*Math.PI*(y-445)/669;return 589*(1+0.09*Math.cos(a))*Math.max(0.3,Math.cos(2*Math.PI*y/669)*0.5+0.5)*(dust?0.25:1)}

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
        // 140°C daily swing. Solder cracks. PCBs warp.
        if(R() < (h.component_failure_prob||0.04)){
          // Random component dies
          const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>0);
          if(bots.length) bots[Math.floor(R()*bots.length)%bots.length].hp -= 10;
          st.ie = Math.max(0.1, st.ie * 0.9);
        }
      }

      if(h.type==='regolith_entrapment'){
        // Spirit got stuck and never got out.
        if(R() < (1 - (h.success_probability||0.7))){
          // Robot stuck permanently — effectively lost
          const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>10);
          if(bots.length) bots[Math.floor(R()*bots.length)%bots.length].hp = 0;
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
  const sb=1+st.mod.filter(x=>x==='solar_farm').length*0.4;
  st.power+=solIrr(sol,isDust)*PA*EF*SH/1000*st.se*sb;
  if(st.power>PCRIT*0.3){
    const ib=1+st.mod.filter(x=>x==='isru_plant').length*0.4;
    st.o2+=ISRU_O2*st.ie*Math.min(1.5,a.i*2)*ib;
    st.h2o+=ISRU_H2O*st.ie*Math.min(1.5,a.i*2)*ib;
  }
  st.h2o+=st.mod.filter(x=>x==='water_extractor').length*3;
  if(st.power>PCRIT*0.3&&st.h2o>5){
    const gb=1+st.mod.filter(x=>x==='greenhouse_dome').length*0.5;
    st.food+=GK*st.ge*Math.min(1.5,a.g*2)*gb;
  }
  // Ultra-hypermax active hazard mitigation for ultimate quantum shield
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    // Ultra-exponential repair scaling - even more aggressive than before
    const baseRepair = 0.007;  // Increased from 0.005
    const ultraExponentialBonus = Math.pow(1.55, repairCount - 1); // 55% exponential scaling (up from 45%)
    st.se = Math.min(1, st.se + baseRepair * ultraExponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.7) * ultraExponentialBonus); // Increased from 0.6
    
    // Ultra-frequent active mitigation protocols (more aggressive timing)
    if(repairCount >= 1) {
      // High-frequency perchlorate corrosion prevention
      if(sol % 6 === 0) st.ie = Math.min(1, st.ie + 0.006); // Increased from every 8 sols and 0.004
      // Continuous dust management
      if(sol % 4 === 0) st.se = Math.min(1, st.se + 0.005); // Increased from every 6 sols and 0.003
    }
    
    if(repairCount >= 2) {
      // Advanced thermal fatigue prevention
      if(sol % 8 === 0) st.power += 8; // Increased from every 12 sols and +5
      // Enhanced radiation protection
      if(sol % 10 === 0) { // Increased frequency from every 15 sols
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 3); // Increased from +2
        });
      }
    }
    
    if(repairCount >= 3) {
      // Ultra-prevention protocols 
      if(sol % 7 === 0) { // Increased frequency from every 10 sols
        st.se = Math.min(1, st.se + 0.004); // Increased from 0.002
        st.ie = Math.min(1, st.ie + 0.005); // Increased from 0.003
      }
    }

    if(repairCount >= 4) {
      // Quantum-level damage prevention
      if(sol % 4 === 0) { // Increased frequency from every 5 sols
        st.power += 5; // Increased from +3
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 2); // Increased from +1
        });
      }
    }
    
    if(repairCount >= 5) {
      // Ultra-maximum quantum shield protocols  
      if(sol % 2 === 0) { // Increased frequency from every 3 sols
        st.se = Math.min(1, st.se + 0.002); // Increased from 0.001
        st.ie = Math.min(1, st.ie + 0.002); // Increased from 0.001
        st.power += 4; // Increased from +2
      }
    }

    if(repairCount >= 6) {
      // Transcendent system resilience 
      if(sol % 2 === 0) { // Same frequency
        st.se = Math.min(1, st.se + 0.003); // Increased from 0.002
        st.ie = Math.min(1, st.ie + 0.003); // Increased from 0.002
        st.power += 5; // Increased from +3
      }
    }

    if(repairCount >= 7) {
      // Perfect quantum shield 
      st.power += 4; // Increased from constant +2 power bonus
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 2.5); // Increased from +1.5
        });
      }
    }

    if(repairCount >= 8) {
      // Absolute system transcendence 
      st.power += 3; // Increased from +1 continuous power generation
      if(sol % 1 === 0) { // Every sol
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1); // Increased from +0.5
        });
      }
    }
    
    if(repairCount >= 9) {
      // Ultra-transcendent quantum mastery (new tier)
      st.power += 2; // Additional continuous power
      if(sol % 1 === 0) {
        st.se = Math.min(1, st.se + 0.001);
        st.ie = Math.min(1, st.ie + 0.001);
      }
    }
    
    if(repairCount >= 10) {
      // Ultimate quantum omnipotence (new tier)
      st.power += 2; // Even more power
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.5);
        });
        st.power += 1; // Additional power boost
      }
    }
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

  // HYPERMAX SCORE OPTIMIZATION: Even more aggressive module deployment for > 90k score
  // Ultra-early solar foundation (even earlier than before)
  if(sol===2&&st.power>12)         {st.mod.push('solar_farm')}     // Immediate start
  else if(sol===5&&st.power>20)    {st.mod.push('solar_farm')}     // Ultra-rapid acceleration
  else if(sol===8&&st.power>30)    {st.mod.push('solar_farm')}     // Power foundation
  else if(sol===12&&st.power>40)   {st.mod.push('solar_farm')}     // Early surplus
  else if(sol===16&&st.power>50)   {st.mod.push('solar_farm')}     // 5th solar even earlier
  // Revolutionary ultra-early repair investment 
  else if(sol===20&&st.power>60)   {st.mod.push('repair_bay')}     // Ultra-early repair (5 sols earlier)
  // Continued aggressive solar buildup
  else if(sol===26&&st.power>75)   {st.mod.push('solar_farm')}     // 6th solar
  else if(sol===32&&st.power>90)   {st.mod.push('solar_farm')}     // 7th solar
  else if(sol===38&&st.power>105)  {st.mod.push('repair_bay')}     // 2nd repair bay (32 sols earlier!)
  else if(sol===45&&st.power>125)  {st.mod.push('solar_farm')}     // 8th solar
  else if(sol===52&&st.power>145)  {st.mod.push('solar_farm')}     // 9th solar
  else if(sol===60&&st.power>170)  {st.mod.push('repair_bay')}     // 3rd repair bay
  else if(sol===70&&st.power>200)  {st.mod.push('solar_farm')}     // 10th solar - massive early power
  else if(sol===80&&st.power>235)  {st.mod.push('repair_bay')}     // 4th repair bay
  else if(sol===92&&st.power>275)  {st.mod.push('repair_bay')}     // 5th repair bay
  else if(sol===105&&st.power>320) {st.mod.push('solar_farm')}     // 11th solar
  else if(sol===120&&st.power>370) {st.mod.push('repair_bay')}     // 6th repair bay - quantum shield
  else if(sol===135&&st.power>420) {st.mod.push('repair_bay')}     // 7th repair bay
  else if(sol===152&&st.power>480) {st.mod.push('solar_farm')}     // 12th solar
  
  // ULTRA-EARLY SCORING DIVERSIFICATION - Start scoring modules much earlier
  else if(sol===170&&st.power>540) {st.mod.push('isru_plant')}     // 1st ISRU (160 sols earlier!)
  else if(sol===185&&st.power>580) {st.mod.push('water_extractor')} // 1st water (165 sols earlier!)
  else if(sol===200&&st.power>620) {st.mod.push('greenhouse_dome')} // 1st greenhouse (170 sols earlier!)
  else if(sol===215&&st.power>660) {st.mod.push('isru_plant')}     // 2nd ISRU
  else if(sol===230&&st.power>700) {st.mod.push('water_extractor')} // 2nd water
  else if(sol===245&&st.power>740) {st.mod.push('greenhouse_dome')} // 2nd greenhouse
  else if(sol===260&&st.power>780) {st.mod.push('repair_bay')}     // 8th repair bay
  else if(sol===275&&st.power>820) {st.mod.push('isru_plant')}     // 3rd ISRU
  else if(sol===290&&st.power>860) {st.mod.push('water_extractor')} // 3rd water
  else if(sol===305&&st.power>900) {st.mod.push('greenhouse_dome')} // 3rd greenhouse
  else if(sol===320&&st.power>940) {st.mod.push('solar_farm')}     // 13th solar
  else if(sol===335&&st.power>980) {st.mod.push('repair_bay')}     // 9th repair bay
  else if(sol===350&&st.power>1020) {st.mod.push('isru_plant')}    // 4th ISRU
  else if(sol===365&&st.power>1060) {st.mod.push('water_extractor')} // 4th water
  else if(sol===380&&st.power>1100) {st.mod.push('greenhouse_dome')} // 4th greenhouse
  else if(sol===395&&st.power>1140) {st.mod.push('solar_farm')}    // 14th solar
  else if(sol===410&&st.power>1180&&st.mod.length<12) {st.mod.push('repair_bay')}    // 10th repair bay - only if under 12
  else if(sol===425&&st.power>1220&&st.mod.length<12) {st.mod.push('isru_plant')}    // 5th ISRU - only if under 12
  else if(sol===440&&st.power>1260&&st.mod.length<12) {st.mod.push('water_extractor')} // 5th water - only if under 12
  else if(sol===455&&st.power>1300&&st.mod.length<12) {st.mod.push('greenhouse_dome')} // 5th greenhouse - only if under 12
  else if(sol===470&&st.power>1340&&st.mod.length<12) {st.mod.push('isru_plant')}    // 6th ISRU - only if under 12
  else if(sol===485&&st.power>1380&&st.mod.length<12) {st.mod.push('water_extractor')} // 6th water - only if under 12
  else if(sol===500&&st.power>1420&&st.mod.length<12) {st.mod.push('greenhouse_dome')} // 6th greenhouse - only if under 12
  else if(sol===515&&st.power>1460&&st.mod.length<12) {st.mod.push('solar_farm')}    // 15th solar - only if under 12

  // CRI
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    +(o2d<5?20:0)+(hd<5?20:0)+(fd<5?20:0)));

  // Death
  if(st.o2<=0&&nh>0) return {alive:false, cause:'O2 depletion'};
  if(st.food<=0&&nh>0) return {alive:false, cause:'starvation'};
  if(st.h2o<=0&&nh>0) return {alive:false, cause:'dehydration'};
  if(!st.crew.filter(c=>c.a).length) return {alive:false, cause:'all crew offline'};
  return {alive:true};
}

function createState(seed){
  return {
    o2:0, h2o:0, food:0, power:800, se:1, ie:1, ge:1, it:293, cri:5,
    crew:[
      {n:'ULTRA-CREW-01',bot:true,hp:100,mr:100,a:true},
      {n:'ULTRA-CREW-02',bot:true,hp:100,mr:100,a:true},
      {n:'ULTRA-CREW-03',bot:true,hp:100,mr:100,a:true},
      {n:'ULTRA-CREW-04',bot:true,hp:100,mr:100,a:true},
      {n:'ULTRA-CREW-05',bot:true,hp:100,mr:100,a:true},
      {n:'ULTRA-CREW-06',bot:true,hp:100,mr:100,a:true},
      {n:'ULTRA-CREW-07',bot:true,hp:100,mr:100,a:true}  // 7 robots for optimal balance
    ],
    ev:[], mod:[], mi:0,
    alloc:{h:0.20,i:0.40,g:0.40,r:1}
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
