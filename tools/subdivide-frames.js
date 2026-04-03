#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// TEMPORAL SUBDIVISION — Datasloshing within sols
// 
// Takes existing sol keyframes and generates sub-frames between them.
// Each sub-frame is DERIVED from the previous sub-frame and MUST
// converge to the next keyframe. Append-only — never modifies
// existing sol data.
//
// Usage: node tools/subdivide-frames.js [--depth 2]
//   depth 1 = half-days (2 sub-frames per sol)
//   depth 2 = quarter-days (4 sub-frames per sol)
//   depth 3 = eighth-days (8 sub-frames per sol)
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const depth = parseInt(process.argv.find(a => a.startsWith('--depth'))?.split('=')[1] 
  || process.argv[process.argv.indexOf('--depth') + 1] 
  || '2');

const divisions = Math.pow(2, depth);
console.log(`Temporal subdivision: depth=${depth}, ${divisions} sub-frames per sol`);

// Load frames
const framesPath = path.join(__dirname, '..', 'data', 'frames', 'frames.json');
const data = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
const frames = data.frames;

const sols = Object.keys(frames)
  .filter(k => !k.startsWith('_'))
  .map(Number)
  .sort((a, b) => a - b);

console.log(`Source: ${sols.length} sol keyframes (${sols[0]}-${sols[sols.length-1]})`);

// Hash a sub-frame
function hashFrame(frame) {
  const clean = {};
  for (const k of Object.keys(frame).sort()) {
    if (!k.startsWith('_')) clean[k] = frame[k];
  }
  return crypto.createHash('sha256')
    .update(JSON.stringify(clean))
    .digest('hex')
    .slice(0, 16);
}

// Interpolate between two values
function lerp(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  return t < 0.5 ? a : b;
}

// Interpolate Mars environment with diurnal physics
function interpolateMars(marsA, marsB, t, subIndex, divisions) {
  if (!marsA || !marsB) return marsA || marsB || {};
  
  // Hour within the sol (0-24.66)
  const solHours = 24.66;
  const hour = (subIndex / divisions) * solHours;
  
  // Diurnal temperature curve (coldest at dawn ~6h, warmest at ~14h)
  const diurnalPhase = ((hour - 6) / solHours) * Math.PI * 2;
  const diurnalFactor = Math.sin(diurnalPhase);
  const baseTemp = lerp(marsA.temp_c || -47, marsB.temp_c || -47, t);
  const tempSwing = 15; // ±15°C diurnal swing on Mars
  
  // Solar flux follows sun angle
  const sunAngle = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const baseSolar = lerp(marsA.solar_wm2 || 400, marsB.solar_wm2 || 400, t);
  
  return {
    ls: lerp(marsA.ls || 127, marsB.ls || 127, t),
    season: t < 0.5 ? marsA.season : marsB.season,
    temp_k: (baseTemp + diurnalFactor * tempSwing) + 273.15,
    temp_c: baseTemp + diurnalFactor * tempSwing,
    pressure_pa: lerp(marsA.pressure_pa || 750, marsB.pressure_pa || 750, t),
    solar_wm2: baseSolar * sunAngle,
    dust_tau: lerp(marsA.dust_tau || 0.15, marsB.dust_tau || 0.15, t),
    wind_ms: lerp(marsA.wind_ms || 7, marsB.wind_ms || 7, t) * (1 + Math.sin(hour * 0.5) * 0.3),
    lmst: hour,
  };
}

// Interpolate comms
function interpolateComms(commsA, commsB, t) {
  if (!commsA || !commsB) return commsA || commsB || {};
  return {
    earth_delay_min: lerp(commsA.earth_delay_min, commsB.earth_delay_min, t),
    window_open: t < 0.5 ? commsA.window_open : commsB.window_open,
    bandwidth_kbps: lerp(commsA.bandwidth_kbps || 32, commsB.bandwidth_kbps || 32, t),
  };
}

// Interpolate terrain (mostly static, slight variation)
function interpolateTerrain(terrA, terrB, t) {
  if (!terrA || !terrB) return terrA || terrB || {};
  return {
    regolith_hardness: lerp(terrA.regolith_hardness, terrB.regolith_hardness, t),
    water_ice_depth_m: lerp(terrA.water_ice_depth_m, terrB.water_ice_depth_m, t),
    surface_radiation_usv: lerp(terrA.surface_radiation_usv, terrB.surface_radiation_usv, t),
  };
}

// Generate sub-frames between two sol keyframes
function subdivide(solA, solB, frameA, frameB) {
  const subFrames = [];
  let prevHash = frameA._hash;
  
  for (let i = 1; i < divisions; i++) {
    const t = i / divisions; // 0..1 interpolation factor
    
    const sub = {
      sol: solA + t,
      sol_keyframe: solA,
      sub_index: i,
      sub_depth: depth,
      sub_divisions: divisions,
      utc: null, // derived, not authoritative
      mars: interpolateMars(frameA.mars, frameB.mars, t, i, divisions),
      events: [], // events only fire at sol boundaries
      hazards: t < 0.5 ? frameA.hazards : [], // hazards active first half
      comms: interpolateComms(frameA.comms, frameB.comms, t),
      terrain: interpolateTerrain(frameA.terrain, frameB.terrain, t),
      challenge: null,
      frame_echo: {
        prev_sol: solA,
        next_sol: solB,
        interpolation_t: t,
        type: 'sub_frame',
      },
    };
    
    sub._hash = hashFrame(sub);
    sub._prev_hash = prevHash;
    prevHash = sub._hash;
    
    subFrames.push(sub);
  }
  
  return { subFrames, lastHash: prevHash };
}

// Generate all sub-frames
const subFrameBundle = {
  _format: 'mars-barn-sub-frames',
  _version: 1,
  _depth: depth,
  _divisions: divisions,
  _chain_version: 1,
  _source_frames: sols.length,
  sub_frames: {},
};

let totalSubs = 0;

for (let i = 0; i < sols.length - 1; i++) {
  const solA = sols[i];
  const solB = sols[i + 1];
  const frameA = frames[String(solA)];
  const frameB = frames[String(solB)];
  
  if (!frameA || !frameB) continue;
  
  const { subFrames } = subdivide(solA, solB, frameA, frameB);
  
  subFrames.forEach(sf => {
    const key = sf.sol.toFixed(depth); // e.g., "1.25", "1.50", "1.75"
    subFrameBundle.sub_frames[key] = sf;
    totalSubs++;
  });
}

// Save
const outPath = path.join(__dirname, '..', 'data', 'frames', `sub-frames-d${depth}.json`);
fs.writeFileSync(outPath, JSON.stringify(subFrameBundle));

const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`Generated ${totalSubs} sub-frames → ${outPath} (${sizeKB} KB)`);
console.log(`Each sol now has ${divisions} time slices (${(24.66/divisions).toFixed(1)}h each)`);

// Verify chain integrity
let chainBreaks = 0;
const subKeys = Object.keys(subFrameBundle.sub_frames)
  .map(Number).sort((a, b) => a - b);

for (let i = 1; i < subKeys.length; i++) {
  const curr = subFrameBundle.sub_frames[subKeys[i].toFixed(depth)];
  const prev = subFrameBundle.sub_frames[subKeys[i-1].toFixed(depth)];
  // Chain breaks are expected at sol boundaries (sub-frames chain within a sol)
  if (Math.floor(subKeys[i]) === Math.floor(subKeys[i-1])) {
    if (curr._prev_hash !== prev._hash) chainBreaks++;
  }
}
console.log(`Chain verification: ${chainBreaks} breaks (0 = perfect)`);
