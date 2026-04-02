#!/usr/bin/env node
/**
 * GAUNTLET BALANCED OPTIMIZED — Smart Balance of Modules + Perfect Survival
 * 
 * Goal: Optimize for higher module count while maintaining 100% survival
 * Lesson learned: The hypermax strategy was too aggressive with power thresholds
 * New strategy: Conservative power thresholds, strategic module timing
 * Target: 13+ median modules, 100% survival, 86,000+ score
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
      if(h.type==='equipment_fatigue'&&h.target==='isru_plant') st.ie=Math.max(0.1,st.ie-(h.degradation||0.005));
      if(h.type==='equipment_fatigue'&&h.target==='greenhouse_dome') st.ge=Math.max(0.1,st.ge-(h.degradation||0.005));
      if(h.type==='contamination'&&h.target==='water_system'&&R()<(h.probability||0.1)) st.h2o=Math.max(0,st.h2o-Math.max(1,st.h2o*0.1));
      if(h.type==='contamination'&&h.target==='food_system'&&R()<(h.probability||0.1)) st.food=Math.max(0,st.food-Math.max(1,st.food*0.1));
    }
  }
  for(let i=st.ev.length-1; i>=0; i--) if(--st.ev[i].r<=0) st.ev.splice(i,1);

  st.crew.forEach(c=>{
    if(!c.a) return;
    let dmg=0.1;
    if(st.power<60) dmg+=Math.max(0,60-st.power)*0.01;
    if(st.it<260||st.it>320) dmg+=0.2;
    if(st.ev.some(e=>e.t==='solar_flare'||e.t==='dust_storm')) dmg+=0.5;
    c.hp=Math.max(0,c.hp-dmg);
    if(c.hp<=0) c.a=false;
  });

  st.it = 273.15 + (st.alloc.h * st.power * 0.025);
  
  const o2d=Math.max(0,st.o2-nh*OP*7), hd=Math.max(0,st.h2o-nh*HP*7), fd=Math.max(0,st.food-nh*FP*7);
  const a = {h: st.alloc.h, i: st.alloc.i, g: st.alloc.g, r: st.alloc.r};

  // BALANCED CRI-ADAPTIVE GOVERNOR 
  // Based on proven quantum strategy but with efficiency optimizations
  const cri = st.cri;
  const criticalZone = sol >= 380;  
  const lateGame = sol >= 280;
  const midGame = sol >= 150;
  
  const ultraHigh = cri >= 75;
  const highRisk = cri >= 50;
  const mediumRisk = cri >= 25;

  // Conservative power safety with optimization opportunities
  const powerSafe = st.power > 200; // Safe to optimize
  const powerAbundant = st.power > 350; // Very safe to optimize
  
  if(criticalZone) {
    // Critical zone: prioritize survival with power-based optimization
    if(ultraHigh) {
      a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.8;
    } else if(highRisk) {
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.6;
    } else if(powerAbundant) {
      a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.3; // Optimize with abundance
    } else if(powerSafe) {
      a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.4;
    } else {
      a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.5; // Conservative
    }
  } else if(lateGame) {
    // Late game: prepare for critical zone
    if(ultraHigh) {
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.6;
    } else if(highRisk) {
      a.h=0.40; a.i=0.40; a.g=0.20; a.r=1.4;
    } else if(powerAbundant) {
      a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.2; // Efficiency with safety
    } else if(powerSafe) {
      a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.3;
    } else {
      a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.4;
    }
  } else if(midGame) {
    // Mid game: balanced growth with safety
    if(ultraHigh) {
      a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.4;
    } else if(highRisk) {
      a.h=0.35; a.i=0.40; a.g=0.25; a.r=1.3;
    } else if(mediumRisk) {
      if(powerAbundant) {
        a.h=0.20; a.i=0.40; a.g=0.40; a.r=1.1; // Efficient growth
      } else {
        a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.2;
      }
    } else {
      if(powerAbundant) {
        a.h=0.18; a.i=0.42; a.g=0.40; a.r=1.0; // Optimized growth
      } else {
        a.h=0.22; a.i=0.40; a.g=0.38; a.r=1.1;
      }
    }
  } else {
    // Early game: maximum efficiency with power safety
    if(ultraHigh) {
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.4;
    } else if(highRisk) {
      a.h=0.35; a.i=0.40; a.g=0.25; a.r=1.3;
    } else if(mediumRisk) {
      a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.2;
    } else {
      if(powerAbundant) {
        a.h=0.15; a.i=0.42; a.g=0.43; a.r=0.9; // Maximum early efficiency
      } else if(powerSafe) {
        a.h=0.18; a.i=0.40; a.g=0.42; a.r=1.0;
      } else {
        a.h=0.22; a.i=0.40; a.g=0.38; a.r=1.1;
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

  // Enhanced repair protocols (from quantum strategy)
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    const baseRepair = 0.005;
    const exponentialBonus = Math.pow(1.47, repairCount - 1); // Slightly enhanced scaling
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

  // Consumption
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*a.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);

  // BALANCED BUILD ORDER - Conservative thresholds with strategic module addition
  // Start with proven quantum timings, add ONE extra solar strategically
  
  // Proven early foundation (from quantum strategy)
  if(sol===3&&st.power>15)         {st.mod.push('solar_farm')}     // Proven timing
  else if(sol===7&&st.power>25)    {st.mod.push('solar_farm')}     // Proven timing  
  else if(sol===12&&st.power>35)   {st.mod.push('solar_farm')}     // Proven timing
  else if(sol===18&&st.power>45)   {st.mod.push('solar_farm')}     // Proven timing
  
  // Revolutionary early repair bay (proven)
  else if(sol===25&&st.power>55)   {st.mod.push('repair_bay')}     // Proven timing
  
  // Continue proven progression
  else if(sol===35&&st.power>70)   {st.mod.push('solar_farm')}     // 5th solar (proven)
  else if(sol===50&&st.power>90)   {st.mod.push('solar_farm')}     // 6th solar (proven)
  else if(sol===70&&st.power>110)  {st.mod.push('repair_bay')}     // 2nd repair (proven)
  else if(sol===95&&st.power>140)  {st.mod.push('solar_farm')}     // 7th solar (proven)
  else if(sol===125&&st.power>180) {st.mod.push('repair_bay')}     // 3rd repair (proven)
  
  // STRATEGIC ADDITION: One extra solar farm with safe timing and high threshold
  else if(sol===150&&st.power>250) {st.mod.push('solar_farm')}     // NEW: 8th solar (conservative)
  
  // Continue proven mid-game
  else if(sol===160&&st.power>280) {st.mod.push('solar_farm')}     // 9th solar (adjusted timing)
  else if(sol===200&&st.power>320) {st.mod.push('repair_bay')}     // 4th repair (proven)
  else if(sol===250&&st.power>400) {st.mod.push('solar_farm')}     // 10th solar (proven)
  else if(sol===300&&st.power>500) {st.mod.push('repair_bay')}     // 5th repair (proven)

  // CRI calculation
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    +(o2d<5?20:0)+(hd<5?20:0)+(fd<5?20:0)));

  // Death conditions
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
      {n:'BALANCED-01',bot:true,hp:100,mr:100,a:true},
      {n:'BALANCED-02',bot:true,hp:100,mr:100,a:true}
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

// Monte Carlo simulation
function runMonteCarloGauntlet(frames, totalSols, runs){
  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, 31337+i));
  }
  
  const survivors = results.filter(r=>r.alive);
  const sols = results.map(r=>r.sols);
  const modules = results.map(r=>r.modules);
  const cris = results.map(r=>r.cri);
  const crews = results.map(r=>r.crew);
  
  sols.sort((a,b)=>a-b);
  modules.sort((a,b)=>a-b);
  cris.sort((a,b)=>a-b);
  
  const p25 = (arr, p) => arr[Math.floor(arr.length * p / 100)];
  
  const survivalRate = survivors.length / results.length * 100;
  const medianSols = p25(sols, 50);
  const medianModules = p25(modules, 50);
  const p75CRI = p25(cris, 75);
  const minCrewAlive = Math.min(...crews);
  
  // Official scoring formula
  const score = medianSols * 100 + minCrewAlive * 500 + medianModules * 150 + 
                survivalRate * 200 * 100 + p75CRI * -10;
  
  return {
    survivalRate, results, medianSols, medianModules, p75CRI, 
    minCrewAlive, score, survivors
  };
}

// Main execution
function main(){
  const {frames, totalSols} = loadFrames();
  
  const args = process.argv.slice(2);
  const monteCarlo = args.includes('--monte-carlo');
  const runs = monteCarlo ? parseInt(args[args.indexOf('--monte-carlo') + 1]) || 10 : 1;
  
  console.log('═══════════════════════════════════════════════');
  if(monteCarlo){
    console.log(`  BALANCED OPTIMIZED: ${runs} runs × ${totalSols} frames`);
    console.log('═══════════════════════════════════════════════');
    
    const mc = runMonteCarloGauntlet(frames, totalSols, runs);
    
    console.log(`\nSURVIVAL RATE: ${mc.survivalRate.toFixed(1)}% (${mc.survivors.length}/${runs} survived all ${totalSols} sols)`);
    console.log(`\nAverage sols survived: ${mc.medianSols}`);
    console.log(`Average HP (survivors): ${mc.survivors.length > 0 ? Math.round(mc.survivors.reduce((s,r)=>s+r.hp,0)/mc.survivors.length) : 'N/A'}`);
    
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║     BALANCED OPTIMIZATION SCORE          ║');
    console.log('║     (Conservative + Strategic)          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Median sols:    ${String(mc.medianSols).padStart(8)}         ×100 ║`);
    console.log(`║  Min crew alive: ${String(mc.minCrewAlive).padStart(8)}         ×500 ║`);
    console.log(`║  Median modules: ${String(mc.medianModules).padStart(8)}         ×150 ║`);
    console.log(`║  Survival rate:  ${String(mc.survivalRate.toFixed(1)+'%').padStart(8)}    ×200×100 ║`);
    console.log(`║  P75 CRI:        ${String(mc.p75CRI).padStart(8)}         ×-10 ║`);
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  SCORE:    ${String(Math.round(mc.score)).padStart(8)}   GRADE: ${mc.score > 90000 ? 'S++' : mc.score > 85000 ? 'S+' : mc.score > 80000 ? 'S' : 'A+'}    ║`);
    console.log(`║  Status: ${mc.survivalRate === 100 ? '🟢 ALIVE' : mc.survivalRate > 90 ? '🟡 VIABLE' : '☠ FAILING'}               ║`);
    console.log('╚══════════════════════════════════════════╝');
    
    const scores = mc.results.map(r => {
      const s = r.sols * 100 + r.crew * 500 + r.modules * 150 + (r.alive ? 20000 : 0) + r.cri * -10;
      return s;
    });
    scores.sort((a,b)=>a-b);
    console.log(`\nPer-run score distribution:`);
    console.log(`  Min: ${scores[0]} | P25: ${scores[Math.floor(scores.length*0.25)]} | Median: ${scores[Math.floor(scores.length*0.5)]} | P75: ${scores[Math.floor(scores.length*0.75)]} | Max: ${scores[scores.length-1]}`);
    
  } else {
    console.log(`  BALANCED OPTIMIZED: All ${totalSols} frames, single run`);
    console.log('═══════════════════════════════════════════════');
    
    const result = runGauntlet(frames, totalSols, 31337);
    
    if(result.alive){
      console.log(`\n🟢 ALIVE at sol ${result.sols}`);
      console.log(`Crew: ${result.crew}/2 | HP:${result.hp} | Power:${result.power} | Solar:${result.solarEff}% | CRI:${result.cri}`);
      const score = result.sols * 100 + result.crew * 500 + result.modules * 150 + 20000 + result.cri * -10;
      console.log(`Score: ${score} | Modules: ${result.modules}`);
    } else {
      console.log(`\n☠ DEAD at sol ${result.sols}: ${result.cause}`);
      console.log(`Crew: ${result.crew}/2 | HP:${result.hp} | Power:${result.power} | Solar:${result.solarEff}% | CRI:${result.cri}`);
      const score = result.sols * 100 + result.crew * 500 + result.modules * 150 + result.cri * -10;
      console.log(`Score: ${score} | Modules: ${result.modules}`);
    }
  }
  
  console.log('═══════════════════════════════════════════════');
}

if(require.main === module){
  main();
}

module.exports = {runGauntlet, runMonteCarloGauntlet, loadFrames};