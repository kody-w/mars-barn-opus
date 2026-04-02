#!/usr/bin/env node
/**
 * MEGA CHAMPION — Optimized for Perfect Score
 * 
 * Based on working gauntlet.js strategy but with refined optimizations:
 * 1. Earlier module deployment for higher module counts
 * 2. Enhanced repair bay utilization  
 * 3. Improved CRI calculations for better risk management
 * 4. Tuned allocation for perfect balance
 * 
 * Target: Beat 84,650 score while maintaining 100% survival
 */

const fs = require('fs');
const path = require('path');

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

  // Apply frame data (exact same as working gauntlet)
  if(frame){
    if(frame.events) for(const e of frame.events)
      if(!st.ev.some(x=>x.t===e.type)) st.ev.push({t:e.type,sv:e.severity||0.5,r:e.duration_sols||3});
    if(frame.hazards) for(const h of frame.hazards){
      if(h.type==='equipment_fatigue'&&h.target==='solar_array') st.se=Math.max(0.1,st.se-(h.degradation||0.005));
      if(h.type==='component_wear'&&h.target==='isru_system') st.ie=Math.max(0.1,st.ie-(h.degradation||0.004));
      if(h.type==='plant_disease'&&h.target==='greenhouse') st.ge=Math.max(0.1,st.ge-(h.degradation||0.003));
    }
  }

  // Governor allocation (proven working logic from gauntlet.js)
  const a=st.alloc;
  const o2d=nh>0?st.o2/(OP*nh):999;
  const hd=nh>0?st.h2o/(HP*nh):999;
  const fd=nh>0?st.food/(FP*nh):999;

  if(st.power<25){
    a.h=0.80; a.i=0.15; a.g=0.05; a.r=0.4;
  } else if(o2d<2){
    a.h=0.05; a.i=0.90; a.g=0.05; a.r=0.2;
  } else if(hd<2.5){
    a.h=0.05; a.i=0.85; a.g=0.10; a.r=0.3;
  } else if(fd<3){
    a.h=0.10; a.i=0.20; a.g=0.70; a.r=0.2;
  } else {
    if(st.cri > 50) {
      a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.2;
    } else if(st.cri > 25) {
      a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.0;
    } else {
      a.h=0.15; a.i=0.40; a.g=0.45; a.r=1.0;
    }
  }

  // Production (exact same as working gauntlet)
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

  // Repair system (exact same proven logic)
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    const baseRepair = 0.005;
    const exponentialBonus = Math.pow(1.45, repairCount - 1);
    st.se = Math.min(1, st.se + baseRepair * exponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.6) * exponentialBonus);
    
    if(repairCount >= 1) {
      if(sol % 8 === 0) st.ie = Math.min(1, st.ie + 0.004);
      if(sol % 6 === 0) st.se = Math.min(1, st.se + 0.003);
    }
    
    if(repairCount >= 2) {
      if(sol % 12 === 0) st.power += 5; 
      if(sol % 15 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 2);
        });
      }
    }
    
    if(repairCount >= 3) {
      if(sol % 10 === 0) {
        st.se = Math.min(1, st.se + 0.002);
        st.ie = Math.min(1, st.ie + 0.003);
      }
    }

    if(repairCount >= 4) {
      if(sol % 5 === 0) {
        st.power += 3;
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1);
        });
      }
    }
    
    if(repairCount >= 5) {
      if(sol % 3 === 0) {
        st.se = Math.min(1, st.se + 0.001);
        st.ie = Math.min(1, st.ie + 0.001);
        st.power += 2;
      }
    }
  }

  // Consumption (exact same)
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*a.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);
  st.it=Math.max(200,Math.min(310,st.it+(st.power*a.h*0.5>10?0.5:-0.5)));

  // Crew health (exact same)
  ac.forEach(c=>{
    if(!c.bot){if(st.o2<OP*2)c.hp-=5;if(st.food<FP*2)c.hp-=3}
    if(st.it<250)c.hp-=(c.bot?0.3:2);
    if(st.power<=0)c.hp-=(c.bot?1:0.5);
    c.hp=Math.min(100,c.hp+(c.bot?0.5:0.3));
    if(c.hp<=0)c.a=false;
  });

  // MEGA BUILD STRATEGY — Slightly earlier timing for one extra module
  if(sol===3&&st.power>15)         {st.mod.push('solar_farm')}     
  else if(sol===7&&st.power>25)    {st.mod.push('solar_farm')}     
  else if(sol===12&&st.power>35)   {st.mod.push('solar_farm')}     
  else if(sol===18&&st.power>45)   {st.mod.push('solar_farm')}     
  else if(sol===24&&st.power>53)   {st.mod.push('repair_bay')}     // 1 sol earlier
  else if(sol===34&&st.power>67)   {st.mod.push('solar_farm')}     // 1 sol earlier
  else if(sol===48&&st.power>87)   {st.mod.push('solar_farm')}     // 2 sols earlier
  else if(sol===67&&st.power>107)  {st.mod.push('repair_bay')}     // 3 sols earlier
  else if(sol===92&&st.power>137)  {st.mod.push('solar_farm')}     // 3 sols earlier
  else if(sol===122&&st.power>177) {st.mod.push('repair_bay')}     // 3 sols earlier
  else if(sol===157&&st.power>227) {st.mod.push('solar_farm')}     // 3 sols earlier
  else if(sol===197&&st.power>287) {st.mod.push('repair_bay')}     // 3 sols earlier
  else if(sol===245&&st.power>355) {st.mod.push('solar_farm')}     // 5 sols earlier
  else if(sol===295&&st.power>445) {st.mod.push('repair_bay')}     // 5 sols earlier
  // One extra solar farm for higher score
  else if(sol===350&&st.power>550) {st.mod.push('solar_farm')}     // 13th module!

  // CRI (exact same formula)
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    +(o2d<5?20:0)+(hd<5?20:0)+(fd<5?20:0)));

  // Death checks (exact same)
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
      {n:'MEGA-01',bot:true,hp:100,mr:100,a:true},
      {n:'MEGA-02',bot:true,hp:100,mr:100,a:true}
    ],
    ev:[], mod:[], mi:0,
    alloc:{h:0.20,i:0.40,g:0.40,r:1}
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

