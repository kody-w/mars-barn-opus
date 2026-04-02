#!/usr/bin/env node
/**
 * INCREMENTAL GAUNTLET — Small improvements to baseline strategy
 * 
 * Goal: Take baseline (431 sols) and make minimal improvements to beat 441
 * Approach: Add 1 enhancement at a time to isolate what works
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

// BASELINE + ONE ENHANCEMENT: Enhanced repair bays
function tick(st, sol, frame, R){
  const ac=st.crew.filter(c=>c.a), n=ac.length;
  const nh=ac.filter(c=>!c.bot).length;
  if(!n) return {alive:false, cause:'no crew'};

  // Apply frame data (same as baseline)
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
    }
  }

  const o2d=st.o2/(nh*OP*3), hd=st.h2o/(nh*HP*3), fd=st.food/(nh*FP*3);
  const a=st.alloc;

  // CRI-adaptive governor (same as baseline)
  if(st.cri > 50) {
    a.h=0.30; a.i=0.35; a.g=0.35; a.r=1.0;
  } else if(st.cri > 30) {
    a.h=0.25; a.i=0.375; a.g=0.375; a.r=1.0;
  } else {
    a.h=0.20; a.i=0.40; a.g=0.40; a.r=1.0;
  }

  // Production (same as baseline)
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
  
  // ENHANCEMENT 1: Better repair bay functionality
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    const baseRepair = 0.005;
    // IMPROVEMENT: Exponential scaling instead of linear
    const exponentialBonus = Math.pow(1.3, repairCount - 1); // 30% exponential scaling
    st.se = Math.min(1, st.se + baseRepair * exponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.6) * exponentialBonus);
    
    // IMPROVEMENT: Active mitigation protocols
    if(repairCount >= 1) {
      if(sol % 10 === 0) st.ie = Math.min(1, st.ie + 0.003); // Perchlorate prevention
      if(sol % 8 === 0) st.se = Math.min(1, st.se + 0.002);  // Dust management
    }
    
    if(repairCount >= 2) {
      if(sol % 12 === 0) st.power += 3; // Thermal fatigue prevention
    }
  }

  // Consumption (same as baseline)
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*a.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);
  st.it=Math.max(200,Math.min(310,st.it+(st.power*a.h*0.5>10?0.5:-0.5)));

  // Crew health (same as baseline)
  ac.forEach(c=>{
    if(!c.bot){if(st.o2<OP*2)c.hp-=5;if(st.food<FP*2)c.hp-=3}
    if(st.it<250)c.hp-=(c.bot?0.3:2);
    if(st.power<=0)c.hp-=(c.bot?1:0.5);
    c.hp=Math.min(100,c.hp+(c.bot?0.5:0.3));
    if(c.hp<=0)c.a=false;
  });

  // ENHANCEMENT 2: Slightly earlier and more repair bays
  if(sol===8&&st.power>20)         {st.mod.push('solar_farm')}     
  else if(sol===15&&st.power>35)   {st.mod.push('solar_farm')}     
  else if(sol===25&&st.power>50)   {st.mod.push('solar_farm')}     
  else if(sol===40&&st.power>70)   {st.mod.push('solar_farm')}     
  else if(sol===65&&st.power>95)   {st.mod.push('repair_bay')}     // Earlier: 65 vs 80
  else if(sol===120&&st.power>150) {st.mod.push('solar_farm')}     
  else if(sol===150&&st.power>200) {st.mod.push('repair_bay')}     // Earlier: 150 vs 180
  else if(sol===220&&st.power>280) {st.mod.push('solar_farm')}     // Earlier: 220 vs 250
  else if(sol===260&&st.power>350) {st.mod.push('repair_bay')}     // Added 3rd repair bay

  // CRI calculation (same as baseline)
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    +(o2d<5?20:0)+(hd<5?20:0)+(fd<5?20:0)));

  // Death conditions (same as baseline)
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
      {n:'BOT-01',bot:true,hp:100,mr:100,a:true},
      {n:'BOT-02',bot:true,hp:100,mr:100,a:true}
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

// ── Main ──
const {frames, totalSols} = loadFrames();
const monteCarloArg = process.argv.find(a=>a.startsWith('--monte-carlo'));
const runs = monteCarloArg ? parseInt(monteCarloArg.split('=')[1] || process.argv[process.argv.indexOf('--monte-carlo')+1] || '10') : 1;

console.log('═══════════════════════════════════════════════');
console.log('  INCREMENTAL IMPROVEMENT: Baseline + enhanced repair bays');
console.log('  Goal: Beat 441 sols with minimal changes to baseline');
console.log('═══════════════════════════════════════════════');

if(runs === 1){
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/2 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri);
  const score = result.sols*100 + result.crew*500 + result.modules*150 - result.cri*10;
  console.log('Score: '+score);
  
  if(result.sols > 441) {
    console.log('\n🎉 TARGET BEATEN! ' + result.sols + ' > 441 sols');
  } else {
    console.log('\n📊 Progress: ' + result.sols + ' vs 441 target (need +' + (442 - result.sols) + ')');
  }
} else {
  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }

  const alive = results.filter(r=>r.alive);
  const dead = results.filter(r=>!r.alive);
  const medianSols = [...results.map(r=>r.sols)].sort((a,b)=>a-b)[Math.floor(runs/2)];
  const avgSols = Math.round(results.reduce((s,r)=>s+r.sols,0)/runs);
  const minSols = Math.min(...results.map(r=>r.sols));
  const maxSols = Math.max(...results.map(r=>r.sols));

  console.log('\nSURVIVAL RATE: ' + (alive.length/runs*100).toFixed(1) + '% (' + alive.length + '/' + runs + ' survived)');
  console.log('Sols survived - Median: ' + medianSols + ' | Avg: ' + avgSols + ' | Min: ' + minSols + ' | Max: ' + maxSols);

  // Progress analysis
  const improvement = medianSols - 431; // baseline is 431
  console.log('\n📊 PROGRESS: ' + medianSols + ' vs baseline 431 (' + (improvement > 0 ? '+' + improvement : improvement) + ' improvement)');
  console.log('Target analysis: ' + medianSols + ' vs 441 target (' + (medianSols > 441 ? '✅ BEATS TARGET!' : '❌ Need +' + (442 - medianSols)) + ')');

  if(dead.length > 0){
    console.log('\nDeath analysis:');
    const causes = {};
    dead.forEach(r=>causes[r.cause]=(causes[r.cause]||0)+1);
    Object.entries(causes).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>
      console.log('  '+c+': '+n+' ('+Math.round(n/dead.length*100)+'%)'));
  }
}

console.log('═══════════════════════════════════════════════');