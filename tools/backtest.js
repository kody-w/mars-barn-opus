#!/usr/bin/env node
/**
 * Backtest Runner — Run a cartridge's governor strategy against different frame versions.
 * 
 * The same governor program, the same starting config, but against frames with
 * increasing fidelity. The delta between versions = what the governor needs to learn.
 *
 * Usage:
 *   node tools/backtest.js                          # run v1 best against all versions
 *   node tools/backtest.js --cartridge run.json     # specific cartridge
 *   node tools/backtest.js --governor "(begin ...)"  # specific LisPy program
 */

const fs = require('fs');
const path = require('path');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const O2_PP=0.84, H2O_PP=2.5, FOOD_PP=2500, PCRIT=50, PANEL=15, EFF=0.22, SOL_H=12.3;
const ISRU_O2=2.8, ISRU_H2O=1.2, GH_KCAL=3500;

function rng32(s){let t=s&0xFFFFFFFF;return()=>{t=(t*1664525+1013904223)&0xFFFFFFFF;return t/0xFFFFFFFF}}

function solIrr(sol,dust){
  const y=sol%669,a=2*Math.PI*(y-445)/669;
  return 589*(1+0.09*Math.cos(a))*Math.max(0.3,Math.cos(2*Math.PI*y/669)*0.5+0.5)*(dust?0.25:1);
}

function loadAllFrames(){
  const mn = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR, 'manifest.json')));
  const frames = {};
  for(const e of mn.frames){
    frames[e.sol] = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR, `sol-${String(e.sol).padStart(4,'0')}.json`)));
  }
  return {manifest: mn, frames};
}

function runWithGovernor(frames, maxSol, strategy){
  let R = rng32(42);
  const st = {
    sol:0, alive:true, cause:null, power:800, se:1, ie:1, ge:1, it:293,
    crew:[{n:'OPT-01',hp:100,mr:100,a:true},{n:'OPT-02',hp:100,mr:100,a:true},
      {n:'OPT-03',hp:100,mr:100,a:true},{n:'OPT-04',hp:100,mr:100,a:true}],
    ev:[], mod:[]
  };
  const BUILD = strategy.buildOrder || ['repair_bay','solar_farm','solar_farm','solar_farm'];
  const buildSols = strategy.buildSols || [5,12,22,40];
  let mi=0, cri=10;
  const log = [];

  for(let sol=1; sol<=maxSol && st.alive; sol++){
    st.sol = sol;
    const f = frames[sol];
    const ac = st.crew.filter(c=>c.a), n=ac.length;
    if(!n){st.alive=false;st.cause='no crew';break}

    // Apply frame data
    let newHazardTypes = [];
    if(f){
      if(f.events) for(const e of f.events) if(!st.ev.some(x=>x.t===e.type))
        st.ev.push({t:e.type,sv:e.severity||0.5,r:e.duration_sols||3});
      if(f.hazards) for(const h of f.hazards){
        if(h.type==='equipment_fatigue'&&h.target==='solar_array') st.se=Math.max(0.1,st.se-(h.degradation||0.005));
        if(h.type==='dust_accumulation') st.se=Math.max(0.1,st.se-(h.degradation||0.01));
        // v2 hazards — robot killers
        if(h.type==='perchlorate_corrosion'){ st.ie=Math.max(0.3,st.ie-(h.degradation||0.005)); newHazardTypes.push('perchlorate')}
        if(h.type==='regolith_abrasion'){ st.se=Math.max(0.3,st.se-(h.degradation||0.003)); newHazardTypes.push('abrasion')}
        if(h.type==='electrostatic_dust'){ st.se=Math.max(0.3,st.se-(h.degradation||0.002)); newHazardTypes.push('electrostatic')}
        if(h.type==='thermal_fatigue'){ st.power=Math.max(0,st.power-5); newHazardTypes.push('thermal_fatigue')}
        if(h.type==='radiation_seu'){ const alive2=st.crew.filter(c=>c.a&&c.hp>0); if(alive2.length>0){alive2[0].hp-=3;} newHazardTypes.push('radiation_seu')}
        if(h.type==='battery_degradation'){ st.power*=0.98; newHazardTypes.push('battery_deg')}
      }
    }
    st.ev=st.ev.filter(e=>{e.r--;return e.r>0});
    if(R()<0.012){st.ie*=(1-0.02);st.power-=2}

    // Repair bay
    if(st.mod.includes('repair_bay')){st.se=Math.min(1,st.se+0.005);st.ie=Math.min(1,st.ie+0.003)}

    // Production
    const isDust=st.ev.some(e=>e.t==='dust_storm');
    const sb=1+st.mod.filter(x=>x==='solar_farm').length*0.4;
    st.power+=solIrr(sol,isDust)*PANEL*EFF*SOL_H/1000*st.se*sb;
    st.power=Math.max(0,st.power-n*5-st.mod.length*3);
    st.it=Math.max(200,Math.min(310,st.it+(st.power>30?0.5:-0.5)));

    ac.forEach(c=>{
      if(st.it<250)c.hp-=0.3;
      if(st.power<=0)c.hp-=1;
      c.hp=Math.min(100,c.hp+0.5);
      if(c.hp<=0)c.a=false;
    });

    if(buildSols.includes(sol)&&mi<BUILD.length&&st.power>30){st.mod.push(BUILD[mi]);mi++}
    cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6));
    if(!ac.filter(c=>c.a).length){st.alive=false;st.cause='all robots offline'}

    if(newHazardTypes.length){
      log.push({sol, hazards:newHazardTypes, hp:Math.round(ac[0]?.hp||0), power:Math.round(st.power), se:Math.round(st.se*100)});
    }
  }

  return {
    sols: st.sol,
    alive: st.alive,
    cause: st.cause,
    crew: st.crew.filter(c=>c.a).length,
    power: Math.round(st.power),
    solarEff: Math.round(st.se*100),
    modules: st.mod.length,
    cri,
    newHazardLog: log
  };
}

