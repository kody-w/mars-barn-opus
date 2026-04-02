#!/usr/bin/env node
/**
 * POWER SURGE BREAKTHROUGH — Challenge the 441-sol wall
 * 
 * Key insight from field notes: Power abundance beats precision repair.
 * Strategy: Ultra-aggressive solar buildup + strategic repair timing.
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

  // Apply frame hazards
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

  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // POWER SURGE GOVERNOR: Enhanced CRI with aggressive allocation
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  
  if(st.power<20)       {a.h=0.85;a.i=0.10;a.g=0.05;a.r=0.2}
  else if(o2d<2.5)      {a.h=0.04;a.i=0.92;a.g=0.04;a.r=0.2}
  else if(hd<3.5)       {a.h=0.06;a.i=0.88;a.g=0.06;a.r=0.3}
  else if(fd<6)         {a.h=0.08;a.i=0.18;a.g=0.74;a.r=0.5}
  else {
    // POWER SURGE: CRI-adaptive but focused on abundance
    const criticalZone = sol > 380;
    const lateGame = sol > 320;
    const highRisk = st.cri > 45;      // Slightly more sensitive
    const mediumRisk = st.cri > 25;    // More sensitive
    
    if(criticalZone && highRisk) {
      a.h=0.65; a.i=0.25; a.g=0.10; a.r=2.2;  // Survival mode
    } else if(criticalZone) {
      a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.8;  // Critical defensive
    } else if(lateGame && highRisk) {
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.6;  // Late defensive
    } else if(lateGame) {
      a.h=0.35; a.i=0.40; a.g=0.25; a.r=1.4;  // Late balanced
    } else if(highRisk) {
      a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.4;  // Early defensive
    } else if(mediumRisk) {
      a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.2;  // Early balanced
    } else {
      a.h=0.15; a.i=0.40; a.g=0.45; a.r=1.0;  // Growth mode
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
  
  // Enhanced repair bay with active mitigation
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    const baseRepair = 0.006;  // Slightly stronger
    const exponentialBonus = Math.pow(1.35, repairCount - 1);
    st.se = Math.min(1, st.se + baseRepair * exponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.7) * exponentialBonus);
    
    // Active mitigation protocols
    if(repairCount >= 1) {
      if(sol % 10 === 0) st.ie = Math.min(1, st.ie + 0.004);
      if(sol % 8 === 0) st.se = Math.min(1, st.se + 0.003);
    }
    if(repairCount >= 2) {
      if(sol % 12 === 0) st.power += 4;
      if(sol % 18 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.5);
        });
      }
    }
    if(repairCount >= 3) {
      if(sol % 6 === 0) {
        st.se = Math.min(1, st.se + 0.002);
        st.ie = Math.min(1, st.ie + 0.003);
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

  // POWER SURGE BUILD STRATEGY: Ultra-aggressive solar rush
  if(sol===4&&st.power>15)         {st.mod.push('solar_farm')}     // Ultra-early start
  else if(sol===8&&st.power>25)    {st.mod.push('solar_farm')}     // Rapid acceleration  
  else if(sol===14&&st.power>40)   {st.mod.push('solar_farm')}     // Power foundation
  else if(sol===22&&st.power>55)   {st.mod.push('solar_farm')}     // 4 farms by sol 22!
  else if(sol===35&&st.power>75)   {st.mod.push('solar_farm')}     // 5th farm early
  else if(sol===55&&st.power>100)  {st.mod.push('repair_bay')}     // First repair
  else if(sol===80&&st.power>130)  {st.mod.push('solar_farm')}     // 6th farm
  else if(sol===120&&st.power>170) {st.mod.push('repair_bay')}     // 2nd repair
  else if(sol===170&&st.power>220) {st.mod.push('solar_farm')}     // 7th farm
  else if(sol===230&&st.power>280) {st.mod.push('repair_bay')}     // 3rd repair

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
      {n:'SURGE-01',bot:true,hp:100,mr:100,a:true},
      {n:'SURGE-02',bot:true,hp:100,mr:100,a:true}
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
const runs = monteCarloArg ? parseInt(monteCarloArg.split('=')[1] || process.argv[process.argv.indexOf('--monte-carlo')+1] || '50') : 1;

console.log('═══════════════════════════════════════════════');
console.log('  POWER SURGE BREAKTHROUGH: Ultra-Aggressive Solar');
console.log('  Strategy: Power abundance beats precision repair');
console.log('═══════════════════════════════════════════════\n');

if(runs === 1){
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/2 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri);
  console.log('Modules: '+result.modules);
  const score = result.sols*100 + result.crew*500 + result.modules*150 - result.cri*10;
  console.log('Score: '+score);
} else {
  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }

  const alive = results.filter(r=>r.alive);
  const dead = results.filter(r=>!r.alive);
  const avgSols = Math.round(results.reduce((s,r)=>s+r.sols,0)/runs);
  const medianSols = results.map(r=>r.sols).sort((a,b)=>a-b)[Math.floor(runs/2)];
  const maxSols = Math.max(...results.map(r=>r.sols));
  const survivalPct = (alive.length/runs*100).toFixed(1);

  console.log('SURVIVAL RATE: ' + survivalPct + '% (' + alive.length + '/' + runs + ' survived)');
  console.log('Results: Median=' + medianSols + ' | Average=' + avgSols + ' | Best=' + maxSols + ' sols');

  if(dead.length){
    console.log('\nDeath analysis:');
    const causes = {};
    dead.forEach(r=>causes[r.cause]=(causes[r.cause]||0)+1);
    Object.entries(causes).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>
      console.log('  '+c+': '+n));
    
    const deathSols = dead.map(r=>r.sols);
    console.log('Death sol range: ' + Math.min(...deathSols) + '-' + Math.max(...deathSols));
  }

  const improvement = medianSols - 441;
  
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     POWER SURGE CHALLENGE RESULTS       ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Target:    441 sols                    ║');
  console.log('║  Median:    ' + String(medianSols).padStart(3) + ' sols (' + (improvement > 0 ? '+' + improvement : improvement) + ')             ║');
  console.log('║  Best run:  ' + String(maxSols).padStart(3) + ' sols                     ║');
  console.log('║  Status:    ' + (medianSols > 441 ? '🟢 BREAKTHROUGH!' : '☠ WALL HOLDS') + '                ║');
  console.log('╚══════════════════════════════════════════╝');
}