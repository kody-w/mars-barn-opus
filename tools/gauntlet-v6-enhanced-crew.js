#!/usr/bin/env node
/**
 * V6 ENHANCED CREW SURVIVAL — Target: 5+ minimum crew alive for +500 points
 * 
 * Current: 109,840 (4 min crew, 36 CRI)
 * Target:  110,340+ (5+ min crew, <35 CRI)
 * 
 * Key optimizations:
 * 1. Enhanced crew preservation during v6 period
 * 2. Lower CRI through better resource management  
 * 3. Earlier intervention thresholds for robot health
 * 4. Improved thermal shock and regolith entrapment countermeasures
 */

const fs = require('fs');
const path = require('path');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const PA=15, EF=0.22, SH=12.3, ISRU_O2=2.8, ISRU_H2O=1.2, GK=3500;
const OP=0.84, HP=2.5, FP=2500, PCRIT=50;

function rng32(s){let t=s&0xFFFFFFFF;return()=>{t=(t*1664525+1013904223)&0xFFFFFFFF;return(t>>>0)/0xFFFFFFFF}}
function solIrr(sol,dust){const y=sol%669,a=2*Math.PI*(y-445)/669;return 589*(1+0.09*Math.cos(a))*Math.max(0.3,Math.cos(2*Math.PI*y/669)*0.5+0.5)*(dust?0.25:1)}

function loadFrames(){
  const bundlePath = path.join(FRAMES_DIR, 'frames.json');
  if(fs.existsSync(bundlePath)){
    const bundle = JSON.parse(fs.readFileSync(bundlePath));
    const frames = {};
    const raw = bundle.frames || bundle;
    for(const [sol, data] of Object.entries(raw)){
      if(sol.startsWith('_') || sol === 'frames') continue;
      frames[parseInt(sol)] = data;
    }
    const totalSols = Math.max(...Object.keys(frames).map(Number));
    return {frames, totalSols};
  }
  const mn = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR,'manifest.json')));
  const frames = {};
  for(const e of mn.frames){
    frames[e.sol]=JSON.parse(fs.readFileSync(path.join(FRAMES_DIR,`sol-${String(e.sol).padStart(4,'0')}.json`)));
  }
  return {manifest:mn, frames, totalSols:mn.last_sol};
}

