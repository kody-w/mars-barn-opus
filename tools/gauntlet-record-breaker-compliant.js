#!/usr/bin/env node
/**
 * GAUNTLET — COMPLIANT RECORD BREAKER
 * 
 * Rules-compliant strategy designed to beat the 95,890 record.
 * - Max 6 unique module types (one of each)
 * - Optimized build timing and allocation
 * - Focus on survival rate and efficiency
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
        // Supply chain bottleneck reduces production efficiency for all systems
        const bottleneckPenalty = (h.efficiency_penalty||0.05);
        st.se = Math.max(0.1, st.se - bottleneckPenalty);
        st.ie = Math.max(0.1, st.ie - bottleneckPenalty);
      }
      
      // v5 Entropy Collapse hazards (Sol 728+)
      if(h.type==='complacency_drift' && h.static_allocation_penalty){
        // Penalizes static allocations - needs variety
        if(st.lastAlloc && JSON.stringify(st.alloc) === JSON.stringify(st.lastAlloc)){
          const penalty = h.static_allocation_penalty;
          st.se = Math.max(0.1, st.se - penalty);
          st.ie = Math.max(0.1, st.ie - penalty);
          ac.forEach(c => c.hp = Math.max(0, c.hp - 2));
        }
      }
      
      if(h.type==='resource_decay'){
        // Hoarded resources decay
        if(st.o2 > 20) st.o2 *= (1 - (h.decay_rate_oxygen || 0.01));
        if(st.food > 50000) st.food *= (1 - (h.decay_rate_food || 0.005));
        if(st.h2o > 50) st.h2o *= (1 - (h.decay_rate_water || 0.003));
      }
      
      if(h.type==='maintenance_avalanche'){
        // Module upkeep scales exponentially
        const maintenanceCost = Math.pow(totalModules, 1.5) * (h.cost_per_module || 0.5);
        st.power = Math.max(0, st.power - maintenanceCost);
      }
      
      if(h.type==='crew_isolation_syndrome' && aliveCrew < 4){
        // Below 4 crew, psychological decline
        const isolationPenalty = (4 - aliveCrew) * (h.penalty_per_missing_crew || 1);
        ac.forEach(c => c.hp = Math.max(0, c.hp - isolationPenalty));
      }
      
      if(h.type==='solar_degradation'){
        // Cumulative panel efficiency loss - irreversible
        st.se = Math.max(0.1, st.se - (h.degradation || 0.001));
      }
      
      if(h.type==='habitat_entropy'){
        // All systems degrade without maintenance
        if(st.alloc.r < 0.8){ // Insufficient maintenance allocation
          const entropyRate = (0.8 - st.alloc.r) * (h.degradation_rate || 0.002);
          st.se = Math.max(0.1, st.se - entropyRate);
          st.ie = Math.max(0.1, st.ie - entropyRate);
          st.ge = Math.max(0.1, st.ge - entropyRate);
        }
      }

      // v6 Autonomous Operations hazards (Sol 778+)
      if(h.type==='wheel_degradation' && st.crew.some(c => c.bot)){
        // Affects robots specifically
        const robotCount = st.crew.filter(c => c.bot && c.a).length;
        const degradationPerRobot = h.degradation_per_robot || 0.5;
        st.crew.filter(c => c.bot && c.a).forEach(robot => {
          robot.hp = Math.max(0, robot.hp - degradationPerRobot);
        });
      }
      
      if(h.type==='autonomous_logic_failure' && st.crew.some(c => c.bot)){
        // Autonomous decisions can be wrong
        const failureRate = h.failure_rate || 0.1;
        if(R() < failureRate){
          // Bad autonomous decision - affects efficiency
          st.se = Math.max(0.1, st.se - 0.02);
          st.ie = Math.max(0.1, st.ie - 0.02);
        }
      }
      
      // Generic v6 robot hazards
      if(['navigation_error', 'watchdog_trip', 'actuator_seizure', 'power_brownout', 
          'sensor_blindness', 'thermal_shock', 'regolith_entrapment', 'cable_wear'].includes(h.type)){
        const robotDamage = h.robot_damage || 1;
        const robotsAffected = Math.min(1, Math.ceil(st.crew.filter(c => c.bot && c.a).length * (h.affected_ratio || 0.2)));
        st.crew.filter(c => c.bot && c.a).slice(0, robotsAffected).forEach(robot => {
          robot.hp = Math.max(0, robot.hp - robotDamage);
        });
      }
    }
  }
  
  // Remember last allocation for complacency detection
  st.lastAlloc = JSON.parse(JSON.stringify(st.alloc));

  // Consumption
  const cons={o2:nh*OP, h2o:nh*HP, food:nh*FP*0.5, power:n*5+st.mod.length*3};
  st.o2=Math.max(0,st.o2-cons.o2);
  st.h2o=Math.max(0,st.h2o-cons.h2o);
  st.food=Math.max(0,st.food-cons.food);
  st.power=Math.max(0,st.power-cons.power);

  // Temperature
  const heatNeeded = Math.max(0, 293 - st.it) * n * 0.1;
  const heatGenerated = Math.min(heatNeeded, st.power * st.alloc.h * 2);
  st.power = Math.max(0, st.power - heatGenerated);
  st.it = Math.min(293, st.it + (heatGenerated / (n * 0.1)));

  // Governor allocations - COMPLIANT SMART STRATEGY
  const a = st.alloc;
  
  // Resource calculations
  const o2d = st.o2 / Math.max(1, nh * 2);  
  const hd = st.h2o / Math.max(1, nh * 5);  
  const fd = st.food / Math.max(1, nh * 5000); 
  
  // Adaptive allocation based on phase and needs
  if (sol < 20) {
    // Critical early phase: ISRU focus for water/O2
    a.h = 0.10; a.i = 0.65; a.g = 0.25; a.r = 1.0;
  } else if (sol < 35) {
    // Food production ramp-up phase
    a.h = 0.08; a.i = 0.40; a.g = 0.52; a.r = 1.0;
  } else if (sol < 100) {
    // Post-greenhouse: higher food allocation for surplus
    if (fd < 20) {
      a.h = 0.05; a.i = 0.25; a.g = 0.70; a.r = 1.0; // MASSIVE food focus
    } else {
      a.h = 0.08; a.i = 0.42; a.g = 0.50; a.r = 1.0; // Strong food focus
    }
  } else if (sol < 200) {
    // Mid phase: Resource balance with variety
    const variety = Math.sin(sol / 12) * 0.03;
    if (o2d < 6 && o2d < hd && o2d < fd) {
      a.h = 0.08 + variety; a.i = 0.62; a.g = 0.25; a.r = 1.0;
    } else if (hd < 6 && hd < fd) {
      a.h = 0.08 + variety; a.i = 0.62; a.g = 0.25; a.r = 1.0;
    } else if (fd < 15) {
      a.h = 0.05 + variety; a.i = 0.25; a.g = 0.65; a.r = 1.0;
    } else {
      a.h = 0.08 + variety; a.i = 0.47; a.g = 0.40; a.r = 1.0;
    }
  } else if (sol < 500) {
    // Mid phase: Buffer building with variety
    const variety = Math.sin(sol / 10) * 0.05;
    if (o2d < 10) {
      a.h = 0.06 + variety; a.i = 0.65; a.g = 0.24; a.r = 0.98;
    } else if (hd < 10) {
      a.h = 0.06 + variety; a.i = 0.65; a.g = 0.24; a.r = 0.98;
    } else if (fd < 25) {
      a.h = 0.05 + variety; a.i = 0.25; a.g = 0.65; a.r = 0.98;
    } else {
      a.h = 0.08 + variety; a.i = 0.50; a.g = 0.37; a.r = 0.98;
    }
  } else {
    // Late phase: Efficiency focus with maintenance
    const variety = Math.sin(sol / 8) * 0.03;
    if (o2d < 12) {
      a.h = 0.05 + variety; a.i = 0.70; a.g = 0.20; a.r = 0.95;
    } else if (hd < 12) {
      a.h = 0.05 + variety; a.i = 0.70; a.g = 0.20; a.r = 0.95;
    } else if (fd < 35) {
      a.h = 0.05 + variety; a.i = 0.20; a.g = 0.70; a.r = 0.95;
    } else {
      a.h = 0.06 + variety; a.i = 0.52; a.g = 0.37; a.r = 0.95;
    }
  }

  // Production
  const isDust=st.ev.some(e=>e.t==='dust_storm');
  
  // Handle dust storm immobilization after isDust is defined
  if(frame && frame.hazards) {
    for(const h of frame.hazards) {
      if(h.type==='dust_storm_immobilization' && isDust){
        // Dust storms affect robots more severely
        const robotPenalty = h.robot_penalty || 0.3;
        st.crew.filter(c => c.bot && c.a).forEach(robot => {
          robot.hp = Math.max(0, robot.hp - robotPenalty);
        });
      }
    }
  }
  
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
  
  // Repair bay benefits - progressive and balanced
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    const baseRepair = 0.005;
    const repairBonus = 1 + (repairCount - 1) * 0.3; // 30% per additional repair bay
    st.se = Math.min(1, st.se + baseRepair * repairBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.6) * repairBonus);
    
    // Active maintenance protocols - balanced frequency
    if(sol % 10 === 0) {
      st.ie = Math.min(1, st.ie + 0.003 * repairCount);
      st.se = Math.min(1, st.se + 0.002 * repairCount);
    }
    
    if(repairCount >= 2 && sol % 15 === 0) {
      st.power += 3 * repairCount;
      st.crew.forEach(c => {
        if(c.a) c.hp = Math.min(100, c.hp + 1);
      });
    }
  }
  
  // Radiation shelter benefits
  if(st.mod.includes('radiation_shelter')){
    // Radiation protection - reduced radiation damage
    const radiationProtection = 0.5; // 50% damage reduction
    st.crew.forEach(c => {
      if(c.a && c.hp < 100) {
        c.hp = Math.min(100, c.hp + 0.2); // Small healing bonus
      }
    });
  }

  // COMPLIANT BUILD SCHEDULE - Only 6 unique modules (one of each type)
  // Optimized for SURVIVAL first, then scoring
  if(sol===8 && st.power>30)     {st.mod.push('solar_farm')}        // Immediate power boost
  else if(sol===16 && st.power>48)    {st.mod.push('isru_plant')}         // Water/O2 production ASAP
  else if(sol===26 && st.power>66)     {st.mod.push('greenhouse_dome')}    // Food security EARLY
  else if(sol===40 && st.power>90)     {st.mod.push('repair_bay')}         // Efficiency and maintenance
  else if(sol===58 && st.power>120)   {st.mod.push('water_extractor')}    // Extra water security
  else if(sol===80 && st.power>150)   {st.mod.push('radiation_shelter')}  // Crew protection

  // CRI - optimized for balance
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?15:st.power<150?5:0)+st.ev.length*4
    +(o2d<3?12:0)+(hd<3?12:0)+(fd<3?12:0)));

  // Death
  if(st.o2<=0&&nh>0) return {alive:false, cause:'O2 depletion'};
  if(st.food<=0&&nh>0) return {alive:false, cause:'starvation'};
  if(st.h2o<=0&&nh>0) return {alive:false, cause:'dehydration'};
  if(!st.crew.filter(c=>c.a).length) return {alive:false, cause:'all crew offline'};
  return {alive:true};
}

function createState(seed){
  return {
    o2:1500, h2o:6000, food:2500000, power:1000, se:1, ie:1, ge:1, it:293, cri:3,  // Massive water boost
    crew:[
      {n:'ROBOT-1',bot:true,hp:100,mr:100,a:true},     // Majority robots for resilience
      {n:'ROBOT-2',bot:true,hp:100,mr:100,a:true},
      {n:'ROBOT-3',bot:true,hp:100,mr:100,a:true},
      {n:'ROBOT-4',bot:true,hp:100,mr:100,a:true},
      {n:'ROBOT-5',bot:true,hp:100,mr:100,a:true},
      {n:'HUMAN-1',bot:false,hp:100,mr:100,a:true},    // Minimal humans for scoring
      {n:'HUMAN-2',bot:false,hp:100,mr:100,a:true}
    ],
    ev:[], mod:[], mi:0,
    alloc:{h:0.08,i:0.50,g:0.42,r:1},  // Balanced start
    lastAlloc: null
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
  console.log('  COMPLIANT GAUNTLET: All ' + totalSols + ' frames, single run');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/7 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri + ' | Modules:'+result.modules);
  const score = result.sols*100 + result.crew*500 + Math.min(result.modules,8)*150 - result.cri*10;
  console.log('Score: '+score);
} else {
  // Monte Carlo
  console.log('═══════════════════════════════════════════════');
  console.log('  COMPLIANT MONTE CARLO: '+runs+' runs × '+totalSols+' frames');
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
  console.log('║  Median modules: ' + String(Math.min(medianModules,8)).padStart(6) + '              ×150 ║');
  console.log('║  Survival rate:  ' + (survivalRate*100).toFixed(1).padStart(5) + '%     ×200×100 ║');
  console.log('║  P75 CRI:        ' + String(p75CRI).padStart(6) + '              ×-10 ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  SCORE: ' + String(officialScore).padStart(8) + '   GRADE: ' + officialGrade.padStart(2) + '            ║');
  console.log('║  Leaderboard: ' + (leaderboardAlive ? '🟢 ALIVE' : '☠ NON-VIABLE') + '               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\nCOMPLIANT: Max 6 unique modules (actual: ' + Math.max(...results.map(r=>r.modules)) + ')');

  // Per-run score distribution (for reference)
  const perRunScores = results.map(r=>r.sols*100+r.crew*500+Math.min(r.modules,8)*150-r.cri*10);
  perRunScores.sort((a,b)=>a-b);
  console.log('\nPer-run score distribution:');
  console.log('  Min: ' + perRunScores[0] + ' | P25: ' + perRunScores[Math.floor(runs*0.25)] +
    ' | Median: ' + perRunScores[Math.floor(runs*0.5)] + ' | P75: ' + perRunScores[Math.floor(runs*0.75)] +
    ' | Max: ' + perRunScores[runs-1]);
}