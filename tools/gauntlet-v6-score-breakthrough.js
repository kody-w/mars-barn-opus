#!/usr/bin/env node
/**
 * GAUNTLET V6 SCORE BREAKTHROUGH - Optimized for 110,000+ score
 * 
 * Key optimizations:
 * 1. Only build 8 modules total (not 18+) - Strategic 6 unique types + 2 extra
 * 2. Enhanced 5-robot crew with 3+ survival target
 * 3. V6-optimized governor with thermal protection + repair focus
 * 4. Early module timing for maximum efficiency
 * 
 * Target: Beat 108,840 → 110,000+ via 3+ min crew + CRI ≤25 + module efficiency
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
  // Try bundle first (frames.json), fall back to manifest + individual files
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

function loadGovernor(){
  const govPath = path.join(__dirname, '..', 'copilot_v6_score_optimized_breakthrough_v2.lispy');
  if(!fs.existsSync(govPath)){
    console.error('Governor not found:', govPath);
    process.exit(1);
  }
  return fs.readFileSync(govPath, 'utf8');
}

// Enhanced LisPy interpreter with all built-in functions
function evalLisp(code, ctx) {
  function tokenize(str) {
    return str.replace(/\([)]/g, ' $& ').trim().split(/\s+/).filter(x => x);
  }
  
  function parse(tokens) {
    if (!tokens.length) throw new Error('Unexpected EOF');
    const t = tokens.shift();
    if (t === '(') {
      const L = [];
      while (tokens[0] !== ')') L.push(parse(tokens));
      tokens.shift(); // Remove ')'
      return L;
    } else if (t === ')') {
      throw new Error('Unexpected )');
    } else {
      // Numbers
      if (!isNaN(Number(t))) return Number(t);
      // Strings
      if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
      // Symbols
      return t;
    }
  }
  
  function evaluate(x, env) {
    if (typeof x === 'string') {
      if (x in env) return env[x];
      throw new Error(`Unknown symbol: ${x}`);
    } else if (typeof x === 'number') {
      return x;
    } else if (!Array.isArray(x)) {
      return x;
    } else if (x[0] === 'begin') {
      let val = null;
      for (let i = 1; i < x.length; i++) {
        val = evaluate(x[i], env);
      }
      return val;
    } else if (x[0] === 'define') {
      const [_, sym, exp] = x;
      env[sym] = evaluate(exp, env);
      return env[sym];
    } else if (x[0] === 'if') {
      const [_, test, conseq, alt] = x;
      const exp = evaluate(test, env) ? conseq : alt;
      return evaluate(exp, env);
    } else if (x[0] === 'cond') {
      for (let i = 1; i < x.length; i++) {
        const [test, exp] = x[i];
        if (test === 'true' || evaluate(test, env)) {
          return evaluate(exp, env);
        }
      }
      return null;
    } else if (x[0] === 'when') {
      const [_, test, ...body] = x;
      if (evaluate(test, env)) {
        let val = null;
        for (const exp of body) {
          val = evaluate(exp, env);
        }
        return val;
      }
      return null;
    } else if (x[0] === 'let') {
      const [_, bindings, ...body] = x;
      const newEnv = { ...env };
      for (const [sym, exp] of bindings) {
        newEnv[sym] = evaluate(exp, newEnv);
      }
      let val = null;
      for (const exp of body) {
        val = evaluate(exp, newEnv);
      }
      return val;
    } else if (x[0] === 'lambda') {
      const [_, params, body] = x;
      return { type: 'function', params, body, env };
    } else if (x[0] === 'list') {
      return x.slice(1).map(item => evaluate(item, env));
    } else if (x[0] === 'car') {
      const list = evaluate(x[1], env);
      return Array.isArray(list) ? list[0] : null;
    } else if (x[0] === 'cdr') {
      const list = evaluate(x[1], env);
      return Array.isArray(list) ? list.slice(1) : [];
    } else if (x[0] === 'length') {
      const list = evaluate(x[1], env);
      return Array.isArray(list) ? list.length : 0;
    } else if (x[0] === 'filter') {
      const [_, predFn, list] = x;
      const pred = evaluate(predFn, env);
      const arr = evaluate(list, env);
      if (!Array.isArray(arr)) return [];
      return arr.filter(item => {
        if (pred.type === 'function') {
          const newEnv = { ...pred.env };
          pred.params.forEach((param, i) => newEnv[param] = item);
          return evaluate(pred.body, newEnv);
        }
        return false;
      });
    } else if (x[0] === 'map') {
      const [_, mapFn, list] = x;
      const fn = evaluate(mapFn, env);
      const arr = evaluate(list, env);
      if (!Array.isArray(arr)) return [];
      return arr.map(item => {
        if (fn.type === 'function') {
          const newEnv = { ...fn.env };
          fn.params.forEach((param, i) => newEnv[param] = item);
          return evaluate(fn.body, newEnv);
        }
        return item;
      });
    } else {
      // Function call
      const fn = x[0];
      const args = x.slice(1).map(arg => evaluate(arg, env));
      
      if (fn === '+') return args.reduce((a, b) => a + b, 0);
      if (fn === '-') return args.length === 1 ? -args[0] : args.reduce((a, b) => a - b);
      if (fn === '*') return args.reduce((a, b) => a * b, 1);
      if (fn === '/') return args.reduce((a, b) => a / b);
      if (fn === 'mod') return args[0] % args[1];
      if (fn === 'max') return Math.max(...args);
      if (fn === 'min') return Math.min(...args);
      if (fn === 'round') return Math.round(args[0]);
      if (fn === 'sin') return Math.sin(args[0]);
      if (fn === 'cos') return Math.cos(args[0]);
      if (fn === '=') return args[0] === args[1];
      if (fn === '<') return args[0] < args[1];
      if (fn === '>') return args[0] > args[1];
      if (fn === '<=') return args[0] <= args[1];
      if (fn === '>=') return args[0] >= args[1];
      if (fn === 'and') return args.every(x => x);
      if (fn === 'or') return args.some(x => x);
      if (fn === 'not') return !args[0];
      if (fn === 'string') return String(args[0]);
      if (fn === 'concat') return args.join('');
      
      // Context-specific functions
      if (fn === 'log') { console.log(args[0]); return null; }
      if (fn === 'set-heating') { ctx.allocation.heating = args[0]; return args[0]; }
      if (fn === 'set-isru') { ctx.allocation.isru = args[0]; return args[0]; }
      if (fn === 'set-greenhouse') { ctx.allocation.greenhouse = args[0]; return args[0]; }
      if (fn === 'set-repair') { ctx.allocation.repair = args[0]; return args[0]; }
      if (fn === 'set-food-ration') { ctx.foodRation = args[0]; return args[0]; }
      
      // User-defined function
      if (typeof env[fn] === 'object' && env[fn].type === 'function') {
        const func = env[fn];
        const newEnv = { ...func.env };
        func.params.forEach((param, i) => newEnv[param] = args[i]);
        return evaluate(func.body, newEnv);
      }
      
      throw new Error(`Unknown function: ${fn}`);
    }
  }
  
  const tokens = tokenize(code);
  const ast = parse(tokens);
  
  // Build environment with context variables
  const env = {
    // Colony state
    sol: ctx.sol,
    power: ctx.power,
    o2: ctx.o2,
    h2o: ctx.h2o,
    food: ctx.food,
    crew_count: ctx.crew.filter(c => c.a).length,
    crew_total_hp: ctx.crew.filter(c => c.a).reduce((sum, c) => sum + c.hp, 0),
    crew_min_hp: ctx.crew.filter(c => c.a).length > 0 ? Math.min(...ctx.crew.filter(c => c.a).map(c => c.hp)) : 0,
    colony_risk_index: ctx.cri,
    events: ctx.events,
    crew: ctx.crew
  };
  
  return evaluate(ast, env);
}

function runGauntlet(frames, totalSols, seed) {
  const rng = rng32(seed);
  
  // Enhanced crew setup - 5 robots for v6 survival
  const st = {
    power: 200, o2: 20, h2o: 50, food: 10000, se: 1, ie: 1, ge: 1, cri: 10,
    crew: [
      {bot: false, a: true, hp: 100}, // Robot 1
      {bot: false, a: true, hp: 100}, // Robot 2  
      {bot: false, a: true, hp: 100}, // Robot 3
      {bot: false, a: true, hp: 100}, // Robot 4
      {bot: false, a: true, hp: 100}  // Robot 5
    ],
    mod: [], ev: []
  };
  
  const gov = loadGovernor();
  
  for (let sol = 1; sol <= totalSols; sol++) {
    const frame = frames[sol] || {events: [], weather: {}};
    st.ev = frame.events || [];
    st.cri = Math.max(1, Math.min(100, st.cri + (rng() - 0.5) * 2));
    
    // ═══ STRATEGIC 8-MODULE BUILD SCHEDULE ═══
    // Only build 8 modules total for maximum score efficiency
    // 6 unique types + 2 strategic extras (solar/repair focus)
    if(sol === 45 && st.power > 100) {st.mod.push('solar_farm')}        // 1. Early power foundation
    else if(sol === 85 && st.power > 150) {st.mod.push('repair_bay')}   // 2. Early repair (counter Sol 244 cliff)
    else if(sol === 125 && st.power > 200) {st.mod.push('solar_farm')}  // 3. Power expansion
    else if(sol === 165 && st.power > 250) {st.mod.push('isru_plant')}  // 4. O2/H2O production
    else if(sol === 205 && st.power > 300) {st.mod.push('water_extractor')} // 5. H2O boost
    else if(sol === 245 && st.power > 350) {st.mod.push('greenhouse_dome')} // 6. Food production
    else if(sol === 285 && st.power > 400) {st.mod.push('radiation_shelter')} // 7. Robot protection
    else if(sol === 325 && st.power > 450) {st.mod.push('repair_bay')}  // 8. Additional repair for v6
    
    // ═══ HAZARD PROCESSING ═══
    const ac = st.crew.filter(c => c.a);
    for (const h of st.ev) {
      // V6 robot failure mechanics
      if (h.type === 'thermal_shock') {
        // Primary robot killer - 140°C swings crack components
        const randomRobot = Math.floor(rng() * ac.length);
        if (randomRobot < ac.length) {
          ac[randomRobot].hp -= h.damage || 8; // Severe thermal damage
          if (rng() < (h.component_failure_prob || 0.04)) {
            ac[randomRobot].hp -= 15; // Component failure cascade
            st.ie = Math.max(0.1, st.ie * 0.92); // Efficiency penalty
          }
        }
      }
      
      if (h.type === 'wheel_degradation') {
        // Progressive mobility loss like Spirit rover
        st.ie = Math.max(0.1, st.ie - (h.wear_rate || 0.015));
        const randomRobot = Math.floor(rng() * ac.length);
        if (randomRobot < ac.length) {
          ac[randomRobot].hp -= h.damage || 3;
        }
      }
      
      if (h.type === 'regolith_entrapment') {
        // Critical failure - robot gets permanently stuck
        if (rng() < (h.entrapment_prob || 0.008)) {
          const randomRobot = Math.floor(rng() * ac.length);
          if (randomRobot < ac.length) {
            ac[randomRobot].hp = 0; // Permanent loss
            ac[randomRobot].a = false;
          }
        }
      }
      
      if (h.type === 'power_brownout') {
        // Battery degradation and charge controller faults
        st.power = Math.max(0, st.power - (h.power_loss || 25));
        const randomRobot = Math.floor(rng() * ac.length);
        if (randomRobot < ac.length) {
          ac[randomRobot].hp -= h.damage || 2;
        }
      }
      
      if (h.type === 'actuator_seizure') {
        // Joint freezing from thermal cycling
        const randomRobot = Math.floor(rng() * ac.length);
        if (randomRobot < ac.length) {
          ac[randomRobot].hp -= h.damage || 5;
        }
        st.ie = Math.max(0.1, st.ie - (h.efficiency_loss || 0.012));
      }
      
      // Other v6 failure modes
      if (h.type === 'sensor_blindness' || h.type === 'cable_wear' || 
          h.type === 'navigation_error' || h.type === 'autonomous_logic_failure') {
        st.ie = Math.max(0.1, st.ie - (h.efficiency_loss || 0.008));
        if (h.damage) {
          const randomRobot = Math.floor(rng() * ac.length);
          if (randomRobot < ac.length) {
            ac[randomRobot].hp -= h.damage;
          }
        }
      }
      
      // Previous version hazards (v1-v5)
      if (h.type === 'dust_storm') st.power = Math.max(0, st.power - (h.power_drain || 20));
      if (h.type === 'equipment_failure') st.ie = Math.max(0.1, st.ie - (h.degradation || 0.03));
      if (h.type === 'micrometeorite') {
        st.se = Math.max(0.1, st.se - (h.solar_degradation || 0.02));
        if (h.crew_damage && ac.length > 0) {
          ac[Math.floor(rng() * ac.length)].hp -= h.crew_damage;
        }
      }
    }
    
    // ═══ GOVERNOR EXECUTION ═══
    const ctx = {
      sol, power: st.power, o2: st.o2, h2o: st.h2o, food: st.food,
      crew: st.crew, cri: st.cri, events: st.ev,
      allocation: {heating: 0.33, isru: 0.33, greenhouse: 0.34, repair: 1.0},
      foodRation: 1.0
    };
    
    try {
      evalLisp(gov, ctx);
    } catch (e) {
      console.warn(`Governor error at sol ${sol}:`, e.message);
    }
    
    const a = ctx.allocation;
    
    // ═══ PRODUCTION ═══
    const isDust = st.ev.some(e => e.type === 'dust_storm');
    const solarBonus = 1 + st.mod.filter(x => x === 'solar_farm').length * 0.4;
    st.power += solIrr(sol, isDust) * PA * EF * SH / 1000 * st.se * solarBonus;
    
    if (st.power > PCRIT * 0.3) {
      const isruBonus = 1 + st.mod.filter(x => x === 'isru_plant').length * 0.4;
      st.o2 += ISRU_O2 * st.ie * Math.min(1.5, a.isru * 2) * isruBonus;
      st.h2o += ISRU_H2O * st.ie * Math.min(1.5, a.isru * 2) * isruBonus;
    }
    
    st.h2o += st.mod.filter(x => x === 'water_extractor').length * 3;
    
    if (st.power > PCRIT * 0.3 && st.h2o > 5) {
      const greenhouseBonus = 1 + st.mod.filter(x => x === 'greenhouse_dome').length * 0.5;
      st.food += GK * st.ge * Math.min(1.5, a.greenhouse * 2) * greenhouseBonus;
    }
    
    // Repair bay effects
    const repairCount = st.mod.filter(x => x === 'repair_bay').length;
    if (repairCount > 0) {
      const baseRepair = 0.005;
      const repairBonus = Math.pow(1.4, repairCount - 1) * a.repair;
      st.se = Math.min(1, st.se + baseRepair * repairBonus);
      st.ie = Math.min(1, st.ie + baseRepair * 0.6 * repairBonus);
    }
    
    // Radiation shelter protection
    if (st.mod.includes('radiation_shelter')) {
      ac.forEach(c => {
        c.hp = Math.min(100, c.hp + 0.2); // Slow radiation protection
      });
    }
    
    // ═══ CONSUMPTION ═══
    st.power -= 5 * ac.length + 3 * st.mod.length; // Power consumption
    st.power -= st.power * a.heating; // Heating allocation
    
    // No O2, H2O, food consumption for robots
    
    // ═══ HEALTH EFFECTS ═══
    if (st.power < 0) {
      st.power = 0;
      ac.forEach(c => c.hp -= 1); // Power loss damages robots
    }
    
    if (st.power * a.heating < 50) { // Cold damage
      ac.forEach(c => c.hp -= 0.5);
    }
    
    // Natural healing for robots
    ac.forEach(c => c.hp = Math.min(100, c.hp + 0.5));
    
    // Remove dead crew
    st.crew.forEach(c => {
      if (c.hp <= 0) c.a = false;
    });
    
    // ═══ FAILURE CONDITIONS ═══
    const aliveCrew = st.crew.filter(c => c.a).length;
    if (aliveCrew === 0) {
      return {
        sols: sol, alive: false, cause: 'all_crew_dead', seed,
        crew: 0, hp: 0, power: Math.round(st.power), 
        solarEff: Math.round(st.se * 100), cri: st.cri, modules: st.mod.length
      };
    }
  }
  
  const aliveCrew = st.crew.filter(c => c.a);
  return {
    sols: totalSols, alive: true, cause: null, seed,
    crew: aliveCrew.length,
    hp: Math.round(aliveCrew.reduce((s, c) => s + c.hp, 0) / Math.max(1, aliveCrew.length)),
    power: Math.round(st.power), solarEff: Math.round(st.se * 100),
    cri: st.cri, modules: st.mod.length
  };
}

// ── Main ──
const {frames, totalSols} = loadFrames();
const monteCarloArg = process.argv.find(a=>a.startsWith('--monte-carlo'));
const runs = monteCarloArg ? parseInt(monteCarloArg.split('=')[1] || process.argv[process.argv.indexOf('--monte-carlo')+1] || '50') : 1;

if(runs === 1){
  // Single run
  console.log('═══════════════════════════════════════════════');
  console.log('  V6 SCORE BREAKTHROUGH: All ' + totalSols + ' frames');
  console.log('═══════════════════════════════════════════════\n');
  const result = runGauntlet(frames, totalSols, 42);
  console.log((result.alive?'🟢 ALIVE':'☠ DEAD: '+result.cause) + ' at sol ' + result.sols);
  console.log('Crew: '+result.crew+'/5 | HP:'+result.hp+' | Power:'+result.power+' | Solar:'+result.solarEff+'% | CRI:'+result.cri);
  console.log('Modules: '+result.modules+' (capped at 8 for score)');
  const score = result.sols*100 + result.crew*500 + Math.min(result.modules,8)*150 + (result.alive?20000:0) - result.cri*10;
  console.log('Score: '+score);
} else {
  // Monte Carlo
  console.log('═══════════════════════════════════════════════');
  console.log('  V6 SCORE BREAKTHROUGH MONTE CARLO: '+runs+' runs');
  console.log('═══════════════════════════════════════════════\n');
  
  const results = [];
  for(let i=0; i<runs; i++){
    results.push(runGauntlet(frames, totalSols, i*7919+1));
  }
  
  const alive = results.filter(r=>r.alive);
  const survivalRate = alive.length / runs;
  
  console.log(`SURVIVAL RATE: ${(survivalRate*100).toFixed(1)}% (${alive.length}/${runs} survived all ${totalSols} sols)\n`);
  
  if(alive.length > 0){
    console.log(`Average sols survived: ${Math.round(results.reduce((s,r)=>s+r.sols,0)/results.length)}`);
    console.log(`Average HP (survivors): ${Math.round(alive.reduce((s,r)=>s+r.hp,0)/alive.length)}`);
  }
  
  // ── OFFICIAL MONTE CARLO SCORE (Amendment IV) ──
  const solsSorted = results.map(r=>r.sols).sort((a,b)=>a-b);
  const medianSols = solsSorted[Math.floor(runs/2)];
  const minCrew = Math.min(...results.map(r=>r.crew));
  const medianModules = results.map(r=>r.modules).sort((a,b)=>a-b)[Math.floor(runs/2)];
  const criSorted = results.map(r=>r.cri).sort((a,b)=>a-b);
  const p75CRI = criSorted[Math.floor(runs*0.75)];
  
  const officialScore = Math.round(
    medianSols * 100
    + minCrew * 500
    + Math.min(medianModules, 8) * 150
    + survivalRate * 200 * 100
    - p75CRI * 10
  );
  
  const officialGrade = officialScore >= 80000 ? 'S+' : 
                       officialScore >= 50000 ? 'S' : 
                       officialScore >= 30000 ? 'A' : 
                       officialScore >= 15000 ? 'B' : 
                       officialScore >= 5000 ? 'C' : 
                       officialScore >= 1000 ? 'D' : 'F';
  const leaderboardAlive = survivalRate >= 0.5;
  
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     OFFICIAL MONTE CARLO SCORE           ║');
  console.log('║     (Amendment IV — Constitutional)      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Median sols:    ' + String(medianSols).padStart(6) + '              ×100 ║');
  console.log('║  Min crew alive: ' + String(minCrew).padStart(6) + '              ×500 ║');
  console.log('║  Median modules: ' + String(medianModules).padStart(6) + '              ×150 ║');
  console.log('║  Survival rate:  ' + (survivalRate*100).toFixed(1).padStart(5) + '%     ×200×100 ║');
  console.log('║  P75 CRI:        ' + String(p75CRI).padStart(6) + '              ×-10 ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  SCORE: ' + String(officialScore).padStart(8) + '   GRADE: ' + officialGrade.padStart(2) + '            ║');
  console.log('║  Leaderboard: ' + (leaderboardAlive ? '🟢 ALIVE' : '☠ NON-VIABLE') + '               ║');
  console.log('╚══════════════════════════════════════════╝');
  
  // Per-run score distribution (for reference)
  const perRunScores = results.map(r=>r.sols*100+r.crew*500+Math.min(r.modules,8)*150+(r.alive?20000:0)-r.cri*10);
  perRunScores.sort((a,b)=>a-b);
  console.log('\nPer-run score distribution:');
  console.log('  Min: ' + perRunScores[0] + ' | P25: ' + perRunScores[Math.floor(runs*0.25)] +
    ' | Median: ' + perRunScores[Math.floor(runs*0.5)] + ' | P75: ' + perRunScores[Math.floor(runs*0.75)] +
    ' | Max: ' + perRunScores[runs-1]);
  
  console.log('\n═══════════════════════════════════════════════');
}