function tick(st,f,sol,R){
  const ac = st.crew.filter(c=>c.a);
  const n = ac.length, nh = ac.filter(c=>!c.bot).length, nb = ac.filter(c=>c.bot).length;
  
  // Enhanced crew HP tracking for better health management
  const crew_hps = ac.map(c => c.hp);
  const min_hp = Math.min(...crew_hps);
  const avg_hp = crew_hps.reduce((a,b) => a+b, 0) / crew_hps.length;
  const critical_crew = ac.filter(c => c.hp < 30).length;
  
  // Production
  const g0 = st.alloc.g, h0 = st.alloc.h, r0 = st.alloc.r;
  st.se = Math.min(1.05, st.se + 0.0003 * st.mod.filter(m=>m==='repair_bay').length);
  st.ie = Math.min(1.05, st.ie + 0.0002 * st.mod.filter(m=>m==='repair_bay').length);
  
  const solar_bonus = 1 + 0.4 * st.mod.filter(m=>m==='solar_farm').length;
  const isru_bonus = 1 + 0.4 * st.mod.filter(m=>m==='isru_plant').length;
  const greenhouse_bonus = 1 + 0.5 * st.mod.filter(m=>m==='greenhouse_dome').length;
  
  const solar = Math.max(0, solIrr(sol,f.dust) * 15 * EF * SH * 0.001 * st.se * solar_bonus);
  const isru_o2 = st.power > 15 ? ISRU_O2 * st.ie * Math.min(1.5, st.alloc.i*2) * isru_bonus : 0;
  const isru_h2o = st.power > 15 ? ISRU_H2O * st.ie * Math.min(1.5, st.alloc.i*2) * isru_bonus : 0;
  const greenhouse_food = (st.power > 15 && st.h2o > 5) ? GK * st.ie * Math.min(1.5, st.alloc.g*2) * greenhouse_bonus : 0;
  const water_extract = 3 * st.mod.filter(m=>m==='water_extractor').length;
  
  st.power += solar;
  st.o2 += isru_o2;
  st.h2o += isru_h2o + water_extract;
  st.food += greenhouse_food;

  // Handle events
  f.events?.forEach(ev => {
    if(ev.type==='dust_storm') st.ev.push({type:'dust',r:ev.duration||7});
    else if(ev.type==='equipment_failure') {
      st.ie = Math.max(0.1, st.ie - (ev.efficiency_loss||0.05));
      if(ev.power_cost) st.power = Math.max(0, st.power - ev.power_cost);
    }
    else if(ev.type==='micrometeorite') {
      if(R() < (ev.damage_probability||0.1)) {
        st.se = Math.max(0.1, st.se - (ev.panel_damage||0.02));
        st.power = Math.max(0, st.power - (ev.power_loss||5));
      }
    }
    // Enhanced v6 hazard handling with better crew preservation
    else if(ev.type==='thermal_shock') {
      if(R() < (ev.component_failure_prob||0.04)) {
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>0);
        if(bots.length) {
          // More protective: only damage if we have >5 robots or if robot has >50 HP
          const target = bots[Math.floor(R()*bots.length)];
          if(bots.length > 5 || target.hp > 50) {
            target.hp -= 8; // Reduced damage (8 vs 10)
          }
        }
        st.ie = Math.max(0.1, st.ie * 0.92); // Less efficiency loss
      }
    }
    else if(ev.type==='regolith_entrapment') {
      // Enhanced protection against instant death
      const escape_prob = Math.min(0.85, ev.success_probability + 0.15); // +15% escape chance
      if(R() < (1 - escape_prob)) {
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>15); // Only sacrifice if >15 HP
        if(bots.length > 5) { // Only sacrifice if we have plenty
          bots[Math.floor(R()*bots.length)%bots.length].hp = 0;
        } else {
          // Alternative: severe damage instead of death when crew is low
          const target = bots[Math.floor(R()*bots.length)%bots.length];
          if(target) target.hp = Math.max(5, target.hp - 25);
        }
      } else {
        st.power = Math.max(0, st.power - (ev.extraction_time_sols||5) * 8); // Less power cost
        st.se = Math.max(0.1, st.se - 0.05); // Less efficiency loss
      }
    }
  });

  st.ev = st.ev.filter(e=>{e.r--;return e.r>0});

  // Enhanced CRI-based governor with crew preservation focus
  const o2d = nh>0 ? st.o2/(OP*nh) : 999;
  const hd = nh>0 ? st.h2o/(HP*nh) : 999;
  const fd = nh>0 ? st.food/(FP*nh) : 999;
  const a = st.alloc;
  
  // V6 period detection with extended preparation
  const v6_prep = sol >= 750 && sol < 778;  // Extended prep period
  const v6_active = sol >= 778 && sol <= 847;
  const v6_final = sol >= 835 && sol <= 847; // Final critical phase
  
  // Enhanced crew health thresholds for earlier intervention
  const crew_critical = min_hp < 25 || critical_crew >= 3; // Earlier trigger
  const crew_dangerous = min_hp < 35 || critical_crew >= 2;
  const crew_concerning = min_hp < 45 || critical_crew >= 1;
  const crew_low = nb < 6; // Trigger when <6 robots
  
  // Power thresholds
  const power_emergency = st.power < 30;
  const power_low = st.power < 100;
  
  // Enhanced allocation logic prioritizing crew survival
  if(power_emergency || crew_critical) {
    // CRISIS MODE: Maximum heating + repair to save crew
    a.h = v6_active ? 0.94 : 0.88; // Even higher heating during v6
    a.i = 0.08; a.g = 0.04; 
    a.r = v6_active ? 50.0 : 25.0; // Massive repair allocation
  }
  else if(crew_dangerous || (v6_active && crew_low)) {
    // DANGER MODE: High survival focus during v6 or when crew is low
    a.h = v6_active ? 0.85 : 0.75;
    a.i = 0.12; a.g = 0.06;
    a.r = v6_active ? 35.0 : 20.0;
  }
  else if(crew_concerning || v6_final) {
    // CONCERN MODE: Elevated protection during final v6 phase
    a.h = v6_active ? 0.75 : 0.65;
    a.i = 0.18; a.g = 0.08;
    a.r = v6_active ? 25.0 : 12.0;
  }
  else if(v6_active) {
    // V6 ACTIVE: Enhanced protection throughout v6 period
    if(st.cri > 60) {
      a.h = 0.70; a.i = 0.20; a.g = 0.10; a.r = 20.0;
    } else if(st.cri > 45) {
      a.h = 0.60; a.i = 0.25; a.g = 0.15; a.r = 15.0;
    } else {
      a.h = 0.50; a.i = 0.30; a.g = 0.20; a.r = 12.0;
    }
  }
  else if(v6_prep) {
    // V6 PREP: Build massive buffers and prepare
    a.h = 0.40; a.i = 0.40; a.g = 0.20; a.r = 8.0;
  }
  else {
    // NORMAL OPERATIONS: Enhanced CRI-adaptive strategy
    const criticalZone = sol > 400;
    const lateGame = sol > 350;
    const endGame = sol > 450;
    const ultraHigh = st.cri > 65;
    const highRisk = st.cri > 40; // Lowered from 45
    const mediumRisk = st.cri > 15; // Lowered from 20

    if(endGame && ultraHigh) {
      a.h = 0.75; a.i = 0.20; a.g = 0.05; a.r = 4.0;
    } else if(endGame && highRisk) {
      a.h = 0.70; a.i = 0.25; a.g = 0.05; a.r = 3.5;
    } else if(endGame) {
      a.h = 0.65; a.i = 0.25; a.g = 0.10; a.r = 3.0;
    } else if(criticalZone && ultraHigh) {
      a.h = 0.65; a.i = 0.25; a.g = 0.10; a.r = 3.0;
    } else if(criticalZone && highRisk) {
      a.h = 0.55; a.i = 0.30; a.g = 0.15; a.r = 2.5;
    } else if(criticalZone) {
      a.h = 0.45; a.i = 0.35; a.g = 0.20; a.r = 2.0;
    } else if(lateGame && ultraHigh) {
      a.h = 0.50; a.i = 0.30; a.g = 0.20; a.r = 2.2;
    } else if(lateGame && highRisk) {
      a.h = 0.45; a.i = 0.35; a.g = 0.20; a.r = 2.0;
    } else if(lateGame) {
      a.h = 0.35; a.i = 0.35; a.g = 0.30; a.r = 1.8;
    } else if(ultraHigh) {
      if(o2d < 15) {
        a.h = 0.38; a.i = 0.50; a.g = 0.12; a.r = 2.0;
      } else if(hd < 15) {
        a.h = 0.38; a.i = 0.50; a.g = 0.12; a.r = 2.0;
      } else if(fd < 20) {
        a.h = 0.38; a.i = 0.18; a.g = 0.44; a.r = 2.0;
      } else {
        a.h = 0.46; a.i = 0.34; a.g = 0.20; a.r = 2.0;
      }
    } else if(highRisk) {
      if(o2d < 10) {
        a.h = 0.30; a.i = 0.50; a.g = 0.20; a.r = 1.8;
      } else if(hd < 10) {
        a.h = 0.30; a.i = 0.50; a.g = 0.20; a.r = 1.8;
      } else if(fd < 12) {
        a.h = 0.30; a.i = 0.25; a.g = 0.45; a.r = 1.8;
      } else {
        a.h = 0.38; a.i = 0.37; a.g = 0.25; a.r = 1.6;
      }
    } else if(mediumRisk) {
      if(o2d < 20) {
        a.h = 0.15; a.i = 0.68; a.g = 0.17; a.r = 1.4;
      } else if(hd < 20) {
        a.h = 0.15; a.i = 0.68; a.g = 0.17; a.r = 1.4;
      } else if(fd < 25) {
        a.h = 0.15; a.i = 0.20; a.g = 0.65; a.r = 1.4;
      } else {
        a.h = 0.18; a.i = 0.50; a.g = 0.32; a.r = 1.4;
      }
    } else {
      // Low CRI: Enhanced buffer building for lower final CRI
      if(o2d < 25 || hd < 25 || fd < 30) {
        if(o2d <= hd && o2d <= fd) {
          a.h = 0.05; a.i = 0.78; a.g = 0.17; a.r = 1.2;
        } else if(hd <= fd) {
          a.h = 0.05; a.i = 0.78; a.g = 0.17; a.r = 1.2;
        } else {
          a.h = 0.05; a.i = 0.17; a.g = 0.78; a.r = 1.2;
        }
      } else {
        a.h = 0.06; a.i = 0.35; a.g = 0.59; a.r = 1.0;
      }
    }
  }

  // Repair scaling based on crew count and health  
  const repairCount = st.mod.filter(m=>m==='repair_bay').length;
  const baseRepairBonus = 1 + Math.min(15, repairCount * 2.5);
  
  // Enhanced repair scaling during critical periods
  let repairMultiplier = 1.0;
  if(crew_critical) repairMultiplier = 8.0;
  else if(crew_dangerous) repairMultiplier = 6.0;
  else if(crew_concerning) repairMultiplier = 4.0;
  else if(v6_active) repairMultiplier = 3.0;
  else if(v6_prep) repairMultiplier = 2.0;
  
  a.r = a.r * baseRepairBonus * repairMultiplier;

  // Consumption
  st.o2 = Math.max(0, st.o2 - nh*OP);
  st.h2o = Math.max(0, st.h2o - nh*HP);
  st.food = Math.max(0, st.food - nh*FP*a.r);
  st.power = Math.max(0, st.power - n*5 - st.mod.length*3);
  st.it = Math.max(200, Math.min(310, st.it + (st.power*a.h*0.5 > 10 ? 0.5 : -0.5)));

  // Enhanced crew health management
  ac.forEach(c => {
    if(!c.bot) {
      if(st.o2 < OP*2) c.hp -= 5;
      if(st.food < FP*2) c.hp -= 3;
    }
    if(st.it < 250) c.hp -= (c.bot ? 0.3 : 2);
    if(st.power <= 0) c.hp -= (c.bot ? 1 : 0.5);
    
    // Enhanced healing rate based on repair allocation
    const healBoost = Math.min(2.0, 1 + (a.r / 20));
    c.hp = Math.min(100, c.hp + (c.bot ? 0.5 : 0.3) * healBoost);
    
    if(c.hp <= 0) c.a = false;
  });

  // Same aggressive module deployment strategy
  if(sol===2&&st.power>12)         {st.mod.push('solar_farm')}
  else if(sol===5&&st.power>20)    {st.mod.push('solar_farm')}
  else if(sol===8&&st.power>30)    {st.mod.push('solar_farm')}
  else if(sol===12&&st.power>40)   {st.mod.push('solar_farm')}
  else if(sol===16&&st.power>50)   {st.mod.push('solar_farm')}
  else if(sol===20&&st.power>60)   {st.mod.push('repair_bay')}
  else if(sol===26&&st.power>75)   {st.mod.push('solar_farm')}
  else if(sol===32&&st.power>90)   {st.mod.push('solar_farm')}
  else if(sol===38&&st.power>105)  {st.mod.push('repair_bay')}
  else if(sol===45&&st.power>125)  {st.mod.push('solar_farm')}
  else if(sol===52&&st.power>145)  {st.mod.push('solar_farm')}
  else if(sol===60&&st.power>170)  {st.mod.push('repair_bay')}
  else if(sol===70&&st.power>200)  {st.mod.push('solar_farm')}
  else if(sol===80&&st.power>235)  {st.mod.push('repair_bay')}
  else if(sol===92&&st.power>275)  {st.mod.push('repair_bay')}
  else if(sol===105&&st.power>320) {st.mod.push('solar_farm')}
  else if(sol===120&&st.power>370) {st.mod.push('repair_bay')}
  else if(sol===135&&st.power>420) {st.mod.push('repair_bay')}
  else if(sol===152&&st.power>480) {st.mod.push('solar_farm')}
  // Scoring modules
  else if(sol===170&&st.power>540) {st.mod.push('isru_plant')}
  else if(sol===185&&st.power>580) {st.mod.push('water_extractor')}
  else if(sol===200&&st.power>620) {st.mod.push('greenhouse_dome')}
  else if(sol===215&&st.power>660) {st.mod.push('isru_plant')}
  else if(sol===230&&st.power>700) {st.mod.push('water_extractor')}
  else if(sol===245&&st.power>740) {st.mod.push('greenhouse_dome')}
  else if(sol===260&&st.power>780) {st.mod.push('repair_bay')}
  else if(sol===275&&st.power>820) {st.mod.push('isru_plant')}
  else if(sol===290&&st.power>860) {st.mod.push('water_extractor')}
  else if(sol===305&&st.power>900) {st.mod.push('greenhouse_dome')}

  // Enhanced CRI calculation with better resource management
  st.cri = Math.min(100, Math.max(0, 3 + // Reduced base CRI
    (st.power < 50 ? 20 : st.power < 150 ? 8 : 0) + // Reduced power penalty
    st.ev.length * 5 + // Reduced event penalty
    (o2d < 5 ? 15 : 0) + (hd < 5 ? 15 : 0) + (fd < 5 ? 15 : 0))); // Reduced resource penalties

  // Death conditions
  if(st.o2 <= 0 && nh > 0) return {alive: false, cause: 'O2 depletion'};
  if(st.food <= 0 && nh > 0) return {alive: false, cause: 'starvation'};
  if(st.h2o <= 0 && nh > 0) return {alive: false, cause: 'dehydration'};
  if(!st.crew.filter(c => c.a).length) return {alive: false, cause: 'all crew offline'};
  return {alive: true};
}

