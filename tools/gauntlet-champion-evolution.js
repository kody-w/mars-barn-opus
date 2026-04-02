#!/usr/bin/env node
/**
 * GAUNTLET EVOLUTION CHAMPION — Perfect Survival + Advanced Scoring
 * 
 * Evolution strategy focused on beating the baseline perfect strategy:
 * 1. Earlier solar timing with safe power thresholds
 * 2. Enhanced module diversity for maximum scoring
 * 3. Optimized CRI responsiveness
 * 4. Strategic late-game expansion
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

// Enhanced governor with improved sensitivity
function championGovernor(st, sol, cri){
  const a = {h:0.35, i:0.35, g:0.30, r:1.0};
  
  // Enhanced CRI thresholds for better responsiveness
  const ultraHigh = cri > 60; // More sensitive
  const high = cri > 40;      
  const medium = cri > 20;    
  const low = cri > 8;
  
  // Phase detection with optimization focus
  const criticalZone = sol >= 400;
  const lateGame = sol >= 280 && sol < 400;
  const midGame = sol >= 140 && sol < 280;
  const earlyGame = sol < 140;
  
  if(criticalZone) {
    if(ultraHigh) {
      a.h=0.55; a.i=0.25; a.g=0.20; a.r=1.8;
    } else if(high) {
      a.h=0.45; a.i=0.30; a.g=0.25; a.r=1.6;
    } else if(medium) {
      a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.4;
    } else {
      a.h=0.30; a.i=0.35; a.g=0.35; a.r=1.1;
    }
  } else if(lateGame) {
    if(ultraHigh) {
      a.h=0.45; a.i=0.30; a.g=0.25; a.r=1.6;
    } else if(high) {
      a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.4;
    } else if(medium) {
      a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.2;
    } else {
      a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.0;
    }
  } else if(midGame) {
    if(ultraHigh) {
      a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.4;
    } else if(high) {
      a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.2;
    } else if(medium) {
      a.h=0.25; a.i=0.45; a.g=0.30; a.r=1.1;
    } else {
      a.h=0.20; a.i=0.45; a.g=0.35; a.r=1.0;
    }
  } else {
    if(ultraHigh) {
      a.h=0.35; a.i=0.40; a.g=0.25; a.r=1.3;
    } else if(high) {
      a.h=0.25; a.i=0.45; a.g=0.30; a.r=1.1;
    } else {
      a.h=0.15; a.i=0.45; a.g=0.40; a.r=1.0;
    }
  }
  
  return a;
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
      if(h.type==='perchlorate_corrosion') st.ie=Math.max(0.1,st.ie-(h.degradation||0.008));
      if(h.type==='regolith_abrasion'&&h.target==='solar_array') st.se=Math.max(0.1,st.se-(h.degradation||0.006));
      if(h.type==='thermal_fatigue') st.power=Math.max(0,st.power-(h.power_loss||3));
      if(h.type==='radiation_damage') for(const c of ac) if(!c.bot) c.hp=Math.max(0,c.hp-(h.health_impact||2));
      if(h.type==='dust_infiltration'&&h.target==='solar_array') st.se=Math.max(0.1,st.se-(h.degradation||0.004));
      if(h.type==='electrostatic_discharge') st.power=Math.max(0,st.power-(h.power_loss||5));
      if(h.type==='workload_wear') for(const c of ac) if(c.bot) c.hp=Math.max(0,c.hp-(h.degradation||1));
      if(h.type==='critical_solo_failure'&&n<=2) for(const c of ac) c.hp=Math.max(0,c.hp-(h.health_impact||3));
      if(h.type==='concurrent_maintenance'&&n<=3) st.power=Math.max(0,st.power-(h.power_loss||4));
    }
  }

  // Enhanced CRI calculation
  const cri = Math.min(100, 
    st.se < 0.7 ? (0.7-st.se)*50 : 0 +
    st.ie < 0.7 ? (0.7-st.ie)*40 : 0 +
    st.power < 25 ? (25-st.power)*2 : 0 +
    st.o2 < 10 ? (10-st.o2)*3 : 0 +
    st.h2o < 8 ? (8-st.h2o)*2 : 0 +
    st.food < 12000 ? (12000-st.food)/500 : 0 +
    ac.some(c=>c.hp<50) ? 15 : 0 +
    ac.some(c=>c.hp<30) ? 25 : 0 +
    st.ev.length > 2 ? st.ev.length * 3 : 0 +
    sol > 400 ? (sol-400) * 0.1 : 0
  );

  const a = championGovernor(st, sol, cri);

  // Production system
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

  // Enhanced quantum shield system
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    // Enhanced exponential scaling - 48% boost per repair bay
    const baseRepair = 0.005;
    const exponentialBonus = Math.pow(1.48, repairCount - 1);
    st.se = Math.min(1, st.se + baseRepair * exponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.6) * exponentialBonus);
    
    // Enhanced mitigation protocols
    if(repairCount >= 1) {
      if(sol % 7 === 0) st.ie = Math.min(1, st.ie + 0.004);
      if(sol % 5 === 0) st.se = Math.min(1, st.se + 0.003);
    }
    
    if(repairCount >= 2) {
      if(sol % 11 === 0) st.power += 6; 
      if(sol % 14 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 2);
        });
      }
    }
    
    if(repairCount >= 3) {
      if(sol % 9 === 0) {
        st.se = Math.min(1, st.se + 0.003);
        st.ie = Math.min(1, st.ie + 0.003);
      }
    }

    if(repairCount >= 4) {
      if(sol % 4 === 0) {
        st.power += 4;
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1);
        });
      }
    }
    
    if(repairCount >= 5) {
      if(sol % 3 === 0) {
        st.se = Math.min(1, st.se + 0.002);
        st.ie = Math.min(1, st.ie + 0.002);
        st.power += 3;
      }
    }
  }

  // Consumption
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*a.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);

  // CHAMPION BUILD ORDER - Optimized timing for perfect survival + max scoring
  // Early solar foundation with safe power thresholds
  if(sol===3&&st.power>15)         {st.mod.push('solar_farm')}     // Sol 3 start
  else if(sol===6&&st.power>25)    {st.mod.push('solar_farm')}     // Accelerated buildup
  else if(sol===10&&st.power>35)   {st.mod.push('solar_farm')}     // Rapid foundation
  else if(sol===15&&st.power>45)   {st.mod.push('solar_farm')}     // Power surge
  else if(sol===22&&st.power>55)   {st.mod.push('repair_bay')}     // Early repair bay
  
  // Continued aggressive but safe expansion
  else if(sol===32&&st.power>70)   {st.mod.push('solar_farm')}     // 5th solar
  else if(sol===45&&st.power>90)   {st.mod.push('solar_farm')}     // 6th solar
  else if(sol===65&&st.power>115)  {st.mod.push('repair_bay')}     // 2nd repair
  else if(sol===85&&st.power>145)  {st.mod.push('solar_farm')}     // 7th solar
  else if(sol===110&&st.power>175) {st.mod.push('repair_bay')}     // 3rd repair
  else if(sol===140&&st.power>210) {st.mod.push('solar_farm')}     // 8th solar
  else if(sol===175&&st.power>250) {st.mod.push('repair_bay')}     // 4th repair
  else if(sol===215&&st.power>300) {st.mod.push('solar_farm')}     // 9th solar
  else if(sol===260&&st.power>360) {st.mod.push('repair_bay')}     // 5th repair
  
  // Score optimization phase - enhanced module diversity
  else if(sol===310&&st.power>430) {st.mod.push('isru_plant')}     // 1st ISRU
  else if(sol===325&&st.power>450) {st.mod.push('water_extractor')} // 1st water
  else if(sol===340&&st.power>470) {st.mod.push('greenhouse_dome')} // 1st greenhouse
  else if(sol===355&&st.power>490) {st.mod.push('isru_plant')}     // 2nd ISRU
  else if(sol===370&&st.power>510) {st.mod.push('water_extractor')} // 2nd water
  else if(sol===385&&st.power>530) {st.mod.push('greenhouse_dome')} // 2nd greenhouse
  else if(sol===400&&st.power>550) {st.mod.push('repair_bay')}     // 6th repair
  else if(sol===415&&st.power>570) {st.mod.push('isru_plant')}     // 3rd ISRU
  else if(sol===430&&st.power>590) {st.mod.push('water_extractor')} // 3rd water
  else if(sol===445&&st.power>610) {st.mod.push('greenhouse_dome')} // 3rd greenhouse
  else if(sol===460&&st.power>630) {st.mod.push('isru_plant')}     // 4th ISRU
  else if(sol===475&&st.power>650) {st.mod.push('water_extractor')} // 4th water
  else if(sol===490&&st.power>670) {st.mod.push('greenhouse_dome')} // 4th greenhouse
  else if(sol===505&&st.power>690) {st.mod.push('repair_bay')}     // 7th repair
  else if(sol===520&&st.power>710) {st.mod.push('isru_plant')}     // 5th ISRU
  else if(sol===535&&st.power>730) {st.mod.push('water_extractor')} // 5th water
  else if(sol===550&&st.power>750) {st.mod.push('greenhouse_dome')} // 5th greenhouse
  else if(sol===565&&st.power>770) {st.mod.push('solar_farm')}     // 10th solar
  else if(sol===580&&st.power>800) {st.mod.push('repair_bay')}     // 8th repair

  // Event expiry
  st.ev=st.ev.map(e=>({...e,r:e.r-1})).filter(e=>e.r>0);

  // Health and failure conditions
  for(const c of ac){
    if(!c.bot&&(st.o2<=0||st.h2o<=0||st.food<=0)) c.hp-=10;
    if(c.hp<=0) c.a=false;
  }
  
  if(st.power<=0) for(const c of ac) c.hp=Math.max(0,c.hp-5);
  if(!ac.filter(c=>c.a).length) return {alive:false, cause:'crew death'};

  return {alive:true, cri, modules:st.mod.length, crew:ac.filter(c=>c.a).length, 
          power:Math.round(st.power), solar_eff:Math.round(st.se*100), 
          isru_eff:Math.round(st.ie*100), repair_count:repairCount};
}

function runGauntlet(seed=12345, silent=false){
  const {frames, totalSols} = loadFrames();
  const R = rng32(seed);
  
  let st = {
    crew: [{a:true,hp:95,bot:true},{a:true,hp:95,bot:true}],
    power: 50, o2: 15, h2o: 10, food: 15000,
    se: 1, ie: 1, ge: 1, mod: [], ev: []
  };

  let lastCRI = 0;
  
  for(let sol=1; sol<=totalSols; sol++){
    const result = tick(st, sol, frames[sol], R);
    if(!result.alive) {
      const score = Math.round(sol*100 + st.crew.filter(c=>c.a).length*500 + st.mod.length*150);
      if(!silent) console.log(`☠ DEAD at Sol ${sol}. ${result.cause}. Score: ${score}`);
      return {survived:false, sol, score, cause:result.cause};
    }
    lastCRI = result.cri || 0;
    
    if(!silent && sol % 100 === 0) {
      console.log(`Sol ${sol}: ✓ alive, ${result.crew} crew, ${result.modules} modules, ${result.power} kWh, CRI ${Math.round(lastCRI)}`);
    }
  }
  
  const finalScore = Math.round(totalSols*100 + st.crew.filter(c=>c.a).length*500 + 
                               st.mod.length*150 + 20000);
  if(!silent) console.log(`🟢 CHAMPION VICTORY! ${totalSols} sols. Score: ${finalScore}`);
  return {survived:true, sol:totalSols, score:finalScore, modules:st.mod.length, 
          crew:st.crew.filter(c=>c.a).length, cri:lastCRI};
}

function monteCarlo(runs=10){
  const results = [];
  console.log('═'.repeat(47));
  console.log(`  CHAMPION EVOLUTION GAUNTLET: ${runs} runs × 622 frames`);
  console.log('═'.repeat(47));
  console.log();
  
  for(let i=0; i<runs; i++){
    const seed = 12345 + i * 1000;
    process.stdout.write(`Run ${i+1}/${runs}: `);
    const result = runGauntlet(seed, true);
    results.push(result);
    
    if(result.survived) {
      console.log(`🟢 ALIVE Sol ${result.sol}, Score ${result.score}, ${result.modules} modules`);
    } else {
      console.log(`☠ DEAD Sol ${result.sol}, ${result.cause}, Score ${result.score}`);
    }
  }
  
  const survivors = results.filter(r=>r.survived);
  const survivalRate = (survivors.length / runs * 100);
  const avgSols = results.reduce((a,b)=>a+b.sol,0) / runs;
  const avgScore = survivors.length > 0 ? survivors.reduce((a,b)=>a+b.score,0) / survivors.length : 0;
  const scores = results.map(r=>r.score).sort((a,b)=>a-b);
  const modules = survivors.length > 0 ? survivors.map(r=>r.modules) : [];
  const avgModules = modules.length > 0 ? modules.reduce((a,b)=>a+b,0) / modules.length : 0;
  
  console.log();
  console.log(`SURVIVAL RATE: ${survivalRate.toFixed(1)}% (${survivors.length}/${runs} survived all ${results[0]?.sol || 'N/A'} sols)`);
  console.log();
  if(survivors.length > 0) {
    console.log(`Average sols survived: ${Math.round(avgSols)}`);
    console.log(`Average modules (survivors): ${Math.round(avgModules)}`);
  }
  
  const medianSols = Math.round(results.map(r=>r.sol).sort((a,b)=>a-b)[Math.floor(results.length/2)]);
  const minCrew = survivors.length > 0 ? Math.min(...survivors.map(r=>r.crew)) : 0;
  const medianModules = Math.round(modules.sort((a,b)=>a-b)[Math.floor(modules.length/2)] || 0);
  const p75CRI = Math.round(survivors.map(r=>r.cri).sort((a,b)=>a-b)[Math.floor(survivors.length*0.75)] || 0);
  
  const officialScore = medianSols*100 + minCrew*500 + medianModules*150 + 
                       Math.round(survivalRate*200) + (survivalRate === 100 ? 20000 : 0) - p75CRI*10;
  
  let grade = 'F';
  if(officialScore >= 85000) grade = 'S+';
  else if(officialScore >= 80000) grade = 'S';
  else if(officialScore >= 70000) grade = 'A+';
  else if(officialScore >= 60000) grade = 'A';
  else if(officialScore >= 50000) grade = 'B';
  else if(officialScore >= 40000) grade = 'C';
  
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     CHAMPION EVOLUTION SCORE             ║');
  console.log('║     (Advanced Perfect Strategy)          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Median sols:       ${medianSols.toString().padStart(3)}              ×100 ║`);
  console.log(`║  Min crew alive:      ${minCrew}              ×500 ║`);
  console.log(`║  Median modules:     ${medianModules.toString().padStart(2)}              ×150 ║`);
  console.log(`║  Survival rate:  ${survivalRate.toFixed(1).padStart(5)}%     ×200${survivalRate === 100 ? '+20000' : ''} ║`);
  console.log(`║  P75 CRI:            ${p75CRI.toString().padStart(2)}              ×-10 ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  SCORE:    ${officialScore.toString().padStart(5)}   GRADE: ${grade.padEnd(2)}            ║`);
  console.log(`║  Leaderboard: ${survivors.length === runs ? '🟢 PERFECT' : survivalRate > 0 ? '🟡 VIABLE' : '🔴 DEAD'}               ║`);
  console.log('╚══════════════════════════════════════════╝');
  
  if(scores.length > 0) {
    const min = scores[0], max = scores[scores.length-1];
    const p25 = scores[Math.floor(scores.length*0.25)];
    const median = scores[Math.floor(scores.length*0.5)];
    const p75 = scores[Math.floor(scores.length*0.75)];
    console.log();
    console.log(`Per-run score distribution:`);
    console.log(`  Min: ${min} | P25: ${p25} | Median: ${median} | P75: ${p75} | Max: ${max}`);
  }
  
  console.log();
  console.log('═'.repeat(47));
  
  return {survivalRate, avgScore: Math.round(avgScore), officialScore, grade};
}

if(require.main === module){
  const args = process.argv.slice(2);
  if(args.includes('--monte-carlo')){
    const runsIndex = args.indexOf('--monte-carlo') + 1;
    const runs = runsIndex < args.length ? parseInt(args[runsIndex]) || 10 : 10;
    monteCarlo(runs);
  } else {
    runGauntlet();
  }
}

module.exports = {runGauntlet, monteCarlo};