// ── Main ──
const {manifest, frames} = loadAllFrames();
const totalSols = manifest.last_sol;

// Load version registry
const versions = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','frame-versions','versions.json')));

const strategy = {
  buildOrder: ['repair_bay','solar_farm','solar_farm','solar_farm'],
  buildSols: [5,12,22,40]
};

console.log('═══════════════════════════════════════════════════');
console.log('  BACKTEST: v1 Best Strategy vs All Frame Versions');
console.log('═══════════════════════════════════════════════════\n');
console.log('Strategy: Optimus 4 robots, repair_bay→solar×3\n');

// Run against v1 frames only (Sol 1-161)
const v1Result = runWithGovernor(frames, 161, strategy);
console.log('v1 (Sol 1-161): ' + (v1Result.alive?'🟢 ALIVE':'☠ '+v1Result.cause) +
  ' at sol ' + v1Result.sols + ' | Power:' + v1Result.power + ' Solar:' + v1Result.solarEff + '%');

// Run against ALL frames including v2 (Sol 1-201)
const v2Result = runWithGovernor(frames, totalSols, strategy);
console.log('v2 (Sol 1-'+totalSols+'): ' + (v2Result.alive?'🟢 ALIVE':'☠ '+v2Result.cause) +
  ' at sol ' + v2Result.sols + ' | Power:' + v2Result.power + ' Solar:' + v2Result.solarEff + '%');

// Delta analysis
console.log('\n── DELTA ANALYSIS ──');
const delta = v1Result.sols === 161 && v2Result.alive ? 0 : v2Result.sols - v1Result.sols;
if(v1Result.alive && v2Result.alive){
  console.log('Both alive. The v1 strategy survived v2 frames!');
  console.log('But check the degradation:');
} else if(v1Result.alive && !v2Result.alive){
  console.log('v1 strategy DIED in v2 at sol ' + v2Result.sols);
  console.log('The sim grew. The governor needs to evolve.');
} else {
  console.log('Delta: ' + delta + ' sols');
}

console.log('\n── NEW HAZARDS ENCOUNTERED ──');
if(v2Result.newHazardLog.length){
  const typeCounts = {};
  v2Result.newHazardLog.forEach(l=>{
    l.hazards.forEach(h=>typeCounts[h]=(typeCounts[h]||0)+1);
  });
  Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).forEach(([type,count])=>{
    console.log('  ' + type + ': ' + count + ' occurrences');
  });
  console.log('\nFirst v2 hazard hit: Sol ' + v2Result.newHazardLog[0].sol);
  console.log('Hazards at death/end:');
  v2Result.newHazardLog.slice(-3).forEach(l=>{
    console.log('  Sol ' + l.sol + ': ' + l.hazards.join(', ') + ' (HP:' + l.hp + ' Pwr:' + l.power + ' Solar:' + l.se + '%)');
  });
} else {
  console.log('No v2 hazards encountered (colony died before sol 162?)');
}

console.log('\n── WHAT THE GOVERNOR NEEDS TO LEARN ──');
if(v2Result.newHazardLog.some(l=>l.hazards.includes('perchlorate')))
  console.log('  → Handle perchlorate: schedule joint inspections, reduce actuator cycling');
if(v2Result.newHazardLog.some(l=>l.hazards.includes('abrasion')))
  console.log('  → Handle abrasion: clean optics regularly, build backup sensors');
if(v2Result.newHazardLog.some(l=>l.hazards.includes('electrostatic')))
  console.log('  → Handle electrostatic: periodic discharge protocol, anti-static coatings');
if(v2Result.newHazardLog.some(l=>l.hazards.includes('radiation_seu')))
  console.log('  → Handle radiation: ECC memory, triple-redundancy voting, safe mode protocol');
if(v2Result.newHazardLog.some(l=>l.hazards.includes('battery_deg')))
  console.log('  → Handle battery: thermal management, reduced charge cycles, power conservation');

console.log('\n═══════════════════════════════════════════════════');