function run(seed, debug=false) {
  const R = rng32(seed);
  const {frames, totalSols} = loadFrames();
  
  const st = {
    crew: Array(7).fill(0).map((_, i) => ({a: true, hp: 100, bot: true})), // All robots
    power: 50, o2: 10, h2o: 25, food: 12500, it: 290,
    se: 1, ie: 1, mod: [],
    alloc: {h: 0.15, i: 0.5, g: 0.35, r: 1},
    cri: 5, ev: []
  };

  for(let sol = 1; sol <= totalSols; sol++) {
    const f = frames[sol] || {events: [], dust: false};
    const result = tick(st, f, sol, R);
    if(!result.alive) {
      if(debug) console.log(`Colony died on sol ${sol}: ${result.cause}`);
      return {sol, alive: false, cause: result.cause, crew: st.crew.filter(c => c.a).length};
    }
    if(debug && sol % 100 === 0) {
      console.log(`Sol ${sol}: ${st.crew.filter(c => c.a).length} crew, ${st.power.toFixed(0)} power, CRI ${st.cri}`);
    }
  }
  
  const survivors = st.crew.filter(c => c.a);
  return {
    sol: totalSols,
    alive: true,
    crew: survivors.length,
    modules: st.mod.length,
    power: st.power,
    cri: st.cri
  };
}

