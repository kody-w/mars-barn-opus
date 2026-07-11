#!/usr/bin/env node
/**
 * Headless Sim Runner — Plays through ALL public frames by the rules.
 * 
 * Reads every frame from data/frames/, applies Mars conditions,
 * injects events/hazards, runs the full sim tick with optimal
 * governor, and exports a legitimate cartridge.
 * 
 * Usage:
 *   node tools/run_sim.js                    # run through all frames
 *   node tools/run_sim.js --mission hybrid   # specific mission
 *   node tools/run_sim.js --export           # save cartridge
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRAMES_DIR = path.join(__dirname, '..', 'data', 'frames');

// ── Constants (from src/config.py — NASA sourced) ──
const O2_PP = 0.84;    // kg/person/sol
const H2O_PP = 2.5;    // L/person/sol
const FOOD_PP = 2500;   // kcal/person/sol
const PWR_BASE = 30;     // kWh/sol habitat baseline
const PCRIT = 50;       // kWh critical power
const PANEL = 200;      // m² panel area
const EFF = 0.22;       // panel efficiency
const SOL_H = 24.66;    // Mars sol hours
const ISRU_O2 = 5;      // kg O₂/sol at full
const ISRU_H2O = 12;    // L H₂O/sol at full
const GH_KCAL = 15000;  // kcal/sol greenhouse
const ISRU_PWR = 60;    // kWh/sol process load
const GH_PWR = 30;      // kWh/sol greenhouse load
const GH_H2O = 5;       // L/sol greenhouse makeup water

function frameMars(frame){
  const raw = frame?.mars || frame?.environment || {};
  const tempK = raw.temp_k ?? raw.temperature_k;
  const tempC = raw.temp_c ?? raw.temperature_c;
  return {
    temp_k: tempK ?? (tempC == null ? 218 : tempC + 273.15),
    dust_tau: raw.dust_tau ?? (raw.dust_storm ? 0.8 : 0.15),
    solar_wm2: raw.solar_wm2 ?? raw.solar_irradiance ?? 490,
    wind_ms: raw.wind_ms ?? raw.wind_speed_ms ?? 4,
  };
}

function applyPoweredProduction(state,solarWm2,allocation,dustStorm=false){
  const solarBonus=1+state.modules.filter(module=>module.type==='solar_farm').length*0.4;
  state.power+=solarWm2*(dustStorm?0.3:1)*PANEL*EFF*SOL_H/1000*
    state.s_eff*solarBonus;
  let discretionary=Math.max(0,state.power-PWR_BASE);

  const requestedIsruScale=Math.min(1.5,allocation.i*2);
  const requestedIsruPower=ISRU_PWR*requestedIsruScale;
  const usedIsruPower=Math.min(discretionary,requestedIsruPower);
  const isruScale=requestedIsruPower>0
    ?requestedIsruScale*usedIsruPower/requestedIsruPower:0;
  discretionary-=usedIsruPower;
  state.power-=usedIsruPower;
  const isruBonus=1+state.modules.filter(module=>module.type==='isru_plant').length*0.4;
  state.o2+=ISRU_O2*state.i_eff*isruScale*isruBonus;
  state.h2o+=ISRU_H2O*state.i_eff*isruScale*isruBonus;
  state.h2o+=state.modules.filter(module=>module.type==='water_extractor').length*3;

  const requestedGhScale=Math.min(1.5,allocation.g*2);
  const requestedGhPower=GH_PWR*requestedGhScale;
  const requestedGhWater=GH_H2O*requestedGhScale;
  const powerScale=requestedGhPower>0?Math.min(1,discretionary/requestedGhPower):0;
  const waterScale=requestedGhWater>0?Math.min(1,state.h2o/requestedGhWater):0;
  const limit=Math.min(powerScale,waterScale);
  const ghScale=requestedGhScale*limit;
  state.power-=requestedGhPower*limit;
  state.h2o-=requestedGhWater*limit;
  const ghBonus=1+state.modules.filter(module=>module.type==='greenhouse_dome').length*0.5;
  state.food+=GH_KCAL*state.g_eff*ghScale*ghBonus;
}

function resourceDelta(before,after){
  return {
    o2:after.o2-before.o2,
    h2o:after.h2o-before.h2o,
    food:after.food-before.food,
    power:after.power-before.power,
  };
}

// ── LisPy VM (identical to viewer.html) ──
class LispyVM {
  constructor(){this.env={};this.output=[];this.steps=0;this.maxSteps=50000}
  setEnv(k,v){this.env[k]=v}
  tokenize(src){
    const tokens=[];let i=0;
    while(i<src.length){
      const c=src[i];
      if(c===' '||c==='\t'||c==='\n'||c==='\r'){i++;continue}
      if(c===';'){while(i<src.length&&src[i]!=='\n')i++;continue}
      if(c==='('||c===')'){tokens.push(c);i++;continue}
      if(c==='"'){let s='"';i++;while(i<src.length&&src[i]!=='"'){if(src[i]==='\\')s+=src[i++];s+=src[i++]}if(i<src.length)i++;tokens.push(s+'"');continue}
      let tok='';while(i<src.length&&!' \t\n\r()'.includes(src[i])){tok+=src[i++]}
      tokens.push(tok);
    }
    return tokens;
  }
  parse(tokens,pos={i:0}){
    if(pos.i>=tokens.length)throw new Error('EOF');
    const t=tokens[pos.i++];
    if(t==='('){const l=[];while(pos.i<tokens.length&&tokens[pos.i]!==')')l.push(this.parse(tokens,pos));if(pos.i<tokens.length)pos.i++;return l}
    if(t[0]==='"')return{__str:true,v:t.slice(1,-1)};
    const n=Number(t);return isNaN(n)?t:n;
  }
  eval(expr){
    if(++this.steps>this.maxSteps)throw new Error('Step limit');
    if(typeof expr==='number')return expr;
    if(expr&&expr.__str)return expr.v;
    if(typeof expr==='string'){if(expr==='true')return true;if(expr==='false')return false;if(expr in this.env)return this.env[expr];throw new Error('Undefined: '+expr)}
    if(!Array.isArray(expr)||!expr.length)return expr;
    const[op,...args]=expr;
    if(op==='begin'){let r;for(const a of args)r=this.eval(a);return r}
    if(op==='define'){this.env[args[0]]=this.eval(args[1]);return this.env[args[0]]}
    if(op==='set!'){this.env[args[0]]=this.eval(args[1]);return this.env[args[0]]}
    if(op==='if')return this.eval(args[0])?this.eval(args[1]):(args.length>2?this.eval(args[2]):false);
    if(op==='cond'){for(const c of args){const[t,...b]=c;if(this.eval(t)){let r;for(const x of b)r=this.eval(x);return r}}return false}
    if(op==='log'||op==='print'){const v=args.map(a=>this.eval(a)).join(' ');this.output.push(v);return v}
    if(op==='concat')return args.map(a=>String(this.eval(a))).join('');
    if(op==='string')return String(this.eval(args[0]));
    const vals=args.map(a=>this.eval(a));
    const ops={'+':()=>vals.reduce((a,b)=>a+b,0),'-':()=>vals.length===1?-vals[0]:vals[0]-vals[1],
      '*':()=>vals.reduce((a,b)=>a*b,1),'/':()=>vals[0]/vals[1],
      '<':()=>vals[0]<vals[1],'>':()=>vals[0]>vals[1],'<=':()=>vals[0]<=vals[1],'>=':()=>vals[0]>=vals[1],
      '=':()=>vals[0]===vals[1],'!=':()=>vals[0]!==vals[1],
      'min':()=>Math.min(...vals),'max':()=>Math.max(...vals),
      'abs':()=>Math.abs(vals[0]),'round':()=>Math.round(vals[0]),
      'and':()=>vals.every(Boolean),'or':()=>vals.some(Boolean),'not':()=>!vals[0]};
    if(op in ops)return ops[op]();
    throw new Error('Unknown: '+op);
  }
  run(src){this.steps=0;this.output=[];try{const t=this.tokenize(src);const a=this.parse(t);return{ok:true,result:this.eval(a),env:this.env,output:this.output}}catch(e){return{ok:false,error:e.message,env:this.env,output:this.output}}}
}

// ── Deterministic RNG ──
function rng32(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/0x100000000}}
let R = rng32(42);

function isRobotCrew(member){
  return member.bot===true||member.name.startsWith('OPT')||member.name.startsWith('LUN');
}

// ── Load all frames ──
function loadFrames(){
  const manifest = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR, 'manifest.json'), 'utf8'));
  const frames = {};
  for(const entry of manifest.frames){
    const fp = path.join(FRAMES_DIR, `sol-${String(entry.sol).padStart(4,'0')}.json`);
    if(fs.existsSync(fp)) frames[entry.sol] = JSON.parse(fs.readFileSync(fp, 'utf8'));
  }
  return { manifest, frames };
}

// ── CRI computation (same LisPy program as viewer.html) ──
const CRI_PROGRAM = `(begin
  (define base_risk 10)
  (define o2_risk (if (< o2_days 5) 30 (if (< o2_days 10) 15 (if (< o2_days 20) 5 0))))
  (define food_risk (if (< food_days 5) 25 (if (< food_days 10) 12 (if (< food_days 20) 4 0))))
  (define h2o_risk (if (< h2o_days 5) 28 (if (< h2o_days 10) 14 (if (< h2o_days 20) 4 0))))
  (define power_risk (if (< power_kwh 50) 25 (if (< power_kwh 150) 12 0)))
  (define crew_risk (* (- crew_total crew_alive) 8))
  (define morale_risk (if (< morale 30) 20 (if (< morale 50) 10 (if (< morale 70) 3 0))))
  (define dust_risk (if (> dust_tau 0.6) 15 (if (> dust_tau 0.3) 5 0)))
  (define solar_risk (if (< solar_eff 0.7) 12 (if (< solar_eff 0.85) 5 0)))
  (define event_risk (* events_active 6))
  (define total (+ base_risk o2_risk food_risk h2o_risk power_risk crew_risk morale_risk dust_risk solar_risk event_risk))
  (set! colony_risk_index (min 100 total)))`;

function computeCRI(state, dustTau){
  const vm = new LispyVM();
  const alive=state.crew.filter(c=>c.alive);
  const humans=alive.filter(c=>!isRobotCrew(c)).length;
  const lifeDays=(resource,rate)=>humans===0?Infinity:resource/(rate*humans);
  vm.setEnv('o2_days', lifeDays(state.o2,O2_PP));
  vm.setEnv('h2o_days', lifeDays(state.h2o,H2O_PP));
  vm.setEnv('food_days', lifeDays(state.food,FOOD_PP));
  vm.setEnv('power_kwh', state.power);
  vm.setEnv('crew_alive', alive.length);
  vm.setEnv('crew_total', state.crew.length);
  vm.setEnv('morale', state.morale*100);
  vm.setEnv('solar_eff', state.s_eff);
  vm.setEnv('dust_tau', dustTau);
  vm.setEnv('events_active', state.events.length);
  vm.setEnv('colony_risk_index', 10);
  const r = vm.run(CRI_PROGRAM);
  return r.ok ? Math.round(r.env.colony_risk_index || 10) : 10;
}

// ── Risk-weighted random ──
let colonyRiskIndex = 10;
function riskRoll(baseProb){
  return R() < (baseProb * (1 + colonyRiskIndex/50));
}

// ── Module types ──
const MODULE_ORDER = ['greenhouse_dome','isru_plant','solar_farm','water_extractor','repair_bay','radiation_shelter'];

// ── The Mission ──
const MISSIONS = {
  garden: { name:'Garden of Mars', crew:6, o2:300, h2o:900, food:900000, power:1000,
    crewList:[
      {name:'Chen W.',role:'CMDR',hp:97,fat:0,mor:82,rad:0,alive:true,st:'Nominal'},
      {name:'Rodriguez M.',role:'ENGR',hp:96,fat:0,mor:85,rad:0,alive:true,st:'Nominal'},
      {name:'Okafor A.',role:'SCI',hp:98,fat:0,mor:78,rad:0,alive:true,st:'Nominal'},
      {name:'Johansson K.',role:'MED',hp:95,fat:0,mor:88,rad:0,alive:true,st:'Nominal'},
      {name:'Kim J.',role:'SCI',hp:96,fat:0,mor:80,rad:0,alive:true,st:'Nominal'},
      {name:'Volkov D.',role:'ENGR',hp:97,fat:0,mor:82,rad:0,alive:true,st:'Nominal'}]},
  hybrid: { name:'Hybrid Colony', crew:6, o2:50, h2o:200, food:150000, power:800,
    crewList:[
      {name:'Chen W.',role:'CMDR',hp:97,fat:0,mor:82,rad:0,alive:true,st:'Nominal'},
      {name:'Rodriguez M.',role:'ENGR',hp:96,fat:0,mor:85,rad:0,alive:true,st:'Nominal'},
      {name:'OPT-01',role:'ENGR',hp:100,fat:0,mor:100,rad:0,alive:true,st:'Nominal'},
      {name:'OPT-02',role:'ENGR',hp:100,fat:0,mor:100,rad:0,alive:true,st:'Nominal'},
      {name:'OPT-03',role:'SCI',hp:100,fat:0,mor:100,rad:0,alive:true,st:'Nominal'},
      {name:'OPT-04',role:'CMDR',hp:100,fat:0,mor:100,rad:0,alive:true,st:'Nominal'}]},
};

// ── Main Sim Loop ──
function runSim(missionKey){
  const mission = MISSIONS[missionKey] || MISSIONS.garden;
  const {manifest, frames} = loadFrames();
  const totalFrames = manifest.last_sol;
  
  // Init state from mission
  const state = {
    sol:0, alive:true, cause:null, arch:'engineer',
    o2:mission.o2, h2o:mission.h2o, food:mission.food, power:mission.power,
    s_eff:1, i_eff:1, g_eff:1, h_eff:1,
    int_temp:293, morale:0.85, rad:0,
    crew:mission.crewList.map(c=>({...c})),
    events:[], log:[], modules:[], building:null, research:[], researching:null,
    discoveries:[], economy:0, alloc:{h:0.20,i:0.45,g:0.35,r:1},
    marsLedger:{}, startConfig:{o2:mission.o2,h2o:mission.h2o,food:mission.food,power:mission.power}
  };

  const echoHistory = [];
  const taskHistory = [];
  let tasksResolved = 0;
  let moduleIdx = 0;
  let marsCirculating = 0;
  const chainBlocks = [];
  let chainHead = null;

  console.log(`Mission: ${mission.name} (${state.crew.length} crew)`);
  console.log(`Frames available: ${totalFrames}`);
  console.log('');

  for(let sol = 1; sol <= totalFrames && state.alive; sol++){
    state.sol = sol;
    const frame = frames[sol];
    const ac = state.crew.filter(c=>c.alive);
    const n = ac.length;
    if(!n){state.alive=false;state.cause='all crew lost';break}
    const pre={o2:state.o2,h2o:state.h2o,food:state.food,power:state.power};
    
    // Humans only consume food/water/o2 — robots just use power
    const humans = ac.filter(c=>!isRobotCrew(c));
    const nh = humans.length;

    // ── APPLY FRAME DATA (the rules) ──
    let dustTau = 0.15, solarWm2 = 490, windMs = 4, tempK = 218;
    if(frame){
      const m = frameMars(frame);
      dustTau = m.dust_tau; solarWm2 = m.solar_wm2; windMs = m.wind_ms; tempK = m.temp_k;
      
      // Inject frame events
      if(frame.events){
        for(const ev of frame.events){
          if(!state.events.some(e=>e.type===ev.type)){
            state.events.push({
              type:ev.type, severity:ev.severity||0.5,
              remaining:ev.duration_sols||3, duration:ev.duration_sols||3, desc:ev.desc||ev.type
            });
          }
        }
      }
      // Apply frame hazards
      if(frame.hazards){
        for(const hz of frame.hazards){
          if(hz.type==='equipment_fatigue'&&hz.target==='solar_array') state.s_eff=Math.max(0.1,state.s_eff-(hz.degradation||0.005));
          if(hz.type==='dust_accumulation') state.s_eff=Math.max(0.1,state.s_eff-(hz.degradation||0.01));
        }
      }
    }

    // Expired events were already applied for their declared duration.
    state.events=state.events.filter(e=>e.remaining>0);

    // Random events from probabilities (CRI-weighted)
    colonyRiskIndex = computeCRI(state, dustTau);
    const probs={dust_storm:0.08,dust_devil:0.12,solar_flare:0.03,meteorite:0.003,equipment_failure:0.02,radiation_spike:0.03};
    for(const[t,p]of Object.entries(probs)){
      if(state.events.some(e=>e.type===t))continue;
      if(riskRoll(p)){
        const sv=0.2+R()*0.8;
        const dur=t==='dust_storm'?Math.floor(5+R()*25):Math.floor(1+R()*5);
        state.events.push({type:t,severity:sv,remaining:dur,duration:dur,desc:t});
        if(t==='meteorite'){state.s_eff*=(1-0.15*sv);state.g_eff*=(1-0.2*sv)}
        if(t==='equipment_failure'){state.i_eff*=(1-0.15*sv);state.power-=20*sv}
        if(t==='solar_flare') state.rad+=50*sv;
      }
    }

    // ── OPTIMAL GOVERNOR (LisPy-equivalent logic) ──
    const o2d = state.o2/(O2_PP*Math.max(1,nh));
    const h2od = state.h2o/(H2O_PP*Math.max(1,nh));
    const fd = state.food/(FOOD_PP*Math.max(1,nh));
    const a = state.alloc;

    // Emergency triage
    if(o2d < 3)       {a.h=0.05;a.i=0.90;a.g=0.05;a.r=0.5}
    else if(o2d < 8)  {a.h=0.10;a.i=0.75;a.g=0.15;a.r=0.8}
    else if(h2od < 5) {a.h=0.10;a.i=0.65;a.g=0.25;a.r=0.8}
    else if(fd < 8)   {a.h=0.15;a.i=0.25;a.g=0.60;a.r=0.9}
    else if(state.power < 80) {a.h=0.55;a.i=0.25;a.g=0.20;a.r=1}
    // Balanced growth
    else if(state.modules.length < 3) {a.h=0.20;a.i=0.45;a.g=0.35;a.r=1}
    else {a.h=0.20;a.i=0.35;a.g=0.45;a.r=1}

    // ── PRODUCTION ──
    const isDustStorm = state.events.some(e=>e.type==='dust_storm');
    applyPoweredProduction(state,solarWm2,a,isDustStorm);

    // Repair bay slowly restores efficiency
    if(state.modules.some(m=>m.type==='repair_bay')){
      state.s_eff = Math.min(1, state.s_eff + 0.002);
      state.i_eff = Math.min(1, state.i_eff + 0.002);
      state.g_eff = Math.min(1, state.g_eff + 0.002);
    }

    // ── CONSUMPTION ──
    state.o2  = Math.max(0, state.o2  - nh * O2_PP);
    state.h2o = Math.max(0, state.h2o - nh * H2O_PP);
    state.food= Math.max(0, state.food- nh * FOOD_PP * a.r);
    const robotCount=ac.filter(isRobotCrew).length;
    state.power=Math.max(0,state.power-PWR_BASE-robotCount*(PWR_BASE/4)-
      state.modules.length*3);

    // Heating
    const heatPwr = state.power * a.h * 0.5;
    state.int_temp = Math.max(200, Math.min(310, state.int_temp + (heatPwr > 10 ? 0.5 : -1)));

    // ── CREW HEALTH ──
    ac.forEach(c=>{
      const isBot = isRobotCrew(c);
      if(!isBot){
        if(state.o2 < O2_PP * 2) c.hp -= 5;
        if(state.food < FOOD_PP * 2) c.hp -= 3;
      }
      if(state.int_temp < 260) c.hp -= (isBot ? 0.5 : 2);
      if(state.int_temp > 305) c.hp -= 1;
      if(state.rad > 500) c.hp -= 2;
      c.hp = Math.min(100, c.hp + (isBot ? 0.5 : 0.3));
      c.mor = Math.max(0, Math.min(100, c.mor + (state.events.length ? -0.5 : 0.2)));
      if(c.hp <= 0){c.alive = false; c.st = 'DECEASED'}
    });

    state.morale = ac.filter(c=>c.alive).reduce((s,c)=>s+c.mor,0)/Math.max(1,ac.filter(c=>c.alive).length)/100;

    // ── TERMINAL CHECK — no progression or rewards after a lethal phase ──
    const survivingCrew = ac.filter(c=>c.alive);
    const survivingHumans = survivingCrew.filter(c=>!isRobotCrew(c)).length;
    if(!survivingCrew.length){state.alive=false;state.cause='all crew lost'}
    else if(state.o2 <= 0 && survivingHumans > 0){state.alive=false;state.cause='O2 depletion'}
    else if(state.food <= 0 && survivingHumans > 0){state.alive=false;state.cause='starvation'}
    else if(state.h2o <= 0 && survivingHumans > 0){state.alive=false;state.cause='dehydration'}

    if(state.alive){
    // ── AUTO-BUILD (every 40 sols if we have power) ──
    if(sol % 40 === 0 && moduleIdx < MODULE_ORDER.length && state.power > 150){
      state.modules.push({type: MODULE_ORDER[moduleIdx], built: sol});
      state.log.push(`Sol ${sol}: Built ${MODULE_ORDER[moduleIdx]}`);
      moduleIdx++;
    }

    // ── AUTO-RESOLVE TASKS (always approve urgent, alt for requests) ──
    if(frame && frame.challenge){
      tasksResolved++;
      taskHistory.push({id:frame.challenge.id, sol, choice:'approve', timedOut:false});
    }

    // ── TOKEN REWARDS ──
    const reward = Math.max(1, Math.round(10 * (1 - colonyRiskIndex/200)));
    ac.filter(c=>c.alive).forEach(c=>{
      if(!state.marsLedger[c.name]) state.marsLedger[c.name]={balance:0,earned:0,role:c.role};
      state.marsLedger[c.name].balance += reward;
      state.marsLedger[c.name].earned += reward;
      marsCirculating += reward;
    });
    state.economy = Object.values(state.marsLedger).reduce((s,l)=>s+l.balance, 0);
    }

    // ── ECHO FRAME ──
    const echo = {
      frame: sol, utc: new Date().toISOString(),
      delta:resourceDelta(pre,state),
      events: state.events.map(e=>({type:e.type,severity:e.severity})),
      alive: state.alive, cri: colonyRiskIndex, reflex_count: 0
    };
    echoHistory.push(echo);

    // ── CHAIN BLOCK ──
    const blockData = JSON.stringify({sol, cri:colonyRiskIndex, alive:state.alive, prevHash:chainHead});
    const blockHash = crypto.createHash('sha256').update(blockData).digest('hex').slice(0,16);
    chainBlocks.push({sol, hash:blockHash, prevHash:chainHead, frameHash:frame?._hash||null, circulating:marsCirculating});
    chainHead = blockHash;
    state.events.forEach(event=>{event.remaining--});
    state.events=state.events.filter(event=>event.remaining>0);

    // Progress
    if(sol % 25 === 0 || !state.alive){
      const aliveNow = state.crew.filter(c=>c.alive).length;
      const o2dNow = nh > 0 ? (state.o2/(O2_PP*nh)).toFixed(1) : '∞';
      const fdNow = nh > 0 ? (state.food/(FOOD_PP*nh)).toFixed(1) : '∞';
      const status = state.alive ? '✓' : '☠';
      console.log(`${status} Sol ${String(sol).padStart(3)}: ${aliveNow} crew | O₂ ${o2dNow}d | Food ${fdNow}d | Pwr ${Math.round(state.power)} | CRI ${colonyRiskIndex} | Mods ${state.modules.length} | MARS ${state.economy}`);
    }
  }

  // ── FINAL RESULTS ──
  const ac = state.crew.filter(c=>c.alive);
  const n = Math.max(1, ac.length);
  const nh = ac.filter(c=>!isRobotCrew(c)).length;

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Sols: ${state.sol} | ${state.alive?'ALIVE':'DEAD: '+state.cause}`);
  console.log(`Crew: ${ac.length}/${state.crew.length}`);
  ac.forEach(c=>console.log(`  ${c.name.startsWith('OPT')?'🤖':'👤'} ${c.name} HP:${Math.round(c.hp)} Mor:${Math.round(c.mor)}`));
  console.log(`O₂: ${Math.round(state.o2)}kg (${nh>0?Math.round(state.o2/(O2_PP*nh)):'∞'}d)`);
  console.log(`H₂O: ${Math.round(state.h2o)}L | Food: ${Math.round(state.food)}kcal | Power: ${Math.round(state.power)}kWh`);
  console.log(`Modules: ${state.modules.map(m=>m.type).join(', ')}`);
  console.log(`MARS: ${state.economy.toLocaleString()} | Chain: ${chainBlocks.length} blocks`);

  // Score
  const survival = state.sol * 100;
  const crewBonus = ac.length * 500;
  const startTotal = (mission.o2 + mission.h2o + mission.food/1000 + mission.power);
  const resourceBonus = Math.min(1000, Math.round(((state.o2+state.h2o+state.food/1000+state.power)/Math.max(1,startTotal))*1000));
  const criPenalty = Math.round(colonyRiskIndex * -10);
  const decisionBonus = tasksResolved * 50;
  const moduleBonus = state.modules.length * 150;
  const researchBonus = state.research.length * 300;
  const total = survival + crewBonus + resourceBonus + criPenalty + decisionBonus + moduleBonus + researchBonus;
  const grade = total>=50000?'S+':total>=30000?'S':total>=20000?'A':total>=10000?'B':total>=5000?'C':total>=1000?'D':'F';

  console.log(`\nScore: ${total.toLocaleString()} (${grade})`);
  console.log(`  Survival: ${survival} | Crew: ${crewBonus} | Resources: ${resourceBonus}`);
  console.log(`  CRI penalty: ${criPenalty} | Decisions: ${decisionBonus} | Modules: ${moduleBonus}`);

  // ── EXPORT CARTRIDGE ──
  if(process.argv.includes('--export')){
    const cartridgeId = 'MBC-' + Date.now().toString(36).toUpperCase() + '-BEST';
    const cartridge = {
      _format: 'mars-barn-cartridge', version: 1, id: cartridgeId,
      created: new Date().toISOString(), mission: missionKey,
      config: {arch:'engineer', lispy:'optimal_headless', simSpeed:1,
        o2:mission.o2, h2o:mission.h2o, food:mission.food, power:mission.power},
      state: JSON.parse(JSON.stringify(state)),
      echoHistory: echoHistory.slice(-100),
      taskHistory, tasksResolved, tasksIgnored: 0,
      reflexHistory: [], activeReflexes: [],
      cri: colonyRiskIndex, criGrade: colonyRiskIndex>70?'CRITICAL':colonyRiskIndex>50?'HIGH':colonyRiskIndex>30?'ELEVATED':colonyRiskIndex>15?'MODERATE':'LOW',
      supplyChain: {nextLaunchWindow:100, inTransit:[], delivered:0},
      marsCirculating, marsSupplyPct: (marsCirculating/21000000*100).toFixed(6),
      chainHead, chainBlocks: chainBlocks.slice(-100),
      marsLedger: state.marsLedger,
      score: {total, grade, breakdown:[
        ['Survival (sols × 100)', survival], ['Crew alive bonus', crewBonus],
        ['Resource efficiency', resourceBonus], ['CRI penalty', criPenalty],
        ['Decisions made', decisionBonus], ['Modules built', moduleBonus]]},
      alive: state.alive, sol: state.sol,
      runtime: {generator:'headless-runner-v1', savedAt:new Date().toISOString()}
    };
    const outPath = path.join(__dirname, '..', `${missionKey}-sol${state.sol}.cartridge.json`);
    fs.writeFileSync(outPath, JSON.stringify(cartridge, null, 2));
    console.log(`\n💾 Cartridge exported: ${outPath}`);
  }
}

// ── CLI ──
if(require.main===module){
  const missionArg = process.argv.find(a=>a.startsWith('--mission='));
  const missionKey = missionArg ? missionArg.split('=')[1] : 'garden';
  runSim(missionKey);
}

module.exports={
  MISSIONS,applyPoweredProduction,computeCRI,isRobotCrew,resourceDelta,rng32,runSim,
};