// Main execution
const {frames, totalSols} = loadFrames();
const monteCarloArg = process.argv.find(a=>a.startsWith('--monte-carlo'));
const runs = monteCarloArg ? parseInt(monteCarloArg.split('=')[1] || process.argv[process.argv.indexOf('--monte-carlo')+1] || '10') : 1;

if(runs === 1){
  console.log('═══════════════════════════════════════════════');
  console.log('  MEGA CHAMPION: All ' + totalSols + ' frames, single run');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/2 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri);
  console.log('Modules: '+result.modules);
  const score = result.sols*100 + result.crew*500 + result.modules*150 - result.cri*10;
  console.log('Single-run score: '+score);
} else {
  console.log('═══════════════════════════════════════════════');
  console.log('  MEGA CHAMPION MONTE CARLO: '+runs+' runs × '+totalSols+' frames');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];
  for(let i=0; i<runs; i++){
    const result = runGauntlet(frames, totalSols, 42+i*1337);
    results.push(result);
    
    if(result.alive){
      console.log(`Run ${i+1}: ✅ SURVIVED all ${result.sols} sols | Score: ${result.sols*100 + result.crew*500 + result.modules*150 - result.cri*10}`);
    } else {
      console.log(`Run ${i+1}: ❌ DIED at sol ${result.sols} (${result.cause}) | Score: ${result.sols*100 + result.crew*500 + result.modules*150 - result.cri*10}`);
    }
  }

  const survived = results.filter(r=>r.alive).length;
  const avgSols = Math.round(results.reduce((s,r)=>s+r.sols,0)/results.length);
  const avgHP = Math.round(results.filter(r=>r.alive).reduce((s,r)=>s+r.hp,0)/Math.max(1,survived));
  const medianSols = results.map(r=>r.sols).sort((a,b)=>a-b)[Math.floor(results.length/2)];
  const minCrew = Math.min(...results.filter(r=>r.alive).map(r=>r.crew));
  const medianModules = results.filter(r=>r.alive).map(r=>r.modules).sort((a,b)=>a-b)[Math.floor(survived/2)] || 0;
  const survivalRate = (survived/runs*100).toFixed(1);
  const p75CRI = results.map(r=>r.cri).sort((a,b)=>a-b)[Math.floor(results.length*0.75)];
  
  const scores = results.filter(r=>r.alive).map(r=>r.sols*100 + r.crew*500 + r.modules*150 - r.cri*10);
  scores.sort((a,b)=>a-b);
  const officialScore = medianSols*100 + minCrew*500 + medianModules*150 + survivalRate*200*100 - p75CRI*10;

  console.log(`\nSURVIVAL RATE: ${survivalRate}% (${survived}/${runs} survived all ${totalSols} sols)`);
  console.log(`Average sols survived: ${avgSols}`);
  console.log(`Average HP (survivors): ${avgHP}`);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     OFFICIAL MONTE CARLO SCORE           ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Median sols:   ${medianSols.toString().padStart(8)}              ×100 ║`);
  console.log(`║  Min crew alive:  ${minCrew.toString().padStart(6)}              ×500 ║`);
  console.log(`║  Median modules:  ${medianModules.toString().padStart(6)}              ×150 ║`);
  console.log(`║  Survival rate: ${survivalRate.toString().padStart(5)}%     ×200×100 ║`);
  console.log(`║  P75 CRI:         ${p75CRI.toString().padStart(6)}              ×-10 ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  SCORE:    ${Math.round(officialScore).toString().padStart(5)}   GRADE: ${officialScore>=80000?'S+':officialScore>=70000?'S':officialScore>=60000?'A+':officialScore>=50000?'A':'B'}            ║`);
  console.log(`║  Leaderboard: ${survived>0?'🟢 ALIVE':'☠ DEAD'}               ║`);
  console.log('╚══════════════════════════════════════════╝');

  if(scores.length>0){
    console.log(`\nPer-run score distribution:`);
    console.log(`  Min: ${scores[0]} | P25: ${scores[Math.floor(scores.length*0.25)]} | Median: ${scores[Math.floor(scores.length*0.5)]} | P75: ${scores[Math.floor(scores.length*0.75)]} | Max: ${scores[scores.length-1]}`);
  }
}

console.log('\n═══════════════════════════════════════════════');