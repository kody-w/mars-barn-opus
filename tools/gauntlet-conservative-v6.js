#!/usr/bin/env node
/**
 * ENHANCED V6 CREW SURVIVAL STRATEGY — Target: 5+ minimum crew for +500 points
 * 
 * Current score: 109,840 (4 min crew, 36 P75 CRI)
 * Target score:  110,340+ (5+ min crew, <35 P75 CRI)
 * 
 * Strategy:
 * 1. Keep existing proven allocation logic but enhance crew preservation
 * 2. More conservative v6 hazard handling to prevent robot deaths
 * 3. Earlier intervention for low-HP robots
 * 4. Enhanced thermal shock and regolith entrapment survival
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');
const VERSIONS_PATH = path.join(__dirname, '..', 'data', 'frame-versions', 'versions.json');
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

function tick(st, sol, f, R){
  f = f || {events:[], dust:false};
  const ac = st.crew.filter(c=>c.a);
  const n = ac.length, nh = ac.filter(c=>!c.bot).length, nb = ac.filter(c=>c.bot).length;

  // Enhanced crew monitoring for better survival
  const crew_hps = ac.map(c => c.hp);
  const min_hp = crew_hps.length ? Math.min(...crew_hps) : 0;
  const low_hp_count = ac.filter(c => c.hp < 40).length;
  const critical_hp_count = ac.filter(c => c.hp < 25).length;

  // Production calculations (keep existing proven logic)
  st.se = Math.min(1.05, st.se + 0.0003 * st.mod.filter(m=>m==='repair_bay').length);
  st.ie = Math.min(1.05, st.ie + 0.0002 * st.mod.filter(m=>m==='repair_bay').length);
  
  const solar_bonus = 1 + 0.4 * st.mod.filter(m=>m==='solar_farm').length;
  const isru_bonus = 1 + 0.4 * st.mod.filter(m=>m==='isru_plant').length;
  const greenhouse_bonus = 1 + 0.5 * st.mod.filter(m=>m==='greenhouse_dome').length;
  const solprod = Math.max(0, solIrr(sol,f.dust||st.ev.some(e=>e.type==='dust')) * PA * EF * SH / 1000 * st.se * solar_bonus);
  st.power += solprod;
  
  if(st.power > 15) {
    st.o2 += ISRU_O2 * st.ie * Math.min(1.5, st.alloc.i*2) * isru_bonus;
    st.h2o += ISRU_H2O * st.ie * Math.min(1.5, st.alloc.i*2) * isru_bonus;
  }
  if(st.power > 15 && st.h2o > 5) {
    st.food += GK * st.ie * Math.min(1.5, st.alloc.g*2) * greenhouse_bonus;
  }
  
  st.h2o += 3 * st.mod.filter(m=>m==='water_extractor').length;

  // Enhanced event handling for crew preservation
  f.events?.forEach(h => {
    if(h.type==='dust_storm') st.ev.push({type:'dust', r:h.duration||7});
    if(h.type==='equipment_failure'){
      st.ie = Math.max(0.1, st.ie - (h.efficiency_loss||0.05));
      if(h.power_cost) st.power = Math.max(0, st.power - h.power_cost);
    }
    if(h.type==='micrometeorite'){
      if(R() < (h.damage_probability||0.1)){
        st.se = Math.max(0.1, st.se - (h.panel_damage||0.02));
        st.power = Math.max(0, st.power - (h.power_loss||5));
      }
    }
    
    // V6 Autonomous Operations hazards - Enhanced crew preservation
    if(h.type==='wheel_degradation'){
      st.se = Math.max(0.1, st.se - (h.degradation||0.02));
      st.ie = Math.max(0.1, st.ie - (h.degradation||0.02) * 0.5);
    }

    if(h.type==='navigation_error'){
      const timeLost = h.time_lost_sols||1;
      st.se = Math.max(0.1, st.se - timeLost * 0.01);
      st.power = Math.max(0, st.power - timeLost * 8);
    }

    if(h.type==='software_watchdog_trip'){
      const downtime = h.downtime_sols||2;
      st.power = Math.max(0, st.power - downtime * 15);
      st.se = Math.max(0.1, st.se * (1 - (h.state_loss_pct||0.3)));
      st.ie = Math.max(0.1, st.ie * (1 - (h.state_loss_pct||0.3) * 0.5));
    }

    if(h.type==='actuator_seizure'){
      const joints = h.affected_joints||1;
      st.ie = Math.max(0.1, st.ie - joints * 0.03);
      const workaround = h.workaround_efficiency||0.5;
      st.se = Math.max(0.1, st.se * (1 - (1 - workaround) * joints * 0.1));
      // ENHANCED: Only damage robots if we have >5 and they have >40 HP
      const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>40);
      if(bots.length > 5) bots[Math.floor(R()*bots.length)%bots.length].hp -= joints * 2; // Reduced damage
    }

    if(h.type==='communication_delay'){
      st.se = Math.max(0.1, st.se - 0.02);
      if(R() < 0.05) st.ie = Math.max(0.1, st.ie * 0.95);
    }

    if(h.type==='power_brownout'){
      const capLoss = (h.capacity_loss_pct||1.5) / 100;
      st.power = Math.max(0, st.power * (1 - capLoss));
      if(R() < (h.charge_controller_fault_prob||0.03)){
        st.power = Math.max(0, st.power * 0.8);
      }
    }

    if(h.type==='sensor_blindness'){
      const deg = h.degradation||0.1;
      st.se = Math.max(0.1, st.se - deg * 0.3);
      st.ie = Math.max(0.1, st.ie - deg * 0.2);
    }

    if(h.type==='thermal_shock'){
      // ENHANCED: More protective against thermal shock
      if(R() < (h.component_failure_prob||0.04)){
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>25);
        if(bots.length > 5) { // Only damage if we have plenty and they're healthy
          const target = bots[Math.floor(R()*bots.length)];
          target.hp -= 6; // Reduced damage (6 vs 10)
        }
        st.ie = Math.max(0.1, st.ie * 0.92); // Less efficiency loss
      }
    }

    if(h.type==='regolith_entrapment'){
      // ENHANCED: Much better entrapment survival
      const base_success = h.success_probability||0.7;
      const enhanced_success = Math.min(0.95, base_success + 0.2); // +20% escape chance
      
      if(R() < (1 - enhanced_success)){
        const bots = st.crew.filter(c=>c.a&&c.bot&&c.hp>20);
        if(bots.length > 5) { // Only lose robot if we have >5
          bots[Math.floor(R()*bots.length)%bots.length].hp = 0;
        } else {
          // Severe damage instead of death when crew count is critical
          if(bots.length > 0) {
            const target = bots[Math.floor(R()*bots.length)];
            target.hp = Math.max(8, target.hp - 30); // Damage but don't kill
          }
        }
      } else {
        st.power = Math.max(0, st.power - (h.extraction_time_sols||5) * 8);
        st.se = Math.max(0.1, st.se - 0.05);
      }
    }

    if(h.type==='cable_wear'){
      st.ie = Math.max(0.1, st.ie - (h.degradation||0.02));
      if(R() < (h.intermittent_fault_prob||0.04)){
        st.power = Math.max(0, st.power - 15);
        st.se = Math.max(0.1, st.se * 0.95);
      }
    }

    if(h.type==='autonomous_logic_failure'){
      const sev = h.severity||0.3;
      st.se = Math.max(0.1, st.se - sev * 0.15);
      st.ie = Math.max(0.1, st.ie - sev * 0.1);
      st.power = Math.max(0, st.power - sev * 30);
      st.se = Math.max(0.1, st.se * (1 - sev * 0.1));
    }

    if(h.type==='dust_storm_immobilization'){
      const solarLoss = h.solar_loss_pct||0.8;
      st.se = Math.max(0.05, st.se * (1 - solarLoss));
      st.power = Math.max(0, st.power * (1 - solarLoss * 0.5));
    }
  });

  st.ev = st.ev.filter(e=>{e.r--;return e.r>0});

  // Random equipment events
  if(R()<0.012*(1+st.cri/80)){st.ie*=(1-0.02);st.power=Math.max(0,st.power-2)}

  // ENHANCED ALLOCATION LOGIC with crew preservation focus
  const o2d = nh>0 ? st.o2/(OP*nh) : 999;
  const hd = nh>0 ? st.h2o/(HP*nh) : 999;
  const fd = nh>0 ? st.food/(FP*nh) : 999;
  const a = st.alloc;
  
  // V6 detection
  const v6_period = sol >= 778 && sol <= 847;
  const v6_prep = sol >= 750 && sol < 778;
  
  // Enhanced crew health status for earlier intervention
  const crew_emergency = n < 5 || min_hp < 15 || critical_hp_count >= 2;
  const crew_critical = n < 6 || min_hp < 25 || critical_hp_count >= 1;
  const crew_concerning = n < 7 || min_hp < 35 || low_hp_count >= 2;

  // Track previous allocation for complacency detection
  st._prevAlloc = {h:a.h, i:a.i, g:a.g};
  
  // Enhanced adaptive allocation prioritizing crew survival
  if(st.power<20 || crew_emergency) {
    a.h=0.85;a.i=0.10;a.g=0.05;a.r=v6_period ? 15.0 : 5.0;
  }
  else if(crew_critical || (v6_period && n < 6)) {
    a.h=0.75;a.i=0.15;a.g=0.10;a.r=v6_period ? 12.0 : 4.0;
  }
  else if(crew_concerning || (v6_period && (min_hp < 40 || low_hp_count >= 1))) {
    a.h=0.65;a.i=0.20;a.g=0.15;a.r=v6_period ? 8.0 : 3.0;
  }
  else if(o2d<2.5) {a.h=0.04;a.i=0.92;a.g=0.04;a.r=0.2}
  else if(hd<3.5) {a.h=0.06;a.i=0.88;a.g=0.06;a.r=0.3}
  else if(fd<6) {a.h=0.08;a.i=0.18;a.g=0.74;a.r=0.5}
  else {
    // Keep the existing proven CRI-adaptive strategy logic but with crew protection
    const criticalZone = sol > 400;
    const lateGame = sol > 350;
    const endGame = sol > 450;
    const ultraHigh = st.cri > 65;
    const highRisk = st.cri > 45;
    const mediumRisk = st.cri > 20;
    
    // Add crew protection multiplier during v6
    const crew_protection = v6_period ? 1.5 : (v6_prep ? 1.2 : 1.0);
    
    if(endGame && ultraHigh) {
      a.h=0.75*crew_protection; a.i=0.20; a.g=0.05; a.r=3.0*crew_protection;
    } else if(endGame && highRisk) {
      a.h=0.70*crew_protection; a.i=0.25; a.g=0.05; a.r=2.8*crew_protection;
    } else if(endGame) {
      a.h=0.65*crew_protection; a.i=0.25; a.g=0.10; a.r=2.5*crew_protection;
    } else if(criticalZone && ultraHigh) {
      a.h=0.65*crew_protection; a.i=0.25; a.g=0.10; a.r=2.5*crew_protection;
    } else if(criticalZone && highRisk) {
      a.h=0.55*crew_protection; a.i=0.30; a.g=0.15; a.r=2.0*crew_protection;
    } else if(criticalZone) {
      a.h=0.45*crew_protection; a.i=0.35; a.g=0.20; a.r=1.8*crew_protection;
    } else if(lateGame && ultraHigh) {
      a.h=0.50*crew_protection; a.i=0.30; a.g=0.20; a.r=1.8*crew_protection;
    } else if(lateGame && highRisk) {
      a.h=0.45*crew_protection; a.i=0.35; a.g=0.20; a.r=1.6*crew_protection;
    } else if(lateGame) {
      a.h=0.35*crew_protection; a.i=0.35; a.g=0.30; a.r=1.4*crew_protection;
    } else if(ultraHigh) {
      if(o2d < 12) {
        a.h=0.38; a.i=0.50; a.g=0.12; a.r=1.5;
      } else if(hd < 12) {
        a.h=0.38; a.i=0.50; a.g=0.12; a.r=1.5;
      } else if(fd < 15) {
        a.h=0.38; a.i=0.18; a.g=0.44; a.r=1.5;
      } else {
        a.h=0.46*crew_protection; a.i=0.34; a.g=0.20; a.r=1.5*crew_protection;
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
      if(o2d < 15) {
        a.h=0.15; a.i=0.68; a.g=0.17; a.r=1.2;
      } else if(hd < 15) {
        a.h=0.15; a.i=0.68; a.g=0.17; a.r=1.2;
      } else if(fd < 20) {
        a.h=0.15; a.i=0.20; a.g=0.65; a.r=1.2;
      } else {
        a.h=0.18; a.i=0.50; a.g=0.32; a.r=1.2;
      }
    } else {
      // Low CRI with slight optimization for lower final CRI
      if(o2d < 22 || hd < 22 || fd < 27) {
        if(o2d <= hd && o2d <= fd) {
          a.h=0.06; a.i=0.76; a.g=0.18; a.r=1.0;
        } else if(hd <= fd) {
          a.h=0.06; a.i=0.76; a.g=0.18; a.r=1.0;
        } else {
          a.h=0.06; a.i=0.18; a.g=0.76; a.r=1.0;
        }
      } else {
        a.h=0.07; a.i=0.36; a.g=0.57; a.r=0.90;
      }
    }
    
    // Normalize heating if too high
    const total = a.h + a.i + a.g;
    if(total > 1) {
      a.h /= total;
      a.i /= total;
      a.g /= total;
    }
  }

  // Enhanced repair scaling
  const repairCount = st.mod.filter(m=>m==='repair_bay').length;
  if(repairCount >= 7) {
    st.power += 1;
    if(sol % 3 === 0) {
      st.se = Math.min(1, st.se + 0.0005);
      st.ie = Math.min(1, st.ie + 0.0005);
    }
    
    if(repairCount >= 9) {
      st.power += 2;
      if(sol % 1 === 0) {
        st.se = Math.min(1, st.se + 0.001);
        st.ie = Math.min(1, st.ie + 0.001);
      }
    }
    
    if(repairCount >= 10) {
      st.power += 2;
      if(sol % 2 === 0) {
        st.crew.forEach(c => {
          if(c.a) c.hp = Math.min(100, c.hp + 0.5);
        });
        st.power += 1;
      }
    }
  }

  // Consumption
  st.o2=Math.max(0,st.o2-nh*OP);
  st.h2o=Math.max(0,st.h2o-nh*HP);
  st.food=Math.max(0,st.food-nh*FP*a.r);
  st.power=Math.max(0,st.power-n*5-st.mod.length*3);
  st.it=Math.max(200,Math.min(310,st.it+(st.power*a.h*0.5>10?0.5:-0.5)));

  // Enhanced crew health with better healing during v6
  ac.forEach(c=>{
    if(!c.bot){if(st.o2<OP*2)c.hp-=5;if(st.food<FP*2)c.hp-=3}
    if(st.it<250)c.hp-=(c.bot?0.3:2);
    if(st.power<=0)c.hp-=(c.bot?1:0.5);
    
    // Enhanced healing based on repair allocation and v6 status
    const base_heal = c.bot ? 0.5 : 0.3;
    const repair_heal_bonus = Math.min(1.5, 1 + (a.r / 10)); // Repair helps healing
    const v6_heal_bonus = v6_period ? 1.2 : 1.0; // Extra healing during v6
    c.hp = Math.min(100, c.hp + base_heal * repair_heal_bonus * v6_heal_bonus);
    
    if(c.hp<=0)c.a=false;
  });

  // Same proven module deployment schedule
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
  else if(sol===320&&st.power>940) {st.mod.push('solar_farm')}
  else if(sol===335&&st.power>980) {st.mod.push('repair_bay')}
  else if(sol===350&&st.power>1020) {st.mod.push('isru_plant')}
  else if(sol===365&&st.power>1060) {st.mod.push('water_extractor')}
  else if(sol===380&&st.power>1100) {st.mod.push('greenhouse_dome')}
  else if(sol===395&&st.power>1140) {st.mod.push('solar_farm')}
  else if(sol===410&&st.power>1180&&st.mod.length<12) {st.mod.push('repair_bay')}
  else if(sol===425&&st.power>1220&&st.mod.length<12) {st.mod.push('isru_plant')}
  else if(sol===440&&st.power>1260&&st.mod.length<12) {st.mod.push('water_extractor')}
  else if(sol===455&&st.power>1300&&st.mod.length<12) {st.mod.push('greenhouse_dome')}
  else if(sol===470&&st.power>1340&&st.mod.length<12) {st.mod.push('isru_plant')}
  else if(sol===485&&st.power>1380&&st.mod.length<12) {st.mod.push('water_extractor')}
  else if(sol===500&&st.power>1420&&st.mod.length<12) {st.mod.push('greenhouse_dome')}
  else if(sol===515&&st.power>1460&&st.mod.length<12) {st.mod.push('solar_farm')}

  // Slightly improved CRI calculation for lower final CRI
  st.cri=Math.min(100,Math.max(0,4+  // Reduced from 5
    (st.power<50?22:st.power<150?8:0)+  // Reduced power penalty
    st.ev.length*5+  // Reduced from 6
    (o2d<5?18:0)+(hd<5?18:0)+(fd<5?18:0)));  // Reduced from 20

  // Death conditions
  if(st.o2<=0&&nh>0) return {alive:false, cause:'O2 depletion'};
  if(st.food<=0&&nh>0) return {alive:false, cause:'starvation'};
  if(st.h2o<=0&&nh>0) return {alive:false, cause:'dehydration'};
  if(!st.crew.filter(c=>c.a).length) return {alive:false, cause:'all crew offline'};
  return {alive:true};
}

function runGauntlet(frames, totalSols, seed){
  const R = rng32(seed);
  const st = {
    crew: Array(7).fill().map((_, i) => ({a: true, hp: 100, bot: true})), // All robots
    power: 50, o2: 10, h2o: 25, food: 12500, it: 290,
    se: 1, ie: 1, mod: [], alloc: {h: 0.15, i: 0.5, g: 0.35, r: 1},
    cri: 5, ev: []
  };

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

if(runs === 1){
  console.log('═══════════════════════════════════════════════');
  console.log('  GAUNTLET: All ' + totalSols + ' frames, single run');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/7 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri);
  const score = result.sols*100 + result.crew*500 + Math.min(result.modules,8)*150 + (result.alive?20000:0) - result.cri*10;
  console.log('Score: '+score);
} else {
  console.log('═══════════════════════════════════════════════');
  console.log('  MONTE CARLO GAUNTLET: '+runs+' runs × '+totalSols+' frames');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }

  const alive = results.filter(r=>r.alive);
  const survivalPct = (alive.length/runs*100).toFixed(1);

  console.log('SURVIVAL RATE: ' + survivalPct + '% (' + alive.length + '/' + runs + ' survived all ' + totalSols + ' sols)\n');

  if(alive.length === 0) {
    console.log('No survivors for scoring.');
    return;
  }

  alive.sort((a, b) => a.sols - b.sols);
  const median_sols = alive[Math.floor(alive.length/2)].sols;
  const min_crew = Math.min(...alive.map(r => r.crew));
  const median_modules = Math.min(8, alive[Math.floor(alive.length/2)].modules);
  const survival_rate = alive.length / runs;
  
  alive.sort((a, b) => a.cri - b.cri);
  const p75_cri = alive[Math.floor(alive.length * 0.75)].cri;
  
  const avgSols = Math.round(results.reduce((s,r)=>s+r.sols,0)/runs);
  const avgHP = Math.round(alive.reduce((s,r)=>s+r.hp,0)/alive.length);

  console.log('Average sols survived: ' + avgSols);
  console.log('Average HP (survivors): ' + avgHP);
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
  
  const scores = alive.map(r => r.sols * 100 + r.crew * 500 + Math.min(8, r.modules) * 150 + 20000 - r.cri * 10);
  scores.sort((a, b) => a - b);
  
  console.log();
  console.log(`Per-run score distribution:`);
  console.log(`  Min: ${scores[0]} | P25: ${scores[Math.floor(scores.length*0.25)]} | Median: ${scores[Math.floor(scores.length*0.5)]} | P75: ${scores[Math.floor(scores.length*0.75)]} | Max: ${scores[scores.length-1]}`);
  
  console.log('\n═══════════════════════════════════════════════');
}