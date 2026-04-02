#!/usr/bin/env node
/**
 * v4 MODULE OVERLOAD GAUNTLET — Test aggressive module farming against v4 hazards
 * 
 * This version removes hardcoded module limits to test true module farming potential
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const PA=15, EF=0.22, SH=12.3, ISRU_O2=2.8, ISRU_H2O=1.2, GK=3500;
const OP=0.84, HP=2.5, FP=2500, PCRIT=50;

function rng32(s){let t=s&0xFFFFFFFF;return()=>{t=(t*1664525+1013904223)&0xFFFFFFFF;return t/0xFFFFFFFF}}
function solIrr(sol,dust){const y=sol%669,a=2*Math.PI*(y-445)/669;return 589*(1+0.09*Math.cos(a))*Math.max(0.3,Math.cos(2*Math.PI*y/669)*0.5+0.5)*(dust?0.25:1)}

function loadFrames(){
  const mn = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR,'manifest.json')));
  const frames = {};
  for(const e of mn.frames){
    frames[e.sol]=JSON.parse(fs.readFileSync(path.join(FRAMES_DIR,`sol-${String(e.sol).padStart(4,'0')}.json`)));
  }
  return {manifest:mn, frames, totalSols:mn.last_sol};
}

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
        const excessModules = totalModules - (h.min_modules||4);
        const cascadeDamage = (h.severity_per_module||0.005) * excessModules;
        st.se = Math.max(0.1, st.se - cascadeDamage);
        st.ie = Math.max(0.1, st.ie - cascadeDamage);
        st.power = Math.max(0, st.power - (cascadeDamage * 100));
      }
      
      if(h.type==='power_grid_overload' && totalModules >= (h.min_modules||5)){
        const excessModules = totalModules - (h.min_modules||5);
        const powerDrain = (h.power_drain_per_module||3.0) * excessModules;
        st.power = Math.max(0, st.power - powerDrain);
      }
      
      if(h.type==='dust_infiltration' && h.targets_all_modules){
        const totalDegradation = (h.degradation_per_module||0.002) * totalModules;
        st.se = Math.max(0.1, st.se - totalDegradation);
        st.ie = Math.max(0.1, st.ie - totalDegradation);
      }
      
      if(h.type==='supply_chain_bottleneck' && aliveCrew >= (h.min_crew||3) && totalModules >= (h.min_modules||3)){
        const efficiencyLoss = h.efficiency_penalty||0.015;
        st.se = Math.max(0.1, st.se - efficiencyLoss);
        st.ie = Math.max(0.1, st.ie - efficiencyLoss);
      }
    }
  }
  st.ev=st.ev.filter(e=>{e.r--;return e.r>0});

  // Random equipment events (CRI-weighted)
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // v4 OPTIMIZED MODULE FARMING STRATEGY
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  const totalModules = st.mod.length;
  const v4Zone = sol >= 678;
  
  // Adaptive allocation based on v4 zone and module count
  if(st.power<20)       {a.h=0.85;a.i=0.10;a.g=0.05;a.r=0.2}
  else if(o2d<2.5)      {a.h=0.04;a.i=0.92;a.g=0.04;a.r=0.2}
  else if(hd<3.5)       {a.h=0.06;a.i=0.88;a.g=0.06;a.r=0.3}
  else if(fd<6)         {a.h=0.08;a.i=0.18;a.g=0.74;a.r=0.5}
  else {
    // v4 ZONE ADAPTATION - adjust for efficiency penalties
    if(v4Zone && totalModules > 50) {
      // High module count in v4 - be more conservative
      a.h=0.60; a.i=0.25; a.g=0.15; a.r=2.0;
    } else if(v4Zone && totalModules > 30) {
      // Medium module count in v4
      a.h=0.70; a.i=0.20; a.g=0.10; a.r=1.5;
    } else if(v4Zone) {
      // Low module count in v4 - still aggressive
      a.h=0.80; a.i=0.15; a.g=0.05; a.r=1.0;
    } else {
      // Pre-v4 zone - maximum aggression
      a.h=0.90; a.i=0.08; a.g=0.02; a.r=0.8;
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

  // v4 UNLIMITED MODULE FARMING - Build based on conditions, not hardcoded limits!
  const buildPower = st.power > 20 + totalModules * 0.2; // Reduced power scaling
  
  if(buildPower) {
    let shouldBuild = false;
    let moduleType = 'solar_farm';
    
    if(sol < 150) {
      // Ultra-aggressive early foundation - build every sol
      if(sol % 1 === 0 && st.power > 15) { shouldBuild = true; moduleType = 'solar_farm'; }
    } else if(sol < 300) {
      // Hyper-aggressive expansion - very frequent building
      if(sol % 2 === 0) {
        shouldBuild = true;
        const types = ['solar_farm', 'solar_farm', 'solar_farm', 'repair_bay'];
        moduleType = types[sol % types.length];
      }
    } else if(sol < 500) {
      // Maximum farming phase - constant building
      if(sol % 2 === 0) {
        shouldBuild = true;
        const types = ['solar_farm', 'isru_plant', 'water_extractor', 'greenhouse_dome', 'repair_bay'];
        moduleType = types[sol % types.length];
      }
    } else if(sol < 650) {
      // Pre-v4 final massive push - build every sol
      if(sol % 1 === 0 && st.power > 100) {
        shouldBuild = true;
        const types = ['solar_farm', 'isru_plant', 'water_extractor', 'greenhouse_dome', 'repair_bay'];
        moduleType = types[sol % types.length];
      }
    } else if(sol < 678) {
      // v4 preparation - max out everything
      if(sol % 1 === 0 && st.power > 200) {
        shouldBuild = true;
        moduleType = (sol % 2 === 0) ? 'repair_bay' : 'solar_farm';
      }
    } else {
      // v4 zone - strategic building based on conditions
      const efficiency = (st.se + st.ie) / 2;
      if(efficiency > 0.5 && totalModules < 300) {
        // High efficiency - continue building
        if(sol % 8 === 0) {
          shouldBuild = true;
          moduleType = (totalModules % 4 === 0) ? 'repair_bay' : 'solar_farm';
        }
      } else if(efficiency > 0.3 && totalModules < 500) {
        // Medium efficiency - slower building
        if(sol % 12 === 0) {
          shouldBuild = true;
          moduleType = 'repair_bay'; // Focus on repair in v4
        }
      }
      // Below 0.3 efficiency or 500+ modules - stop building
    }
    
    if(shouldBuild && totalModules < 600) { // Higher hard cap
      st.mod.push(moduleType);
    }
  }

  // Crew health
  ac.forEach(c=>{
    if(!c.bot){if(st.o2<OP*2)c.hp-=5;if(st.food<FP*2)c.hp-=3}
    if(st.it<250)c.hp-=(c.bot?0.3:2);
    if(st.power<=0)c.hp-=(c.bot?1:0.5);
    c.hp=Math.min(100,c.hp+(c.bot?0.5:0.3));
    if(c.hp<=0)c.a=false;
  });

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

function runGauntlet(frames, totalSols, seed=42){
  const R = rng32(seed);
  const st={crew:[{a:1,hp:100,bot:0},{a:1,hp:100,bot:0}],power:100,o2:20,h2o:20,food:2000,it:250,
    se:1,ie:1,ge:1,cri:0,alloc:{h:0,i:0,g:0,r:0},mod:[],ev:[]};

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
const runs = monteCarloArg ? parseInt(monteCarloArg.split('=')[1] || process.argv[process.argv.indexOf('--monte-carlo')+1] || '10') : 1;

if(runs === 1){
  console.log('═══════════════════════════════════════════════');
  console.log('  v4 MODULE OVERLOAD GAUNTLET: ' + totalSols + ' frames');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log(`Crew: ${result.crew}/2 | HP: ${result.hp} | Power: ${result.power} | Solar: ${result.solarEff}% | CRI: ${result.cri} | MODULES: ${result.modules}`);
  const score = result.sols*100 + result.crew*500 + result.modules*150 - result.cri*10;
  console.log(`Score: ${score}`);
  
  if(score > 150000) {
    console.log('\n🔥🚀 NEW RECORD! EXTREME v4 MODULE FARMING SUCCESS! 🚀🔥');
  } else if(score > 120000) {
    console.log('\n⚡ HIGH SCORE! v4 module farming viable!');
  }
} else {
  // Monte Carlo mode
  console.log('═══════════════════════════════════════════════');
  console.log('  v4 MODULE OVERLOAD MONTE CARLO: '+runs+' runs × '+totalSols+' frames');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }

  const alive = results.filter(r=>r.alive);
  const dead = results.filter(r=>!r.alive);
  const survivalRate = alive.length / runs;
  
  console.log(`SURVIVAL RATE: ${(survivalRate*100).toFixed(1)}% (${alive.length}/${runs} survived all ${totalSols} sols)`);
  if(alive.length > 0) {
    const avgModules = alive.reduce((s,r)=>s+r.modules,0)/alive.length;
    const maxScore = Math.max(...alive.map(r=>r.sols*100+r.crew*500+r.modules*150-r.cri*10));
    const minScore = Math.min(...alive.map(r=>r.sols*100+r.crew*500+r.modules*150-r.cri*10));
    console.log(`Average modules (survivors): ${avgModules.toFixed(1)}`);
    console.log(`Score range: ${minScore} - ${maxScore}`);
    
    if(maxScore > 150000) {
      console.log('\n🔥 BREAKTHROUGH! Multiple strategies achieve 150K+ scores! 🔥');
    }
  }

  console.log('\n═══════════════════════════════════════════════');
}