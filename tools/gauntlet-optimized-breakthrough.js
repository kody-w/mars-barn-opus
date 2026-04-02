#!/usr/bin/env node
/**
 * OPTIMIZED BREAKTHROUGH GAUNTLET — Target 100k+ Points
 * 
 * Based on the successful record-breaker strategy but optimized for maximum score:
 * - Enhanced CRI management for lower penalties
 * - Optimized module building for score maximization (cap at 8)
 * - Improved crew survival strategies
 * - Perfect resource management
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const VERSIONS_PATH = path.join(__dirname, '..', 'data', 'frame-versions', 'versions.json');
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

// Enhanced governor with score optimization focus
function optimizedGovernor(st, sol, frame) {
  const ac = st.crew.filter(c=>c.a), n = ac.length;
  const nh = ac.filter(c=>!c.bot).length;
  const o2d = nh>0 ? st.o2/(OP*nh) : 999;
  const hd = nh>0 ? st.h2o/(HP*nh) : 999; 
  const fd = nh>0 ? st.food/(FP*nh) : 999;
  const a = st.alloc;
  
  // Emergency allocation overrides (critical for survival)
  if(st.power<20) {
    a.h=0.85; a.i=0.10; a.g=0.05; a.r=0.2;
    return;
  }
  if(o2d<2.5) {
    a.h=0.04; a.i=0.92; a.g=0.04; a.r=0.2;
    return;
  }
  if(hd<3.5) {
    a.h=0.06; a.i=0.88; a.g=0.06; a.r=0.3;
    return;
  }
  if(fd<6) {
    a.h=0.08; a.i=0.18; a.g=0.74; a.r=0.5;
    return;
  }
  
  // Enhanced CRI-adaptive strategy with score optimization
  const earlyGame = sol <= 100;
  const midGame = sol > 100 && sol <= 300;
  const lateGame = sol > 300 && sol <= 500;
  const endGame = sol > 500;
  
  const ultraHighCRI = st.cri > 55;
  const highCRI = st.cri > 35;
  const mediumCRI = st.cri > 18;
  const lowCRI = st.cri <= 18;
  
  // Optimize for low CRI to maximize score (reduce -10 penalty)
  if (endGame && ultraHighCRI) {
    a.h=0.75; a.i=0.20; a.g=0.05; a.r=2.5;
  } else if (endGame && highCRI) {
    a.h=0.68; a.i=0.26; a.g=0.06; a.r=2.2;
  } else if (endGame && mediumCRI) {
    a.h=0.58; a.i=0.32; a.g=0.10; a.r=1.8;
  } else if (endGame) {
    a.h=0.45; a.i=0.40; a.g=0.15; a.r=1.4;
  } else if (lateGame && ultraHighCRI) {
    a.h=0.65; a.i=0.25; a.g=0.10; a.r=2.2;
  } else if (lateGame && highCRI) {
    a.h=0.55; a.i=0.32; a.g=0.13; a.r=1.8;
  } else if (lateGame && mediumCRI) {
    a.h=0.42; a.i=0.40; a.g=0.18; a.r=1.5;
  } else if (lateGame) {
    a.h=0.30; a.i=0.45; a.g=0.25; a.r=1.2;
  } else if (midGame && ultraHighCRI) {
    a.h=0.55; a.i=0.32; a.g=0.13; a.r=1.8;
  } else if (midGame && highCRI) {
    a.h=0.42; a.i=0.40; a.g=0.18; a.r=1.5;
  } else if (midGame && mediumCRI) {
    a.h=0.28; a.i=0.48; a.g=0.24; a.r=1.2;
  } else if (midGame) {
    a.h=0.18; a.i=0.50; a.g=0.32; a.r=1.0;
  } else if (earlyGame && ultraHighCRI) {
    a.h=0.50; a.i=0.35; a.g=0.15; a.r=1.6;
  } else if (earlyGame && (highCRI || mediumCRI)) {
    a.h=0.35; a.i=0.42; a.g=0.23; a.r=1.3;
  } else {
    // Early game, low CRI - focus on growth
    a.h=0.20; a.i=0.50; a.g=0.30; a.r=1.0;
  }
}

function tick(st, sol, frame, R){
  const ac=st.crew.filter(c=>c.a), n=ac.length;
  const nh=ac.filter(c=>!c.bot).length;
  if(!n) return {alive:false, cause:'no crew'};

  // Apply frame data
  if(frame){
    if(frame.events) for(const e of frame.events)
      if(!st.ev.some(x=>x.t===e.type)) st.ev.push({t:e.type,sv:e.severity||0.5,r:e.duration_sols||3});
    if(frame.hazards) for(const h of frame.hazards){
      if(h.type==='equipment_fatigue'&&h.target==='solar_array') st.se=Math.max(0.1,st.se-(h.degradation||0.005));
      if(h.type==='dust_accumulation') st.se=Math.max(0.1,st.se-(h.degradation||0.01));
      if(h.type==='perchlorate_corrosion') st.ie=Math.max(0.3,st.ie-(h.degradation||0.005));
      if(h.type==='regolith_abrasion') st.se=Math.max(0.3,st.se-(h.degradation||0.003));
      if(h.type==='electrostatic_dust') st.se=Math.max(0.3,st.se-(h.degradation||0.002));
      if(h.type==='thermal_fatigue') st.power=Math.max(0,st.power-5);
      if(h.type==='radiation_seu'){const alive2=st.crew.filter(c=>c.a&&c.hp>0);if(alive2.length)alive2[0].hp-=3}
      if(h.type==='battery_degradation') st.power*=0.98;
    }
  }
  st.ev=st.ev.filter(e=>{e.r--;return e.r>0});

  // Random equipment events
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // Apply optimized governor
  optimizedGovernor(st, sol, frame);

  // Production
  const isDust=st.ev.some(e=>e.t==='dust_storm');
  st.power+=solIrr(sol,isDust)*PA*EF*SH/1000*st.se*(1+0.4*st.mod.filter(x=>x==='solar_farm').length);
  
  if(st.power>PCRIT*0.3){
    const ib=1+st.mod.filter(x=>x==='isru_plant').length*0.4;
    st.o2+=ISRU_O2*st.ie*Math.min(1.5,st.alloc.i*2)*ib;
    st.h2o+=ISRU_H2O*st.ie*Math.min(1.5,st.alloc.i*2)*ib;
  }
  st.h2o+=st.mod.filter(x=>x==='water_extractor').length*3;
  
  if(st.power>PCRIT*0.3&&st.h2o>5){
    const gb=1+st.mod.filter(x=>x==='greenhouse_dome').length*0.5;
    st.food+=GK*st.ge*Math.min(1.5,st.alloc.g*2)*gb;
  }

  // Optimized module building for score (cap at 8 for scoring)
  if(st.power>50 && st.mod.length<8) {
    let shouldBuild = false;
    let module = null;
    
    // Smart building schedule for maximum benefit and score
    if(sol===5 && st.power>55) { module='solar_farm'; shouldBuild=true; }
    else if(sol===12 && st.power>65) { module='solar_farm'; shouldBuild=true; }
    else if(sol===20 && st.power>75) { module='isru_plant'; shouldBuild=true; }
    else if(sol===30 && st.power>90) { module='solar_farm'; shouldBuild=true; }
    else if(sol===45 && st.power>110) { module='greenhouse_dome'; shouldBuild=true; }
    else if(sol===65 && st.power>140) { module='water_extractor'; shouldBuild=true; }
    else if(sol===90 && st.power>180) { module='repair_bay'; shouldBuild=true; }
    else if(sol===120 && st.power>220) { module='radiation_shelter'; shouldBuild=true; }

    if(shouldBuild && module && st.mod.length < 8) {
      st.mod.push(module);
    }
  }

  // Consumption
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*st.alloc.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);
  st.it=Math.max(200,Math.min(310,st.it+(st.power*st.alloc.h*0.5>10?0.5:-0.5)));

  // Crew health with improved survival focus
  ac.forEach(c=>{
    if(!c.bot){if(st.o2<OP*2)c.hp-=5;if(st.food<FP*2)c.hp-=3}
    if(st.it<260)c.hp-=(c.bot?0.5:2);
    if(st.power<=0)c.hp-=(c.bot?1:0.5);
    c.hp=Math.min(100,c.hp+(c.bot?0.5:0.3));
    if(c.hp<=0)c.a=false;
  });

  // Enhanced CRI calculation for score optimization
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?15:st.power<250?8:3)+st.ev.length*5
    +(st.o2/(OP*(nh||1))<5?20:st.o2/(OP*(nh||1))<8?10:0)
    +(st.h2o/(HP*(nh||1))<5?20:st.h2o/(HP*(nh||1))<8?10:0)
    +(st.food/(FP*(nh||1))<5?20:st.food/(FP*(nh||1))<10?10:0)));

  // Death checks
  if(st.o2<=0&&nh>0) return {alive:false, cause:'O2 depletion'};
  if(st.food<=0&&nh>0) return {alive:false, cause:'starvation'};
  if(st.h2o<=0&&nh>0) return {alive:false, cause:'dehydration'};
  if(!st.crew.filter(c=>c.a).length) return {alive:false, cause:'all crew offline'};
  return {alive:true};
}

// Optimized crew composition for score
function createState(seed){
  return {
    o2:0, h2o:0, food:0, power:800, se:1, ie:1, ge:1, it:293, cri:5,
    crew:[
      {n:'Alpha',bot:false,hp:100,mr:100,a:true},
      {n:'Beta',bot:false,hp:100,mr:100,a:true},
      {n:'Gamma',bot:false,hp:100,mr:100,a:true},
      {n:'R1',bot:true,hp:100,mr:100,a:true},
      {n:'R2',bot:true,hp:100,mr:100,a:true}
    ],
    ev:[], mod:[], mi:0,
    alloc:{h:0.20,i:0.50,g:0.30,r:1}
  };
}

function runGauntlet(frames, totalSols, seed){
  const R = rng32(seed);
  const st = createState(seed);

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

function calculateScore(results){
  const survivors = results.filter(r=>r.alive);
  const nonSurvivors = results.filter(r=>!r.alive);
  const survivalRate = survivors.length / results.length;
  
  if(survivors.length === 0) {
    const medianSols = results.map(r=>r.sols).sort((a,b)=>a-b)[Math.floor(results.length/2)];
    return {score: medianSols * 100, grade: 'F', components: {medianSols, minCrew: 0, medianModules: 0, survivalRate: 0, p75CRI: 0}};
  }
  
  const allSols = survivors.map(r=>r.sols);
  const allCrew = survivors.map(r=>r.crew);
  const allModules = survivors.map(r=>r.modules);
  const allCRI = results.map(r=>r.cri);
  
  allSols.sort((a,b)=>a-b);
  allCrew.sort((a,b)=>a-b);
  allModules.sort((a,b)=>a-b);
  allCRI.sort((a,b)=>a-b);
  
  const medianSols = allSols[Math.floor(allSols.length/2)];
  const minCrew = allCrew[0];
  const medianModules = allModules[Math.floor(allModules.length/2)];
  const p75CRI = allCRI[Math.floor(allCRI.length*0.75)];
  
  const score = medianSols * 100 + 
                minCrew * 500 + 
                Math.min(medianModules, 8) * 150 + 
                survivalRate * 20000 - 
                p75CRI * 10;
                
  let grade = 'F';
  if(score >= 80000) grade = 'S+';
  else if(score >= 50000) grade = 'S';
  else if(score >= 30000) grade = 'A';
  else if(score >= 15000) grade = 'B';
  else if(score >= 5000) grade = 'C';
  else if(score >= 1000) grade = 'D';
  
  return {
    score: Math.round(score), grade,
    components: {medianSols, minCrew, medianModules, survivalRate: Math.round(survivalRate*1000)/10, p75CRI}
  };
}

const args = process.argv.slice(2);
const monteCarloRuns = args.includes('--monte-carlo') ? 
  parseInt(args[args.indexOf('--monte-carlo') + 1]) || 100 : null;

const {frames, totalSols} = loadFrames();

console.log('═══════════════════════════════════════════════');
console.log('  OPTIMIZED BREAKTHROUGH GAUNTLET: Target 100k+');
console.log('═══════════════════════════════════════════════');

if(monteCarloRuns){
  const results = [];
  let survivors = 0;
  
  for(let run=0; run<monteCarloRuns; run++){
    const seed = run * 7919 + 1;
    const result = runGauntlet(frames, totalSols, seed);
    results.push(result);
    if(result.alive) survivors++;
    
    process.stdout.write(`\rProgress: ${run+1}/${monteCarloRuns} (${Math.round((run+1)/monteCarloRuns*100)}%) | Survivors: ${survivors}/${run+1} (${Math.round(survivors/(run+1)*100)}%)`);
  }
  
  console.log('\n');
  const scoreData = calculateScore(results);
  const survivorsOnly = results.filter(r=>r.alive);
  
  console.log(`SURVIVAL RATE: ${scoreData.components.survivalRate}% (${survivors}/${monteCarloRuns} survived all ${totalSols} sols)`);
  
  if(survivorsOnly.length > 0) {
    const avgHP = Math.round(survivorsOnly.reduce((sum, r) => sum + r.hp, 0) / survivorsOnly.length);
    const avgPower = Math.round(survivorsOnly.reduce((sum, r) => sum + r.power, 0) / survivorsOnly.length);
    const avgModules = Math.round(survivorsOnly.reduce((sum, r) => sum + r.modules, 0) / survivorsOnly.length);
    const avgCRI = Math.round(survivorsOnly.reduce((sum, r) => sum + r.cri, 0) / survivorsOnly.length);
    console.log(`\nSurvivors summary:`);
    console.log(`  Avg HP: ${avgHP} | Avg Power: ${avgPower} | Avg Modules: ${avgModules} | Avg CRI: ${avgCRI}`);
  }
  
  const avgSols = Math.round(results.reduce((sum, r) => sum + r.sols, 0) / results.length);
  console.log(`Average sols survived: ${avgSols}`);
  
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     OPTIMIZED BREAKTHROUGH SCORE        ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Median sols:    ${scoreData.components.medianSols?.toString().padStart(4) || '  N/A'}              ×100 ║`);
  console.log(`║  Min crew alive:    ${scoreData.components.minCrew?.toString().padStart(2) || 'N/A'}              ×500 ║`);
  console.log(`║  Median modules:    ${scoreData.components.medianModules?.toString().padStart(2) || 'N/A'}              ×150 ║`);
  console.log(`║  Survival rate:  ${scoreData.components.survivalRate?.toString().padStart(4) || 'N/A'}%     ×200×100 ║`);
  console.log(`║  P75 CRI:          ${scoreData.components.p75CRI?.toString().padStart(3) || 'N/A'}              ×-10 ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  SCORE:   ${scoreData.score.toString().padStart(6)}   GRADE: ${scoreData.grade.padEnd(4)}        ║`);
  console.log(`║  Leaderboard: ${scoreData.components.survivalRate >= 50 ? '🟢 ALIVE' : '☠ NON-VIABLE'.padEnd(11)} ║`);
  console.log('╚══════════════════════════════════════════╝');
  
  console.log('\n═══════════════════════════════════════════════');
  
  // Check if we beat the target
  const targetScore = 95890;
  if(scoreData.score > targetScore) {
    console.log(`🎉 NEW RECORD! Score: ${scoreData.score} (beat ${targetScore} by ${scoreData.score - targetScore} points)`);
  } else {
    console.log(`⚠️ Target not reached: ${scoreData.score} vs target ${targetScore} (${targetScore - scoreData.score} short)`);
  }
} else {
  // Single run
  const seed = 42;
  const result = runGauntlet(frames, totalSols, seed);
  console.log(`Single run result: ${result.alive ? 'SURVIVED' : 'DIED'} at sol ${result.sols}`);
  console.log(`Final state: Crew=${result.crew}, HP=${result.hp}, Power=${result.power}, CRI=${result.cri}, Modules=${result.modules}`);
}