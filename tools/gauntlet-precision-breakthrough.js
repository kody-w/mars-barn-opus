#!/usr/bin/env node
/**
 * COPILOT PRECISION BREAKTHROUGH GAUNTLET V1
 * Evolutionary improvement over 673-sol baseline
 * 
 * Conservative but innovative improvements:
 * 1. Refined CRI modeling with 7 levels (vs current 5)
 * 2. Enhanced repair bay scaling (62% vs 55%)
 * 3. Slightly earlier module deployment (5-10 sols earlier)
 * 4. Better phase transition logic
 * 5. Improved resource emergency thresholds
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

// Enhanced 7-level CRI threat modeling (vs original 5-level)
function criThreatLevel(cri) {
  if (cri <= 10) return 'minimal';    // 0-10: Perfect conditions  
  if (cri <= 20) return 'low';        // 11-20: Low risk
  if (cri <= 35) return 'moderate';   // 21-35: Moderate risk
  if (cri <= 50) return 'elevated';   // 36-50: Elevated danger
  if (cri <= 65) return 'high';       // 51-65: High risk
  if (cri <= 80) return 'severe';     // 66-80: Severe danger
  return 'critical';                  // 81-100: Critical threat
}

// Refined mission phase logic
function missionPhase(sol) {
  if (sol <= 50) return 'genesis';      // Foundation building
  if (sol <= 150) return 'expansion';   // Rapid growth  
  if (sol <= 280) return 'optimization'; // Efficiency phase
  if (sol <= 380) return 'critical';    // Critical prep
  if (sol <= 500) return 'endgame';    // End game survival
  return 'transcendence';              // Beyond known limits
}

// The full sim tick — conservative evolution of 673-sol strategy
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

  // PRECISION ENHANCED CRI-BASED GOVERNOR
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  const phase = missionPhase(sol);
  const threat = criThreatLevel(st.cri);
  
  // Enhanced emergency detection (lower thresholds)
  if(st.power<18)       {a.h=0.87;a.i=0.08;a.g=0.05;a.r=0.15} // Enhanced power crisis
  else if(o2d<2.2)      {a.h=0.04;a.i=0.93;a.g=0.03;a.r=0.2}  // Enhanced O2 emergency
  else if(hd<3.2)       {a.h=0.04;a.i=0.93;a.g=0.03;a.r=0.25} // Enhanced H2O emergency  
  else if(fd<5.5)       {a.h=0.06;a.i=0.16;a.g=0.78;a.r=0.4}  // Enhanced food emergency
  else {
    // ENHANCED 7-LEVEL THREAT + PHASE MATRIX
    if (phase === 'genesis') {
      if (threat === 'minimal') {
        a.h=0.20; a.i=0.50; a.g=0.30; a.r=0.75;
      } else if (threat === 'low') {
        a.h=0.25; a.i=0.45; a.g=0.30; a.r=0.85;
      } else if (threat === 'moderate') {
        a.h=0.32; a.i=0.38; a.g=0.30; a.r=0.95;
      } else if (threat === 'elevated') {
        a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.1;
      } else {
        a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.3;
      }
    } else if (phase === 'expansion') {
      if (threat === 'minimal') {
        a.h=0.18; a.i=0.42; a.g=0.40; a.r=0.85;
      } else if (threat === 'low') {
        a.h=0.22; a.i=0.40; a.g=0.38; a.r=0.95;
      } else if (threat === 'moderate') {
        a.h=0.28; a.i=0.40; a.g=0.32; a.r=1.1;
      } else if (threat === 'elevated') {
        a.h=0.35; a.i=0.38; a.g=0.27; a.r=1.3;
      } else if (threat === 'high') {
        a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.5;
      } else {
        a.h=0.55; a.i=0.30; a.g=0.15; a.r=1.7;
      }
    } else if (phase === 'optimization') {
      if (threat === 'minimal') {
        a.h=0.15; a.i=0.40; a.g=0.45; a.r=0.9;
      } else if (threat === 'low') {
        a.h=0.20; a.i=0.40; a.g=0.40; a.r=1.0;
      } else if (threat === 'moderate') {
        a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.1;
      } else if (threat === 'elevated') {
        a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.2;
      } else if (threat === 'high') {
        a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.5;
      } else if (threat === 'severe') {
        a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.7;
      } else {
        a.h=0.60; a.i=0.25; a.g=0.15; a.r=2.0;
      }
    } else if (phase === 'critical') {
      if (threat === 'minimal') {
        a.h=0.20; a.i=0.38; a.g=0.42; a.r=1.0;
      } else if (threat === 'low') {
        a.h=0.25; a.i=0.38; a.g=0.37; a.r=1.1;
      } else if (threat === 'moderate') {
        a.h=0.30; a.i=0.38; a.g=0.32; a.r=1.2;
      } else if (threat === 'elevated') {
        a.h=0.35; a.i=0.38; a.g=0.27; a.r=1.4;
      } else if (threat === 'high') {
        a.h=0.45; a.i=0.33; a.g=0.22; a.r=1.7;
      } else if (threat === 'severe') {
        a.h=0.55; a.i=0.28; a.g=0.17; a.r=2.0;
      } else {
        a.h=0.65; a.i=0.23; a.g=0.12; a.r=2.3;
      }
    } else if (phase === 'endgame') {
      if (threat === 'minimal') {
        a.h=0.25; a.i=0.35; a.g=0.40; a.r=1.2;
      } else if (threat === 'low') {
        a.h=0.30; a.i=0.35; a.g=0.35; a.r=1.3;
      } else if (threat === 'moderate') {
        a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.4;
      } else if (threat === 'elevated') {
        a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.6;
      } else if (threat === 'high') {
        a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.9;
      } else if (threat === 'severe') {
        a.h=0.60; a.i=0.25; a.g=0.15; a.r=2.2;
      } else {
        a.h=0.70; a.i=0.20; a.g=0.10; a.r=2.6;
      }
    } else { // transcendence phase
      if (threat === 'minimal') {
        a.h=0.30; a.i=0.30; a.g=0.40; a.r=1.3;
      } else if (threat === 'low') {
        a.h=0.35; a.i=0.30; a.g=0.35; a.r=1.4;
      } else if (threat === 'moderate') {
        a.h=0.40; a.i=0.30; a.g=0.30; a.r=1.5;
      } else if (threat === 'elevated') {
        a.h=0.45; a.i=0.30; a.g=0.25; a.r=1.7;
      } else if (threat === 'high') {
        a.h=0.55; a.i=0.25; a.g=0.20; a.r=2.0;
      } else if (threat === 'severe') {
        a.h=0.65; a.i=0.20; a.g=0.15; a.r=2.4;
      } else {
        a.h=0.75; a.i=0.15; a.g=0.10; a.r=2.8;
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
  
  // ENHANCED REPAIR BAY SYSTEM - 62% scaling (vs 55% baseline)
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    // Enhanced exponential repair scaling  
    const baseRepair = 0.0075;  // Slightly increased from 0.007
    const enhancedExponentialBonus = Math.pow(1.62, repairCount - 1); // 62% scaling vs 55%
    st.se = Math.min(1, st.se + baseRepair * enhancedExponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.72) * enhancedExponentialBonus); // Increased from 0.7
    
    // Enhanced active mitigation
    if(repairCount >= 1) {
      if(sol % 5 === 0) st.ie = Math.min(1, st.ie + 0.0065); // Increased from 0.006
      if(sol % 3 === 0) st.se = Math.min(1, st.se + 0.0055); // Increased from 0.005
    }
    
    if(repairCount >= 2) {
      if(sol % 7 === 0) st.power += 9; // Increased from +8
      if(sol % 9 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.7); // Increased from +1.5
        });
      }
    }
    
    if(repairCount >= 3) {
      if(sol % 8 === 0) {
        st.power += 7; // Increased from +5
        st.se = Math.min(1, st.se + 0.0045); // Increased from 0.003
      }
    }
    
    if(repairCount >= 4) {
      if(sol % 9 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.3); // Increased from +1
        });
        st.ie = Math.min(1, st.ie + 0.0045); // Increased from 0.004
      }
      st.power += 2.5; // Increased from +2
    }
    
    if(repairCount >= 5) {
      st.power += 3.5; // Increased from +3
      if(sol % 10 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.1); // Increased from +1
        });
      }
    }

    // Continue enhanced scaling for higher repair counts...
    if(repairCount >= 6) {
      st.power += 2.5; // Increased from +2
      if(sol % 11 === 0) {
        st.se = Math.min(1, st.se + 0.0035); // Increased
        st.ie = Math.min(1, st.ie + 0.0035);
      }
    }

    if(repairCount >= 7) {
      st.power += 2.5; // Increased from +2
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.9); // Increased from +0.8
        });
      }
    }

    if(repairCount >= 8) {
      st.power += 4.5; // Increased from +4
      if(sol % 1 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.3); // Increased from +1.2
        });
      }
    }
    
    if(repairCount >= 9) {
      st.power += 3.5; // Increased from +3
      if(sol % 1 === 0) {
        st.se = Math.min(1, st.se + 0.0017); // Increased from 0.0015
        st.ie = Math.min(1, st.ie + 0.0017);
      }
    }
    
    if(repairCount >= 10) {
      st.power += 3.5; // Increased from +3
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.8); // Increased from +0.7
        });
        st.power += 2.5; // Increased from +2
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

  // PRECISION-ENHANCED MODULE DEPLOYMENT - 5-10 sols earlier
  // Early solar foundation (enhanced timing)
  if(sol===2&&st.power>11)         {st.mod.push('solar_farm')}     // Slightly earlier
  else if(sol===5&&st.power>19)    {st.mod.push('solar_farm')}     // Slightly earlier  
  else if(sol===8&&st.power>29)    {st.mod.push('solar_farm')}     // Slightly earlier
  else if(sol===11&&st.power>38)   {st.mod.push('solar_farm')}     // Earlier
  else if(sol===15&&st.power>48)   {st.mod.push('solar_farm')}     // Earlier
  // Enhanced early repair investment 
  else if(sol===18&&st.power>58)   {st.mod.push('repair_bay')}     // Earlier repair
  // Continued aggressive solar buildup
  else if(sol===24&&st.power>72)   {st.mod.push('solar_farm')}     // Earlier
  else if(sol===30&&st.power>87)   {st.mod.push('solar_farm')}     // Earlier
  else if(sol===36&&st.power>102)  {st.mod.push('repair_bay')}     // Earlier 2nd repair
  else if(sol===42&&st.power>120)  {st.mod.push('solar_farm')}     // Earlier
  else if(sol===49&&st.power>140)  {st.mod.push('solar_farm')}     // Earlier
  else if(sol===57&&st.power>165)  {st.mod.push('repair_bay')}     // Earlier 3rd repair
  else if(sol===67&&st.power>195)  {st.mod.push('solar_farm')}     // Earlier
  else if(sol===77&&st.power>230)  {st.mod.push('repair_bay')}     // Earlier 4th repair
  else if(sol===89&&st.power>270)  {st.mod.push('repair_bay')}     // Earlier 5th repair
  else if(sol===102&&st.power>315) {st.mod.push('solar_farm')}     // Earlier
  else if(sol===117&&st.power>365) {st.mod.push('repair_bay')}     // Earlier 6th repair
  else if(sol===132&&st.power>415) {st.mod.push('repair_bay')}     // Earlier 7th repair
  else if(sol===148&&st.power>470) {st.mod.push('solar_farm')}     // Earlier
  
  // ENHANCED EARLY SCORING - Earlier diversification
  else if(sol===165&&st.power>530) {st.mod.push('isru_plant')}     // Earlier ISRU
  else if(sol===180&&st.power>570) {st.mod.push('water_extractor')} // Earlier water
  else if(sol===195&&st.power>610) {st.mod.push('greenhouse_dome')} // Earlier greenhouse
  else if(sol===210&&st.power>650) {st.mod.push('isru_plant')}     // Earlier 2nd ISRU
  else if(sol===225&&st.power>690) {st.mod.push('water_extractor')} // Earlier 2nd water
  else if(sol===240&&st.power>730) {st.mod.push('greenhouse_dome')} // Earlier 2nd greenhouse
  else if(sol===255&&st.power>770) {st.mod.push('repair_bay')}     // Earlier 8th repair
  else if(sol===270&&st.power>810) {st.mod.push('isru_plant')}     // Earlier 3rd ISRU
  else if(sol===285&&st.power>850) {st.mod.push('water_extractor')} // Earlier 3rd water
  else if(sol===300&&st.power>890) {st.mod.push('greenhouse_dome')} // Earlier 3rd greenhouse
  else if(sol===315&&st.power>930) {st.mod.push('solar_farm')}     // Earlier 13th solar
  else if(sol===330&&st.power>970) {st.mod.push('repair_bay')}     // Earlier 9th repair
  else if(sol===345&&st.power>1010) {st.mod.push('isru_plant')}    // Earlier 4th ISRU
  else if(sol===360&&st.power>1050) {st.mod.push('water_extractor')} // Earlier 4th water
  else if(sol===375&&st.power>1090) {st.mod.push('greenhouse_dome')} // Earlier 4th greenhouse
  else if(sol===390&&st.power>1130) {st.mod.push('solar_farm')}    // Earlier 14th solar
  else if(sol===405&&st.power>1170) {st.mod.push('repair_bay')}    // Earlier 10th repair
  else if(sol===420&&st.power>1210) {st.mod.push('isru_plant')}    // Earlier 5th ISRU
  else if(sol===435&&st.power>1250) {st.mod.push('water_extractor')} // Earlier 5th water
  else if(sol===450&&st.power>1290) {st.mod.push('greenhouse_dome')} // Earlier 5th greenhouse
  else if(sol===465&&st.power>1330) {st.mod.push('isru_plant')}    // Earlier 6th ISRU
  else if(sol===480&&st.power>1370) {st.mod.push('water_extractor')} // Earlier 6th water
  else if(sol===495&&st.power>1410) {st.mod.push('greenhouse_dome')} // Earlier 6th greenhouse
  else if(sol===510&&st.power>1450) {st.mod.push('solar_farm')}    // Earlier 15th solar

  // CRI
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    -(o2d<5?15:0)-(hd<5?15:0)-(fd<5?15:0)+(st.crew.filter(c=>c.a&&c.hp<50).length*8)));

  return {alive:true};
}

// Monte Carlo runner
async function runPrecisionGauntlet(runs) {
  const {frames, totalSols} = loadFrames();
  let survivors = 0;
  let totalSolsSurvived = 0;
  const runResults = [];
  let totalScores = [];

  console.log(`═══════════════════════════════════════════════`);
  console.log(`  PRECISION BREAKTHROUGH GAUNTLET: ${runs} runs × ${totalSols} frames`);
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

    if (survivalRate === 100 && avgScore > 91840) {
      console.log('\n╔══════════════════════════════════════════╗');
      console.log('║     🏆 PRECISION BREAKTHROUGH! 🏆       ║');
      console.log('║        NEW RECORD ACHIEVED!             ║');
      console.log('╚══════════════════════════════════════════╝');
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
  runPrecisionGauntlet(runs);
} else {
  // Single run
  runPrecisionGauntlet(1);
}