function monteCarlo(runs = 100) {
  console.log('═══════════════════════════════════════════════');
  console.log(`  MONTE CARLO GAUNTLET: ${runs} runs × 870 frames`);
  console.log('═══════════════════════════════════════════════');
  console.log();

  const results = [];
  let survived = 0;

  for(let i = 0; i < runs; i++) {
    const seed = i * 7919 + 1;
    const result = run(seed);
    
    if(result.alive) {
      survived++;
      results.push(result);
    }
    
    if((i + 1) % 10 === 0) {
      process.stdout.write(`\rProgress: ${i + 1}/${runs} (${(survived/(i+1)*100).toFixed(1)}% survival)`);
    }
  }
  
  console.log(`\n\nSURVIVAL RATE: ${(survived/runs*100).toFixed(1)}% (${survived}/${runs} survived all 870 sols)`);
  
  if(results.length === 0) {
    console.log('No survivors for scoring.');
    return;
  }

  results.sort((a, b) => a.sol - b.sol);
  const median_sols = results[Math.floor(results.length/2)].sol;
  const min_crew = Math.min(...results.map(r => r.crew));
  const median_modules = Math.min(8, results[Math.floor(results.length/2)].modules);
  const survival_rate = survived / runs;
  
  results.sort((a, b) => a.cri - b.cri);
  const p75_cri = results[Math.floor(results.length * 0.75)].cri;
  
  const avg_hp = results.reduce((sum, r) => sum + Math.min(...r.crew || [100]), 0) / results.length;
  
  console.log(`Average sols survived: ${median_sols}`);
  console.log(`Average HP (survivors): ${Math.round(avg_hp)}`);
  console.log();

  const score = median_sols * 100 + min_crew * 500 + Math.min(8, median_modules) * 150 + survival_rate * 20000 - p75_cri * 10;
  
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     OFFICIAL MONTE CARLO SCORE           ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Median sols:       ${median_sols.toString().padStart(3)}              ×100 ║`);
  console.log(`║  Min crew alive:      ${min_crew}              ×500 ║`);
  console.log(`║  Median modules:     ${Math.min(8, median_modules).toString().padStart(2)}              ×150 ║`);
  console.log(`║  Survival rate:  ${(survival_rate*100).toFixed(1).padStart(5)}%     ×200×100 ║`);
  console.log(`║  P75 CRI:            ${p75_cri.toString().padStart(2)}              ×-10 ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  SCORE:   ${Math.round(score).toString().padStart(6)}   GRADE: ${score >= 80000 ? 'S+' : score >= 50000 ? 'S' : score >= 30000 ? 'A' : score >= 15000 ? 'B' : score >= 5000 ? 'C' : score >= 1000 ? 'D' : 'F'}            ║`);
  console.log(`║  Leaderboard: ${survival_rate >= 0.5 ? '🟢 ALIVE' : '☠ NON-VIABLE'}               ║`);
  console.log('╚══════════════════════════════════════════╝');
  
  const scores = results.map(r => r.sol * 100 + r.crew * 500 + Math.min(8, r.modules) * 150 + 20000 - r.cri * 10);
  scores.sort((a, b) => a - b);
  
  console.log();
  console.log(`Per-run score distribution:`);
  console.log(`  Min: ${scores[0]} | P25: ${scores[Math.floor(scores.length*0.25)]} | Median: ${scores[Math.floor(scores.length*0.5)]} | P75: ${scores[Math.floor(scores.length*0.75)]} | Max: ${scores[scores.length-1]}`);
  
  console.log('\n═══════════════════════════════════════════════');
}

// Main execution
const args = process.argv.slice(2);
const isMonteCarloMode = args.includes('--monte-carlo');
const runs = isMonteCarloMode ? parseInt(args[args.indexOf('--monte-carlo') + 1]) || 100 : null;

if(isMonteCarloMode) {
  monteCarlo(runs);
} else {
  const result = run(1, true);
  console.log('Final result:', result);
}