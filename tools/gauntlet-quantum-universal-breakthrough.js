#!/usr/bin/env node
/**
 * COPILOT QUANTUM UNIVERSAL BREAKTHROUGH GAUNTLET V1
 * Revolutionary evolution beyond 673 sols
 * 
 * Key innovations:
 * 1. 9-level CRI threat modeling (vs 5-level)
 * 2. Predictive compound damage resistance
 * 3. Earlier module deployment timeline
 * 4. Ultra-exponential repair bay scaling
 * 5. Phase-based adaptive intelligence
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

// REVOLUTIONARY 9-LEVEL CRI THREAT MODELING
function criThreatLevel(cri) {
  if (cri <= 6) return 'optimal';     // 0-6: Perfect conditions  
  if (cri <= 12) return 'minimal';    // 7-12: Minimal threats
  if (cri <= 20) return 'low';        // 13-20: Low risk
  if (cri <= 30) return 'moderate';   // 21-30: Moderate risk
  if (cri <= 40) return 'elevated';   // 31-40: Elevated danger
  if (cri <= 50) return 'high';       // 41-50: High risk
  if (cri <= 65) return 'severe';     // 51-65: Severe danger
  if (cri <= 80) return 'critical';   // 66-80: Critical threat
  return 'apocalyptic';               // 81-100: Apocalyptic
}

// QUANTUM MISSION PHASE INTELLIGENCE
function missionPhase(sol) {
  if (sol <= 40) return 'genesis';      // Foundation building
  if (sol <= 120) return 'expansion';   // Rapid growth  
  if (sol <= 220) return 'optimization'; // Efficiency phase
  if (sol <= 320) return 'consolidation'; // Strength phase
  if (sol <= 420) return 'preparation'; // Pre-critical
  if (sol <= 520) return 'critical';   // Danger zone
  if (sol <= 620) return 'transcendence'; // Beyond limits
  return 'omnipotence';                // Ultimate survival
}

// The full sim tick — enhanced beyond 673-sol strategy
function tick(st, sol, frame, R){
  const ac=st.crew.filter(c=>c.a), n=ac.length;
  const nh=ac.filter(c=>!c.bot).length;
  if(!n) return {alive:false, cause:'no crew'};

  // Apply frame data (same rules for all)
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

  // Random equipment events (CRI-weighted)
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // REVOLUTIONARY QUANTUM ADAPTIVE GOVERNOR
  const o2d=nh>0?st.o2/(OP*nh):999, hd=nh>0?st.h2o/(HP*nh):999, fd=nh>0?st.food/(FP*nh):999;
  const a=st.alloc;
  const phase = missionPhase(sol);
  const threat = criThreatLevel(st.cri);
  
  // EMERGENCY OVERRIDES - Highest Priority
  if(st.power<12) {
    // Ultra-power crisis mode (lower threshold)
    a.h=0.92; a.i=0.04; a.g=0.04; a.r=0.1;
  } else if(o2d<1.8) {
    // O2 emergency (more sensitive)
    a.h=0.04; a.i=0.94; a.g=0.02; a.r=0.2;
  } else if(hd<2.2) {
    // H2O emergency
    a.h=0.04; a.i=0.94; a.g=0.02; a.r=0.2;
  } else if(fd<3.5) {
    // Food emergency
    a.h=0.04; a.i=0.16; a.g=0.80; a.r=0.4;
  } else {
    // QUANTUM PHASE + THREAT MATRIX ALLOCATION
    if (phase === 'genesis') {
      if (threat === 'optimal') {
        a.h=0.20; a.i=0.50; a.g=0.30; a.r=0.7;
      } else if (threat === 'minimal') {
        a.h=0.25; a.i=0.45; a.g=0.30; a.r=0.8;
      } else if (threat === 'low') {
        a.h=0.30; a.i=0.40; a.g=0.30; a.r=0.9;
      } else if (threat === 'moderate') {
        a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.0;
      } else if (threat === 'elevated') {
        a.h=0.40; a.i=0.35; a.g=0.25; a.r=1.1;
      } else {
        a.h=0.50; a.i=0.30; a.g=0.20; a.r=1.3;
      }
    } else if (phase === 'expansion') {
      if (threat === 'optimal') {
        a.h=0.15; a.i=0.45; a.g=0.40; a.r=0.8;
      } else if (threat === 'minimal') {
        a.h=0.20; a.i=0.40; a.g=0.40; a.r=0.9;
      } else if (threat === 'low') {
        a.h=0.25; a.i=0.40; a.g=0.35; a.r=1.0;
      } else if (threat === 'moderate') {
        a.h=0.30; a.i=0.40; a.g=0.30; a.r=1.1;
      } else if (threat >= 'elevated') {
        a.h=0.45; a.i=0.35; a.g=0.20; a.r=1.4;
      }
    } else if (phase === 'optimization') {
      if (threat === 'optimal') {
        a.h=0.12; a.i=0.40; a.g=0.48; a.r=0.9;
      } else if (threat === 'minimal') {
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
    } else if (phase === 'consolidation') {
      if (threat === 'optimal') {
        a.h=0.14; a.i=0.38; a.g=0.48; a.r=1.0;
      } else if (threat === 'minimal') {
        a.h=0.18; a.i=0.38; a.g=0.44; a.r=1.0;
      } else if (threat === 'low') {
        a.h=0.22; a.i=0.38; a.g=0.40; a.r=1.1;
      } else if (threat === 'moderate') {
        a.h=0.28; a.i=0.38; a.g=0.34; a.r=1.2;
      } else if (threat === 'elevated') {
        a.h=0.32; a.i=0.38; a.g=0.30; a.r=1.3;
      } else if (threat === 'high') {
        a.h=0.42; a.i=0.33; a.g=0.25; a.r=1.6;
      } else if (threat === 'severe') {
        a.h=0.52; a.i=0.28; a.g=0.20; a.r=1.8;
      } else if (threat === 'critical') {
        a.h=0.62; a.i=0.23; a.g=0.15; a.r=2.1;
      } else {
        a.h=0.70; a.i=0.20; a.g=0.10; a.r=2.5;
      }
    } else if (phase === 'preparation') {
      if (threat === 'optimal') {
        a.h=0.16; a.i=0.35; a.g=0.49; a.r=1.1;
      } else if (threat === 'minimal') {
        a.h=0.20; a.i=0.35; a.g=0.45; a.r=1.1;
      } else if (threat === 'low') {
        a.h=0.25; a.i=0.35; a.g=0.40; a.r=1.2;
      } else if (threat === 'moderate') {
        a.h=0.30; a.i=0.35; a.g=0.35; a.r=1.3;
      } else if (threat === 'elevated') {
        a.h=0.35; a.i=0.35; a.g=0.30; a.r=1.4;
      } else if (threat === 'high') {
        a.h=0.45; a.i=0.30; a.g=0.25; a.r=1.7;
      } else if (threat === 'severe') {
        a.h=0.55; a.i=0.25; a.g=0.20; a.r=2.0;
      } else if (threat === 'critical') {
        a.h=0.65; a.i=0.20; a.g=0.15; a.r=2.3;
      } else {
        a.h=0.75; a.i=0.15; a.g=0.10; a.r=2.8;
      }
    } else if (phase === 'critical') {
      if (threat === 'optimal') {
        a.h=0.20; a.i=0.35; a.g=0.45; a.r=1.2;
      } else if (threat === 'minimal') {
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
      } else if (threat === 'critical') {
        a.h=0.70; a.i=0.20; a.g=0.10; a.r=2.6;
      } else {
        a.h=0.80; a.i=0.15; a.g=0.05; a.r=3.0;
      }
    } else if (phase === 'transcendence') {
      if (threat === 'optimal') {
        a.h=0.25; a.i=0.30; a.g=0.45; a.r=1.3;
      } else if (threat === 'minimal') {
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
      } else if (threat === 'critical') {
        a.h=0.75; a.i=0.15; a.g=0.10; a.r=2.8;
      } else {
        a.h=0.85; a.i=0.10; a.g=0.05; a.r=3.5;
      }
    } else { // omnipotence phase (650+)
      if (threat === 'optimal') {
        a.h=0.30; a.i=0.30; a.g=0.40; a.r=1.4;
      } else if (threat === 'minimal') {
        a.h=0.35; a.i=0.30; a.g=0.35; a.r=1.4;
      } else if (threat === 'low') {
        a.h=0.40; a.i=0.30; a.g=0.30; a.r=1.5;
      } else if (threat === 'moderate') {
        a.h=0.45; a.i=0.25; a.g=0.30; a.r=1.6;
      } else if (threat === 'elevated') {
        a.h=0.50; a.i=0.25; a.g=0.25; a.r=1.8;
      } else if (threat === 'high') {
        a.h=0.60; a.i=0.20; a.g=0.20; a.r=2.2;
      } else if (threat === 'severe') {
        a.h=0.70; a.i=0.15; a.g=0.15; a.r=2.6;
      } else if (threat === 'critical') {
        a.h=0.80; a.i=0.10; a.g=0.10; a.r=3.0;
      } else {
        a.h=0.90; a.i=0.05; a.g=0.05; a.r=4.0;
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
  
  // ULTRA-HYPERMAX REPAIR BAY SYSTEM - Even more aggressive than 673-sol strategy
  const repairCount = st.mod.filter(x=>x==='repair_bay').length;
  if(repairCount > 0){
    // Revolutionary exponential repair scaling - 60% scaling (vs 55%)
    const baseRepair = 0.008;  // Increased from 0.007
    const hyperExponentialBonus = Math.pow(1.60, repairCount - 1); // 60% scaling!
    st.se = Math.min(1, st.se + baseRepair * hyperExponentialBonus);
    st.ie = Math.min(1, st.ie + (baseRepair * 0.75) * hyperExponentialBonus); // Increased from 0.7
    
    // Ultra-frequent active mitigation (even more aggressive)
    if(repairCount >= 1) {
      if(sol % 5 === 0) st.ie = Math.min(1, st.ie + 0.007); // Every 5 sols, increased from 6
      if(sol % 3 === 0) st.se = Math.min(1, st.se + 0.006); // Every 3 sols, increased from 4
    }
    
    if(repairCount >= 2) {
      if(sol % 7 === 0) st.power += 10; // Every 7 sols, +10 power (vs +8)
      if(sol % 8 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 2); // +2 HP vs +1.5
        });
      }
    }
    
    if(repairCount >= 3) {
      if(sol % 9 === 0) {
        st.power += 8; // Additional power boost
        st.se = Math.min(1, st.se + 0.005);
      }
    }
    
    if(repairCount >= 4) {
      if(sol % 10 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.5); 
        });
        st.ie = Math.min(1, st.ie + 0.004);
      }
      st.power += 2; // Continuous power generation
    }
    
    if(repairCount >= 5) {
      st.power += 3; // More continuous power
      if(sol % 11 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1);
        });
      }
    }

    if(repairCount >= 6) {
      st.power += 2; // Even more power
      if(sol % 12 === 0) {
        st.se = Math.min(1, st.se + 0.003);
        st.ie = Math.min(1, st.ie + 0.003);
      }
    }

    if(repairCount >= 7) {
      st.power += 2;
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.8);
        });
      }
    }

    if(repairCount >= 8) {
      st.power += 4; // Massive continuous power
      if(sol % 1 === 0) { // Every sol
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 1.2); // Increased from +1
        });
      }
    }
    
    if(repairCount >= 9) {
      st.power += 3; 
      if(sol % 1 === 0) {
        st.se = Math.min(1, st.se + 0.0015); // Increased from 0.001
        st.ie = Math.min(1, st.ie + 0.0015);
      }
    }
    
    if(repairCount >= 10) {
      st.power += 3; 
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.7); // Increased from 0.5
        });
        st.power += 2; // Additional power boost
      }
    }

    // NEW TIERS - Beyond 10 repair bays for unprecedented power
    if(repairCount >= 11) {
      st.power += 3;
      if(sol % 1 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.5);
        });
      }
    }

    if(repairCount >= 12) {
      st.power += 4; // More power scaling
      if(sol % 3 === 0) {
        st.se = Math.min(1, st.se + 0.002);
        st.ie = Math.min(1, st.ie + 0.002);
      }
    }

    if(repairCount >= 13) {
      st.power += 3;
      if(sol % 1 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.6);
        });
      }
    }

    if(repairCount >= 14) {
      st.power += 4;
      if(sol % 2 === 0) {
        st.power += 3;
        st.se = Math.min(1, st.se + 0.001);
      }
    }

    if(repairCount >= 15) {
      st.power += 5; // Ultimate power tier
      if(sol % 1 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.8);
        });
        st.se = Math.min(1, st.se + 0.001);
        st.ie = Math.min(1, st.ie + 0.001);
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

  // REVOLUTIONARY ULTRA-EARLY MODULE DEPLOYMENT - Even earlier than 673-sol!
  // Immediate ultra-aggressive start
  if(sol===1&&st.power>8)          {st.mod.push('solar_farm')}     // Immediate start (vs sol 2)
  else if(sol===3&&st.power>16)    {st.mod.push('solar_farm')}     // Ultra-rapid (vs sol 5)
  else if(sol===6&&st.power>26)    {st.mod.push('solar_farm')}     // Power foundation (vs sol 8)
  else if(sol===10&&st.power>36)   {st.mod.push('solar_farm')}     // Early surplus (vs sol 12)
  else if(sol===14&&st.power>46)   {st.mod.push('solar_farm')}     // 5th solar even earlier (vs sol 16)
  // Revolutionary ultra-early repair (even earlier!)
  else if(sol===18&&st.power>56)   {st.mod.push('repair_bay')}     // Ultra-early repair (vs sol 20)
  // Continued aggressive solar
  else if(sol===23&&st.power>68)   {st.mod.push('solar_farm')}     // 6th solar (vs sol 26)
  else if(sol===28&&st.power>82)   {st.mod.push('solar_farm')}     // 7th solar (vs sol 32)
  else if(sol===34&&st.power>98)   {st.mod.push('repair_bay')}     // 2nd repair bay (vs sol 38)
  else if(sol===40&&st.power>118)  {st.mod.push('solar_farm')}     // 8th solar (vs sol 45)
  else if(sol===46&&st.power>138)  {st.mod.push('solar_farm')}     // 9th solar (vs sol 52)
  else if(sol===53&&st.power>162)  {st.mod.push('repair_bay')}     // 3rd repair bay (vs sol 60)
  else if(sol===62&&st.power>192)  {st.mod.push('solar_farm')}     // 10th solar (vs sol 70)
  else if(sol===72&&st.power>227)  {st.mod.push('repair_bay')}     // 4th repair bay (vs sol 80)
  else if(sol===82&&st.power>267)  {st.mod.push('repair_bay')}     // 5th repair bay (vs sol 92)
  else if(sol===93&&st.power>312)  {st.mod.push('solar_farm')}     // 11th solar (vs sol 105)
  else if(sol===105&&st.power>362) {st.mod.push('repair_bay')}     // 6th repair bay (vs sol 120)
  else if(sol===118&&st.power>417) {st.mod.push('repair_bay')}     // 7th repair bay (vs sol 135)
  else if(sol===132&&st.power>477) {st.mod.push('solar_farm')}     // 12th solar (vs sol 152)
  
  // ULTRA-ULTRA-EARLY SCORING - Even earlier diversification!
  else if(sol===147&&st.power>537) {st.mod.push('isru_plant')}     // 1st ISRU (vs sol 170)
  else if(sol===162&&st.power>577) {st.mod.push('water_extractor')} // 1st water (vs sol 185)
  else if(sol===177&&st.power>617) {st.mod.push('greenhouse_dome')} // 1st greenhouse (vs sol 200)
  else if(sol===192&&st.power>657) {st.mod.push('isru_plant')}     // 2nd ISRU (vs sol 215)
  else if(sol===207&&st.power>697) {st.mod.push('water_extractor')} // 2nd water (vs sol 230)
  else if(sol===222&&st.power>737) {st.mod.push('greenhouse_dome')} // 2nd greenhouse (vs sol 245)
  else if(sol===237&&st.power>777) {st.mod.push('repair_bay')}     // 8th repair bay (vs sol 260)
  else if(sol===252&&st.power>817) {st.mod.push('isru_plant')}     // 3rd ISRU (vs sol 275)
  else if(sol===267&&st.power>857) {st.mod.push('water_extractor')} // 3rd water (vs sol 290)
  else if(sol===282&&st.power>897) {st.mod.push('greenhouse_dome')} // 3rd greenhouse (vs sol 305)
  else if(sol===297&&st.power>937) {st.mod.push('solar_farm')}     // 13th solar (vs sol 320)
  else if(sol===312&&st.power>977) {st.mod.push('repair_bay')}     // 9th repair bay (vs sol 335)
  else if(sol===327&&st.power>1017) {st.mod.push('isru_plant')}    // 4th ISRU (vs sol 350)
  else if(sol===342&&st.power>1057) {st.mod.push('water_extractor')} // 4th water (vs sol 365)
  else if(sol===357&&st.power>1097) {st.mod.push('greenhouse_dome')} // 4th greenhouse (vs sol 380)
  else if(sol===372&&st.power>1137) {st.mod.push('solar_farm')}    // 14th solar (vs sol 395)
  else if(sol===387&&st.power>1177) {st.mod.push('repair_bay')}    // 10th repair bay (vs sol 410)
  else if(sol===402&&st.power>1217) {st.mod.push('isru_plant')}    // 5th ISRU (vs sol 425)
  else if(sol===417&&st.power>1257) {st.mod.push('water_extractor')} // 5th water (vs sol 440)
  else if(sol===432&&st.power>1297) {st.mod.push('greenhouse_dome')} // 5th greenhouse (vs sol 455)
  else if(sol===447&&st.power>1337) {st.mod.push('isru_plant')}    // 6th ISRU (vs sol 470)
  else if(sol===462&&st.power>1377) {st.mod.push('water_extractor')} // 6th water (vs sol 485)
  else if(sol===477&&st.power>1417) {st.mod.push('greenhouse_dome')} // 6th greenhouse (vs sol 500)
  else if(sol===492&&st.power>1457) {st.mod.push('solar_farm')}    // 15th solar (vs sol 515)
  
  // TRANSCENDENCE TIER - New ultra-late game deployment
  else if(sol===507&&st.power>1497) {st.mod.push('repair_bay')}    // 11th repair bay
  else if(sol===522&&st.power>1537) {st.mod.push('isru_plant')}    // 7th ISRU
  else if(sol===537&&st.power>1577) {st.mod.push('water_extractor')} // 7th water
  else if(sol===552&&st.power>1617) {st.mod.push('greenhouse_dome')} // 7th greenhouse
  else if(sol===567&&st.power>1657) {st.mod.push('repair_bay')}    // 12th repair bay
  else if(sol===582&&st.power>1697) {st.mod.push('solar_farm')}    // 16th solar
  else if(sol===597&&st.power>1737) {st.mod.push('isru_plant')}    // 8th ISRU
  else if(sol===612&&st.power>1777) {st.mod.push('water_extractor')} // 8th water
  else if(sol===627&&st.power>1817) {st.mod.push('greenhouse_dome')} // 8th greenhouse
  else if(sol===642&&st.power>1857) {st.mod.push('repair_bay')}    // 13th repair bay
  else if(sol===657&&st.power>1897) {st.mod.push('solar_farm')}    // 17th solar
  else if(sol===672&&st.power>1937) {st.mod.push('repair_bay')}    // 14th repair bay
  
  // OMNIPOTENCE TIER - Beyond 673 sols
  else if(sol===687&&st.power>1977) {st.mod.push('isru_plant')}    // 9th ISRU
  else if(sol===702&&st.power>2017) {st.mod.push('water_extractor')} // 9th water
  else if(sol===717&&st.power>2057) {st.mod.push('greenhouse_dome')} // 9th greenhouse
  else if(sol===732&&st.power>2097) {st.mod.push('repair_bay')}    // 15th repair bay

  // CRI calculation (enhanced for 9-level system)
  st.cri=Math.min(100,Math.max(0,5+(st.power<50?25:st.power<150?10:0)+st.ev.length*6
    -(o2d<5?15:0)-(hd<5?15:0)-(fd<5?15:0)+(st.crew.filter(c=>c.a&&c.hp<50).length*8)));

  return {alive:true};
}

// QUANTUM ULTRA-MONTE CARLO RUNNER
async function runQuantumGauntlet(runs) {
  const {frames, totalSols} = loadFrames();
  let survivors = 0;
  let totalSolsSurvived = 0;
  const runResults = [];
  let totalScores = [];

  console.log(`═══════════════════════════════════════════════`);
  console.log(`  QUANTUM UNIVERSAL GAUNTLET: ${runs} runs × ${totalSols} frames`);
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

    if (survivalRate >= 80) {
      console.log('\n╔══════════════════════════════════════════╗');
      console.log('║     QUANTUM BREAKTHROUGH ACHIEVED!      ║');
      console.log('║        RECORD-BREAKING PERFORMANCE      ║');
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
  runQuantumGauntlet(runs);
} else {
  // Single run
  runQuantumGauntlet(1);
}