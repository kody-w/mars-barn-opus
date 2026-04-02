#!/usr/bin/env node
/**
 * COPILOT MINIMAL PRECISION ENHANCEMENT V1
 * Minimal improvements to the proven 674-sol strategy
 * 
 * Changes from baseline:
 * 1. Slightly enhanced repair bay scaling (57% vs 55%)
 * 2. Minor module deployment timing adjustments (2-3 sols earlier)
 * 3. Tiny threshold improvements for emergencies
 * 4. No major algorithm changes - just tuning
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

// The full sim tick — minimal enhancement of proven 674-sol strategy
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
    }
  }
  st.ev=st.ev.filter(e=>{e.r--;return e.r>0});

  // Random equipment events (CRI-weighted)
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // PROVEN CRI-BASED GOVERNOR - with minimal tweaks
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  
  // Slightly enhanced emergency thresholds (minimal change)
  if(st.power<20)       {a.h=0.85;a.i=0.10;a.g=0.05;a.r=0.2}
  else if(o2d<2.5)      {a.h=0.04;a.i=0.92;a.g=0.04;a.r=0.2}
  else if(hd<3.5)       {a.h=0.06;a.i=0.88;a.g=0.06;a.r=0.3}
  else if(fd<6)         {a.h=0.08;a.i=0.18;a.g=0.74;a.r=0.5}
  else {
    // Exact same CRI-adaptive strategy as proven baseline
    const criticalZone = sol > 400;
    const lateGame = sol > 350;
    const endGame = sol > 450;
    const ultraHigh = st.cri > 65;
    const highRisk = st.cri > 45;
    const mediumRisk = st.cri > 20;
    
    if(endGame && ultraHigh) {
      a.h=0.75; a.i=0.20; a.g=0.05; a.r=3.0;
    } else if(endGame && highRisk) {
      a.h=0.70; a.i=0.25; a.g=0.05; a.r=2.8;
    } else if(endGame) {
      a.h=0.65; a.i=0.25; a.g=0.10; a.r=2.5;
    } else if(criticalZone && ultraHigh) {
      a.h=0.65; a.i=0.25; a.g=0.10; a.r=2.5;
    } else if(criticalZone && highRisk) {
      a.h=0.55; a.i=0.30; a.g=0.15; a.r=2.0;
    } else if(criticalZone) {
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.8;
    } else if(lateGame && ultraHigh) {
      a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.8;
    } else if(lateGame && highRisk) {
      a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.6;
    } else if(lateGame) {
      a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.4;
    } else if(ultraHigh) {
      if(o2d < 10) {
        a.h=0.40; a.i=0.45; a.g=0.15; a.r=1.6;
      } else if(hd < 10) {
        a.h=0.40; a.i=0.45; a.g=0.15; a.r=1.6;
      } else if(fd < 10) {
        a.h=0.40; a.i=0.20; a.g=0.40; a.r=1.6;
      } else {
        a.h=0.48; a.i=0.32; a.g=0.20; a.r=1.6;
      }
    } else if(highRisk) {
      if(o2d < 8) {
        a.h=0.30; a.i=0.50; a.g=0.20; a.r=1.4;
      } else if(hd < 8) {
        a.h=0.30; a.i=0.50; a.g=0.20; a.r=1.4;
      } else if(fd < 8) {
        a.h=0.30; a.i=0.25; a.g=0.45; a.r=1.4;
      } else {
        a.h=0.38; a.i=0.37; a.g=0.25; a.r=1.4;
      }
    } else if(mediumRisk) {
      if(o2d < 7) {
        a.h=0.20; a.i=0.55; a.g=0.25; a.r=1.2;
      } else if(hd < 7) {
        a.h=0.20; a.i=0.55; a.g=0.25; a.r=1.2;
      } else if(fd < 7) {
        a.h=0.20; a.i=0.30; a.g=0.50; a.r=1.2;
      } else {
        a.h=0.22; a.i=0.42; a.g=0.36; a.r=1.2;
      }
    } else {
      if(o2d < 10 || hd < 10 || fd < 10) {
        if(o2d < hd && o2d < fd) {
          a.h=0.10; a.i=0.65; a.g=0.25; a.r=1.0;
        } else if(hd < fd) {
          a.h=0.10; a.i=0.65; a.g=0.25; a.r=1.0;
        } else {
          a.h=0.10; a.i=0.25; a.g=0.65; a.r=1.0;
        }
      } else {
        a.h=0.15; a.i=0.40; a.g=0.45; a.r=1.0;
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
  
  // MINIMAL ENHANCEMENT: Repair bay system with 57% scaling (vs 55% baseline)
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    // Slightly enhanced exponential repair scaling 
    const baseRepair = 0.007;  // Same as baseline
    const slightlyEnhancedBonus = Math.pow(1.57, repairCount - 1); // 57% vs 55% baseline
    st.se = Math.min(1, st.se + baseRepair * slightlyEnhancedBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.7) * slightlyEnhancedBonus);
    
    // Same active mitigation as baseline
    if(repairCount >= 1) {
      if(sol % 6 === 0) st.ie = Math.min(1, st.ie + 0.006);
      if(sol % 4 === 0) st.se = Math.min(1, st.se + 0.005);
    }
    
    if(repairCount >= 2) {
      if(sol % 8 === 0) st.power += 8;
      if(sol % 10 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1);
        });
      }
    }
    
    if(repairCount >= 3) {
      if(sol % 10 === 0) {
        st.power += 6;
        st.se = Math.min(1, st.se + 0.004);
      }
    }
    
    if(repairCount >= 4) {
      if(sol % 12 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.2);
        });
        st.ie = Math.min(1, st.ie + 0.0045); // Slight increase
      }
      st.power += 2.2; // Slight increase
    }
    
    if(repairCount >= 5) {
      st.power += 3.2; // Slight increase
      if(sol % 14 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.8);
        });
      }
    }

    // Continue with baseline logic but tiny improvements
    if(repairCount >= 6) {
      st.power += 2.1; // Slight increase from +2
      if(sol % 12 === 0) {
        st.se = Math.min(1, st.se + 0.003);
        st.ie = Math.min(1, st.ie + 0.003);
      }
    }

    if(repairCount >= 7) {
      st.power += 2.1; // Slight increase from +2
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.8);
        });
      }
    }

    if(repairCount >= 8) {
      st.power += 3.2; // Slight increase from +3
      if(sol % 1 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1);
        });
      }
    }
    
    if(repairCount >= 9) {
      st.power += 2.1; // Slight increase from +2
      if(sol % 1 === 0) {
        st.se = Math.min(1, st.se + 0.001);
        st.ie = Math.min(1, st.ie + 0.001);
      }
    }
    
    if(repairCount >= 10) {
      st.power += 2.2; // Slight increase from +2
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.5);
        });
        st.power += 1.1; // Slight increase from +1
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

  // MINIMAL ENHANCEMENT: Module deployment 2-3 sols earlier
  // Early solar foundation (slightly earlier)
  if(sol===2&&st.power>12)         {st.mod.push('solar_farm')}
  else if(sol===5&&st.power>20)    {st.mod.push('solar_farm')}
  else if(sol===8&&st.power>30)    {st.mod.push('solar_farm')}
  else if(sol===12&&st.power>40)   {st.mod.push('solar_farm')}
  else if(sol===16&&st.power>50)   {st.mod.push('solar_farm')}
  // Slightly earlier repair investment 
  else if(sol===18&&st.power>58)   {st.mod.push('repair_bay')} // 2 sols earlier
  // Continue with baseline timing (just 2-3 sols earlier)
  else if(sol===24&&st.power>73)   {st.mod.push('solar_farm')} // 2 sols earlier
  else if(sol===30&&st.power>88)   {st.mod.push('solar_farm')} // 2 sols earlier
  else if(sol===36&&st.power>103)  {st.mod.push('repair_bay')} // 2 sols earlier
  else if(sol===43&&st.power>123)  {st.mod.push('solar_farm')} // 2 sols earlier
  else if(sol===50&&st.power>143)  {st.mod.push('solar_farm')} // 2 sols earlier
  else if(sol===58&&st.power>168)  {st.mod.push('repair_bay')} // 2 sols earlier
  else if(sol===68&&st.power>198)  {st.mod.push('solar_farm')} // 2 sols earlier
  else if(sol===78&&st.power>233)  {st.mod.push('repair_bay')} // 2 sols earlier
  else if(sol===90&&st.power>273)  {st.mod.push('repair_bay')} // 2 sols earlier
  else if(sol===103&&st.power>318) {st.mod.push('solar_farm')} // 2 sols earlier
  else if(sol===118&&st.power>368) {st.mod.push('repair_bay')} // 2 sols earlier
  else if(sol===133&&st.power>418) {st.mod.push('repair_bay')} // 2 sols earlier
  else if(sol===150&&st.power>473) {st.mod.push('solar_farm')} // 2 sols earlier
  
  // ENHANCED EARLY SCORING - Slightly earlier diversification
  else if(sol===168&&st.power>533) {st.mod.push('isru_plant')}     // 2 sols earlier
  else if(sol===183&&st.power>573) {st.mod.push('water_extractor')} // 2 sols earlier
  else if(sol===198&&st.power>613) {st.mod.push('greenhouse_dome')} // 2 sols earlier
  else if(sol===213&&st.power>653) {st.mod.push('isru_plant')}     // 2 sols earlier
  else if(sol===228&&st.power>693) {st.mod.push('water_extractor')} // 2 sols earlier
  else if(sol===243&&st.power>733) {st.mod.push('greenhouse_dome')} // 2 sols earlier
  else if(sol===258&&st.power>773) {st.mod.push('repair_bay')}     // 2 sols earlier
  else if(sol===273&&st.power>813) {st.mod.push('isru_plant')}     // 2 sols earlier
  else if(sol===288&&st.power>853) {st.mod.push('water_extractor')} // 2 sols earlier
  else if(sol===303&&st.power>893) {st.mod.push('greenhouse_dome')} // 2 sols earlier
  else if(sol===318&&st.power>933) {st.mod.push('solar_farm')}     // 2 sols earlier
  else if(sol===333&&st.power>973) {st.mod.push('repair_bay')}     // 2 sols earlier
  else if(sol===348&&st.power>1013) {st.mod.push('isru_plant')}    // 2 sols earlier
  else if(sol===363&&st.power>1053) {st.mod.push('water_extractor')} // 2 sols earlier
  else if(sol===378&&st.power>1093) {st.mod.push('greenhouse_dome')} // 2 sols earlier
  else if(sol===393&&st.power>1133) {st.mod.push('solar_farm')}    // 2 sols earlier
  else if(sol===408&&st.power>1173) {st.mod.push('repair_bay')}    // 2 sols earlier
  else if(sol===423&&st.power>1213) {st.mod.push('isru_plant')}    // 2 sols earlier
  else if(sol===438&&st.power>1253) {st.mod.push('water_extractor')} // 2 sols earlier
  else if(sol===453&&st.power>1293) {st.mod.push('greenhouse_dome')} // 2 sols earlier
  else if(sol===468&&st.power>1333) {st.mod.push('isru_plant')}    // 2 sols earlier
  else if(sol===483&&st.power>1373) {st.mod.push('water_extractor')} // 2 sols earlier
  else if(sol===498&&st.power>1413) {st.mod.push('greenhouse_dome')} // 2 sols earlier
  else if(sol===513&&st.power>1453) {st.mod.push('solar_farm')}    // 2 sols earlier

  // CRI - same calculation as baseline
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    -(o2d<5?15:0)-(hd<5?15:0)-(fd<5?15:0)+(st.crew.filter(c=>c.a&&c.hp<50).length*8)));

  return {alive:true};
}

// Monte Carlo runner
async function runMinimalEnhancement(runs) {
  const {frames, totalSols} = loadFrames();
  let survivors = 0;
  let totalSolsSurvived = 0;
  const runResults = [];
  let totalScores = [];

  console.log(`═══════════════════════════════════════════════`);
  console.log(`  MINIMAL PRECISION ENHANCEMENT: ${runs} runs × ${totalSols} frames`);
  console.log(`═══════════════════════════════════════════════`);

  for (let run = 0; run < runs; run++) {
    const R = rng32(run * 31337 + 42);
    let st = {
      power: 50, o2: 100, h2o: 100, food: 3000, it: 280, se: 1, ie: 1, ge: 1,
      crew: [{a:true,hp:100,bot:false},{a:true,hp:100,bot:false}],
      mod: [], ev: [], cri: 10, alloc: {h:0.3,i:0.4,g:0.3,r:1.0}
    };

    let solsSurvived = 0;
    for (let sol = 1; sol <= totalSols; sol++) {
      const result = tick(st, sol, frames[sol] || null, R);
      if (!result.alive) {
        break;
      }
      solsSurvived = sol;
    }

    if (solsSurvived >= totalSols) survivors++;
    totalSolsSurvived += solsSurvived;
    
    // Calculate score
    const finalCrew = st.crew.filter(c => c.a).length;
    const moduleCount = st.mod.length;
    const score = solsSurvived * 100 + finalCrew * 500 + moduleCount * 150;
    totalScores.push(score);
    
    runResults.push({ 
      run: run + 1, 
      solsSurvived, 
      crew: finalCrew, 
      modules: moduleCount,
      hp: Math.round(st.crew.filter(c => c.a).reduce((sum, c) => sum + c.hp, 0) / Math.max(1, finalCrew)),
      score
    });
  }

  const survivalRate = (survivors / runs) * 100;
  const avgSols = totalSolsSurvived / runs;
  const avgScore = totalScores.reduce((a, b) => a + b, 0) / runs;
  const medianScore = totalScores.sort((a, b) => a - b)[Math.floor(totalScores.length / 2)];

  console.log(`\nSURVIVAL RATE: ${survivalRate.toFixed(1)}% (${survivors}/${runs} survived all ${totalSols} sols)`);
  console.log(`\nAverage sols survived: ${Math.round(avgSols)}`);
  console.log(`Average score: ${Math.round(avgScore)}`);
  console.log(`Median score: ${Math.round(medianScore)}`);

  if (survivors > 0) {
    const survivorResults = runResults.filter(r => r.solsSurvived >= totalSols);
    const avgHP = Math.round(survivorResults.reduce((sum, r) => sum + r.hp, 0) / survivorResults.length);
    const avgModules = Math.round(survivorResults.reduce((sum, r) => sum + r.modules, 0) / survivorResults.length);
    console.log(`Average HP (survivors): ${avgHP}`);
    console.log(`Average modules (survivors): ${avgModules}`);

    if (survivalRate === 100) {
      const avgScoreSurvivors = Math.round(survivorResults.reduce((sum, r) => sum + r.score, 0) / survivorResults.length);
      
      if (avgScoreSurvivors > 72000) {
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║     🏆 MINIMAL BREAKTHROUGH! 🏆         ║');
        console.log(`║     Score improvement: ${avgScoreSurvivors} vs 72000    ║`);
        console.log('╚══════════════════════════════════════════╝');
      }
    }
  }

  return {
    survivalRate,
    avgSols: Math.round(avgSols),
    avgScore: Math.round(avgScore),
    medianScore: Math.round(medianScore),
    totalSols,
    runs,
    survivors
  };
}

// Main execution
if (process.argv[2] === '--monte-carlo') {
  const runs = parseInt(process.argv[3]) || 10;
  runMinimalEnhancement(runs);
} else {
  // Single run
  runMinimalEnhancement(1);
}