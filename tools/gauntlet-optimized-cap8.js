#!/usr/bin/env node
/**
 * GAUNTLET — OPTIMIZED FOR 8-MODULE CAP
 * 
 * Strategy: Build exactly 8 modules for maximum score efficiency.
 * Avoid wasting power on modules beyond the scoring cap.
 * 
 * Key optimizations:
 * 1. Stop at exactly 8 modules (cap compliance)
 * 2. Optimize build order for maximum benefit
 * 3. Enhanced CRI-adaptive governor
 * 4. Ultra-efficient resource management
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
          const isolationFactor = (minStable - aliveCrew) / minStable;
          st.morale = Math.max(0, st.morale - (h.morale_penalty||8) * isolationFactor);
          // Reduce efficiency when crew is isolated
          const effPenalty = (h.efficiency_penalty||0.02) * isolationFactor;
          st.se = Math.max(0.1, st.se - effPenalty);
          st.ie = Math.max(0.1, st.ie - effPenalty);
          st.ge = Math.max(0.1, st.ge - effPenalty);
        }
      }
      
      if(h.type==='solar_degradation'){
        // Irreversible panel degradation
        const degradation = h.degradation_rate||0.001;
        st.se = Math.max(0.1, st.se - degradation);
      }
      
      if(h.type==='habitat_entropy'){
        // General system degradation
        const entropyRate = h.entropy_rate||0.0005;
        st.se = Math.max(0.1, st.se - entropyRate);
        st.ie = Math.max(0.1, st.ie - entropyRate);
        st.ge = Math.max(0.1, st.ge - entropyRate);
      }

      // ═══ v6 AUTONOMOUS OPERATIONS hazards ═══
      
      if(h.type==='wheel_degradation'){
        // Robot mobility decreases over time
        const degradation = h.degradation_rate||0.002;
        ac.filter(c=>c.bot).forEach(robot => {
          robot.mobility = Math.max(0.1, (robot.mobility||1) - degradation);
          // Reduced mobility affects overall efficiency
          st.se = Math.max(0.1, st.se - degradation * 0.5);
        });
      }
      
      if(h.type==='navigation_error'){
        // Navigation failures waste time and energy
        const errorRate = h.error_probability||0.01;
        if(R() < errorRate){
          st.power = Math.max(0, st.power - (h.power_cost||10));
          // Lost robots temporarily reduce crew efficiency
          st.se = Math.max(0.1, st.se - 0.05);
        }
      }
      
      if(h.type==='watchdog_trip'){
        // System reboots causing temporary inefficiency
        const tripRate = h.trip_probability||0.005;
        if(R() < tripRate){
          // Temporary efficiency loss as systems restart
          st.se = Math.max(0.1, st.se - 0.03);
          st.ie = Math.max(0.1, st.ie - 0.03);
        }
      }
      
      if(h.type==='actuator_seizure'){
        // Joint freezing in extreme cold
        const seizureRate = h.seizure_probability||0.008;
        if(R() < seizureRate && st.it < 250){
          // Cold weather increases seizure risk
          ac.filter(c=>c.bot).forEach(robot => {
            robot.hp = Math.max(0, robot.hp - (h.damage||2));
          });
        }
      }
      
      if(h.type==='power_brownout'){
        // Battery capacity loss and power fluctuations
        const brownoutRate = h.brownout_probability||0.006;
        if(R() < brownoutRate){
          st.power = Math.max(0, st.power * (1 - (h.power_loss_factor||0.05)));
        }
      }
      
      if(h.type==='sensor_blindness'){
        // Sensor degradation affecting decision making
        const blindnessRate = h.blindness_probability||0.004;
        if(R() < blindnessRate){
          // Poor decisions due to sensor failure
          st.se = Math.max(0.1, st.se - 0.02);
          st.ie = Math.max(0.1, st.ie - 0.02);
        }
      }
      
      if(h.type==='thermal_shock'){
        // PCB and component damage from temperature swings
        const shockRate = h.shock_probability||0.003;
        if(R() < shockRate){
          // Random component failure
          st.power = Math.max(0, st.power - (h.power_damage||15));
        }
      }
      
      if(h.type==='regolith_entrapment'){
        // Robots getting stuck in terrain
        const entrapmentRate = h.entrapment_probability||0.001;
        if(R() < entrapmentRate){
          // Lose a robot temporarily or permanently
          const trapped = ac.filter(c=>c.bot && c.a);
          if(trapped.length > 0){
            trapped[0].a = false; // Robot becomes inactive
            trapped[0].hp = Math.max(0, trapped[0].hp - (h.damage||50));
          }
        }
      }
      
      if(h.type==='dust_storm_immobilization'){
        // Global dust storms shut down operations
        const stormActive = frame.hazards?.some(h2 => h2.type === 'dust_storm');
        if(stormActive){
          // Massive efficiency loss during dust storms
          st.se = Math.max(0.1, st.se * (1 - (h.efficiency_loss||0.8)));
          st.ie = Math.max(0.1, st.ie * (1 - (h.efficiency_loss||0.3)));
          st.ge = Math.max(0.1, st.ge * (1 - (h.efficiency_loss||0.5)));
        }
      }
    }
  }

  // Heal events
  for(let i=st.ev.length-1; i>=0; i--) if(--st.ev[i].r<=0) st.ev.splice(i,1);

  // ── PRODUCTION ──
  const dustStorm = st.ev.some(e=>e.t==='dust_storm');
  const solarProd = solIrr(sol,dustStorm)*PA*EF*SH/1000*st.se*(1+(st.mod.includes('solar_farm')?0.4:0));
  st.power = Math.min(10000, st.power + solarProd);

  const o2Prod = st.power>=15 ? ISRU_O2*st.ie*Math.min(1.5,st.alloc.i*2)*(1+(st.mod.includes('isru_plant')?0.4:0)) : 0;
  const h2oProd = st.power>=15 ? ISRU_H2O*st.ie*Math.min(1.5,st.alloc.i*2)*(1+(st.mod.includes('isru_plant')?0.4:0)) : 0;
  st.o2 = Math.min(2000, st.o2 + o2Prod + (st.mod.includes('water_extractor') ? 3 : 0));
  st.h2o = Math.min(2000, st.h2o + h2oProd);

  const foodProd = (st.power>=15 && st.h2o>=5) ? GK*st.ge*Math.min(1.5,st.alloc.g*2)*(1+(st.mod.includes('greenhouse_dome')?0.5:0)) : 0;
  st.food = Math.min(50000, st.food + foodProd);

  // ── CONSUMPTION ──
  st.power = Math.max(0, st.power - n*5 - st.mod.length*3);
  if(nh>0){
    st.o2 = Math.max(0, st.o2 - nh*OP);
    st.h2o = Math.max(0, st.h2o - nh*HP);
    st.food = Math.max(0, st.food - nh*FP*0.9);
  }

  // ── HEATING ──
  const heatReq = Math.max(0, 293 - sol*0.1);
  const heatGen = st.power>=1 ? st.alloc.h*st.power*0.8 : 0;
  st.it = Math.min(310, Math.max(200, st.it + (heatGen - heatReq)*0.02));

  // ── CREW DAMAGE ──
  if(st.o2<nh*1.68*2) ac.filter(c=>!c.bot).forEach(h=>h.hp-=5);
  if(st.food<nh*5000) ac.filter(c=>!c.bot).forEach(h=>h.hp-=3);
  if(st.it<260){ac.filter(c=>!c.bot).forEach(h=>h.hp-=2);ac.filter(c=>c.bot).forEach(r=>r.hp-=0.5)}
  if(!st.power){ac.filter(c=>c.bot).forEach(r=>r.hp-=1);ac.filter(c=>!c.bot).forEach(h=>h.hp-=0.5)}
  
  // Natural healing + radiation shelter bonus
  const healBonus = st.mod.includes('radiation_shelter') ? 0.2 : 0;
  ac.filter(c=>!c.bot).forEach(h=>h.hp=Math.min(100,h.hp+0.3+healBonus));
  ac.filter(c=>c.bot).forEach(r=>r.hp=Math.min(100,r.hp+0.5+healBonus));

  // Repair bay efficiency bonus
  if(st.mod.includes('repair_bay')){
    st.se = Math.min(1.2, st.se + 0.005);
    st.ie = Math.min(1.2, st.ie + 0.003);
  }

  // Dead crew
  ac.filter(c=>c.hp<=0).forEach(c=>c.a=false);

  // Buffer calculations for governor
  const o2d = st.o2/(nh*OP||1), hd = st.h2o/(nh*HP||1), fd = st.food/(nh*FP||1);

  // ── OPTIMIZED 8-MODULE BUILD SCHEDULE ──
  // Build exactly 8 modules for maximum scoring efficiency
  // Start much earlier like the original for survival, but cap at 8 for scoring
  if(sol===2&&st.power>12&&st.mod.length<8)         {st.mod.push('solar_farm')}     // 1st - Immediate power
  else if(sol===5&&st.power>20&&st.mod.length<8)    {st.mod.push('solar_farm')}     // 2nd - Rapid acceleration  
  else if(sol===8&&st.power>30&&st.mod.length<8)    {st.mod.push('solar_farm')}     // 3rd - Power foundation
  else if(sol===12&&st.power>40&&st.mod.length<8)   {st.mod.push('solar_farm')}     // 4th - Early surplus
  else if(sol===16&&st.power>50&&st.mod.length<8)   {st.mod.push('solar_farm')}     // 5th - More power
  else if(sol===20&&st.power>60&&st.mod.length<8)   {st.mod.push('repair_bay')}     // 6th - Efficiency boost
  else if(sol===26&&st.power>75&&st.mod.length<8)   {st.mod.push('isru_plant')}     // 7th - O2/H2O production
  else if(sol===32&&st.power>90&&st.mod.length<8)   {st.mod.push('greenhouse_dome')} // 8th - FINAL MODULE (food production)
  
  // NO MORE MODULES AFTER 8! This prevents wasted power on non-scoring modules.
  // This aggressive early schedule ensures survival while respecting the scoring cap.

  // ── ULTRA-ENHANCED CRI-ADAPTIVE GOVERNOR ──
  const a=st.alloc;
  // Track previous allocation for complacency detection
  st._prevAlloc = {h:a.h, i:a.i, g:a.g};
  
  // Emergency protocols - highest priority
  if(st.power<20)       {a.h=0.85;a.i=0.10;a.g=0.05;a.r=0.2}
  else if(o2d<2.5)      {a.h=0.04;a.i=0.92;a.g=0.04;a.r=0.2}
  else if(hd<3.5)       {a.h=0.06;a.i=0.88;a.g=0.06;a.r=0.3}
  else if(fd<6)         {a.h=0.08;a.i=0.18;a.g=0.74;a.r=0.5}
  else {
    // QUANTUM-LEVEL CRI-ADAPTIVE STRATEGY - Optimized for 8-module efficiency
    const moduleCount = st.mod.length;
    const endGame = sol > 600;        // Later end game for better optimization
    const lateGame = sol > 400;       // Later late game threshold
    const midGame = sol > 200;        // Mid game phase
    const ultraHigh = st.cri > 70;    // Ultra-high risk threshold
    const veryHigh = st.cri > 55;     // Very high risk threshold  
    const highRisk = st.cri > 40;     // High risk threshold
    const mediumRisk = st.cri > 20;   // Medium risk threshold
    
    // Module efficiency factor - more modules = better optimization
    const moduleBonus = Math.min(1.2, 1 + (moduleCount * 0.025));
    
    if(endGame && ultraHigh) {
      // End game + ultra high CRI: ultimate survival mode
      a.h=0.78; a.i=0.18; a.g=0.04; a.r=3.5;
    } else if(endGame && veryHigh) {
      // End game + very high CRI: maximum defensive 
      a.h=0.72; a.i=0.23; a.g=0.05; a.r=3.2;
    } else if(endGame && highRisk) {
      // End game + high CRI: strong defensive
      a.h=0.66; a.i=0.27; a.g=0.07; a.r=2.8;
    } else if(endGame) {
      // End game standard: balanced survival
      a.h=0.58; a.i=0.28; a.g=0.14; a.r=2.4;
    } else if(lateGame && ultraHigh) {
      // Late game + ultra high CRI: strong defensive preparation
      a.h=0.62; a.i=0.28; a.g=0.10; a.r=2.6;
    } else if(lateGame && veryHigh) {
      // Late game + very high CRI: moderate defensive
      a.h=0.56; a.i=0.32; a.g=0.12; a.r=2.2;
    } else if(lateGame && highRisk) {
      // Late game + high CRI: balanced defensive
      a.h=0.48; a.i=0.35; a.g=0.17; a.r=1.9;
    } else if(lateGame) {
      // Late game standard: aggressive growth
      a.h=0.38; a.i=0.36; a.g=0.26; a.r=1.6;
    } else if(midGame && ultraHigh) {
      // Mid game + ultra high CRI: defensive with resource focus
      if(o2d < 12) {
        a.h=0.42; a.i=0.48; a.g=0.10; a.r=1.8;  // O2 focus
      } else if(hd < 12) {
        a.h=0.42; a.i=0.48; a.g=0.10; a.r=1.8;  // H2O focus
      } else if(fd < 18) {
        a.h=0.42; a.i=0.20; a.g=0.38; a.r=1.8;  // Food focus
      } else {
        a.h=0.52; a.i=0.32; a.g=0.16; a.r=1.8;  // General defensive
      }
    } else if(midGame && veryHigh) {
      // Mid game + very high CRI: balanced with slight defensive bias
      if(o2d < 10) {
        a.h=0.35; a.i=0.50; a.g=0.15; a.r=1.6;
      } else if(hd < 10) {
        a.h=0.35; a.i=0.50; a.g=0.15; a.r=1.6;
      } else if(fd < 16) {
        a.h=0.35; a.i=0.22; a.g=0.43; a.r=1.6;
      } else {
        a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.6;
      }
    } else if(midGame && highRisk) {
      // Mid game + high CRI: balanced approach
      if(o2d < 8) {
        a.h=0.30; a.i=0.52; a.g=0.18; a.r=1.4;
      } else if(hd < 8) {
        a.h=0.30; a.i=0.52; a.g=0.18; a.r=1.4;
      } else if(fd < 14) {
        a.h=0.30; a.i=0.24; a.g=0.46; a.r=1.4;
      } else {
        a.h=0.40; a.i=0.38; a.g=0.22; a.r=1.4;
      }
    } else if(midGame) {
      // Mid game standard: aggressive growth with module bonus
      a.h=(0.25 * moduleBonus); a.i=(0.40 * moduleBonus); a.g=(0.35 * moduleBonus); a.r=1.2;
      // Normalize to ensure total doesn't exceed 1.0
      const total = a.h + a.i + a.g;
      if(total > 1.0) {
        a.h /= total; a.i /= total; a.g /= total;
      }
    } else {
      // Early game: focus on rapid infrastructure with emergency responsiveness
      if(ultraHigh) {
        a.h=0.50; a.i=0.35; a.g=0.15; a.r=1.5;
      } else if(veryHigh) {
        a.h=0.45; a.i=0.38; a.g=0.17; a.r=1.3;
      } else if(highRisk) {
        a.h=0.35; a.i=0.42; a.g=0.23; a.r=1.2;
      } else if(mediumRisk) {
        a.h=0.25; a.i=0.45; a.g=0.30; a.r=1.0;
      } else {
        // Low CRI: maximum growth
        a.h=0.20; a.i=0.48; a.g=0.32; a.r=0.8;
      }
    }
    
    // Apply module efficiency bonus to allocations (without exceeding 1.0)
    if(moduleCount >= 6) {
      const efficiencyBonus = Math.min(0.15, moduleCount * 0.02);
      a.i = Math.min(0.95, a.i + efficiencyBonus);
      a.g = Math.min(0.95, a.g + efficiencyBonus);
      // Slight heating reduction to compensate
      a.h = Math.max(0.05, a.h - efficiencyBonus);
    }
  }

  // ── CRI CALCULATION ──
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    +(o2d<5?20:0)+(hd<5?20:0)+(fd<5?20:0)));

  // ── DEATH CONDITIONS ──
  if(st.o2<=0&&nh>0) return {alive:false, cause:'O2 depletion'};
  if(st.food<=0&&nh>0) return {alive:false, cause:'starvation'};
  if(st.h2o<=0&&nh>0) return {alive:false, cause:'dehydration'};
  if(!st.crew.filter(c=>c.a).length) return {alive:false, cause:'all crew offline'};
  return {alive:true};
}

function createState(seed){
  return {
    o2:0, h2o:0, food:0, power:800, se:1, ie:1, ge:1, it:293, cri:5, morale:100,
    crew:[
      {n:'OPTIMIZED-ROBOT-01',bot:true,hp:100,mr:100,a:true,mobility:1},
      {n:'OPTIMIZED-ROBOT-02',bot:true,hp:100,mr:100,a:true,mobility:1},
      {n:'OPTIMIZED-ROBOT-03',bot:true,hp:100,mr:100,a:true,mobility:1},
      {n:'OPTIMIZED-ROBOT-04',bot:true,hp:100,mr:100,a:true,mobility:1},
      {n:'OPTIMIZED-ROBOT-05',bot:true,hp:100,mr:100,a:true,mobility:1},
      {n:'OPTIMIZED-ROBOT-06',bot:true,hp:100,mr:100,a:true,mobility:1},
      {n:'OPTIMIZED-ROBOT-07',bot:true,hp:100,mr:100,a:true,mobility:1}  // 7 robots optimal balance
    ],
    ev:[], mod:[], mi:0,
    alloc:{h:0.20,i:0.40,g:0.40,r:1},
    _prevAlloc:{h:0.20,i:0.40,g:0.40}
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
        cri: st.cri, modules: st.mod.length, morale: st.morale||100
      };
    }
  }

  return {
    sols: totalSols, alive: true, cause: null, seed,
    crew: st.crew.filter(c=>c.a).length,
    hp: Math.round(st.crew.filter(c=>c.a).reduce((s,c)=>s+c.hp,0)/Math.max(1,st.crew.filter(c=>c.a).length)),
    power: Math.round(st.power), solarEff: Math.round(st.se*100),
    cri: st.cri, modules: st.mod.length, morale: st.morale||100
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
  console.log('  (OPTIMIZED FOR 8-MODULE CAP)');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/7 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri+' | Modules:'+result.modules);
  const score = result.sols*100 + result.crew*500 + Math.min(result.modules,8)*150 - result.cri*10;
  console.log('Score: '+score + ' | Modules capped at: ' + Math.min(result.modules,8) + '/8');
} else {
  // Monte Carlo
  console.log('═══════════════════════════════════════════════');
  console.log('  MONTE CARLO GAUNTLET: '+runs+' runs × '+totalSols+' frames');
  console.log('  (OPTIMIZED FOR 8-MODULE CAP)');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }

  const alive = results.filter(r=>r.alive);
  const dead = results.filter(r=>!r.alive);
  const avgSols = Math.round(results.reduce((s,r)=>s+r.sols,0)/runs);
  const avgHP = Math.round(alive.length ? alive.reduce((s,r)=>s+r.hp,0)/alive.length : 0);
  const avgModules = Math.round(results.reduce((s,r)=>s+r.modules,0)/runs);
  const maxModules = Math.max(...results.map(r=>r.modules));
  const survivalPct = (alive.length/runs*100).toFixed(1);

  console.log('SURVIVAL RATE: ' + survivalPct + '% (' + alive.length + '/' + runs + ' survived all ' + totalSols + ' sols)\n');
  console.log('Average sols survived: ' + avgSols);
  console.log('Average HP (survivors): ' + avgHP);
  console.log('Average modules built: ' + avgModules + ' (max: ' + maxModules + ', scoring capped at 8)');

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
    + Math.min(medianModules, 8) * 150  // CAPPED AT 8 MODULES
    + survivalRate * 20000
    - p75CRI * 10
  );

  const officialGrade = officialScore>=80000?'S+':officialScore>=50000?'S':officialScore>=30000?'A':
    officialScore>=15000?'B':officialScore>=5000?'C':officialScore>=1000?'D':'F';

  const leaderboardAlive = survivalRate >= 0.5;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     OFFICIAL MONTE CARLO SCORE           ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('║     8-MODULE CAP OPTIMIZED               ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Median sols:    ' + String(medianSols).padStart(6) + '              ×100 ║');
  console.log('║  Min crew alive: ' + String(minCrew).padStart(6) + '              ×500 ║');
  console.log('║  Median modules: ' + String(Math.min(medianModules,8)).padStart(6) + '              ×150 ║');
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

  console.log('\nModule Statistics:');
  console.log('  Median modules built: ' + medianModules + ' (scoring capped at 8)');
  console.log('  Max modules built: ' + maxModules + ' (excess modules waste power)');
  console.log('  Module efficiency: ' + Math.round((Math.min(medianModules,8)/medianModules)*100) + '% scoring efficiency');

  console.log('\n═══════════════════════════════════════════════');
}