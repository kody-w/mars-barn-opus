#!/usr/bin/env node
/**
 * Test v7 Sabatier chemistry physics implementation
 */

// v7 Sabatier Reaction Physics - Real NASA ISRU chemistry
const SABATIER_TEMP_OPTIMAL = 623; // 350°C optimal (K)
const SABATIER_TEMP_MIN = 573;     // 300°C minimum (K)
const MARS_CO2_PRESSURE = 606;     // Pa (Mars surface)
const ELECTROLYSIS_EFFICIENCY = 0.70;  // 70% practical efficiency

function sabatierReactionRate(catalyst_temp, co2_pressure, catalyst_efficiency, power_kw) {
  // Temperature efficiency (Arrhenius-like behavior)
  const temp_factor = Math.max(0.1, Math.min(1.0, 
    (catalyst_temp - SABATIER_TEMP_MIN) / (SABATIER_TEMP_OPTIMAL - SABATIER_TEMP_MIN)
  ));
  
  // CO₂ pressure factor (Mars has low pressure, needs compression)
  const pressure_factor = Math.min(1.0, co2_pressure / MARS_CO2_PRESSURE);
  
  // Power limitation (minimum ~1.5 kW for practical Sabatier reactor)
  const power_factor = Math.min(1.0, Math.max(0, (power_kw - 1.5) / 2.0));
  
  // ADJUSTED: Base rate to match legacy O₂ production when optimal
  // Target: ~2.8 kg O₂/sol at optimal conditions → ~6.3 kg H₂O/sol → ~0.26 kg H₂O/hr
  const base_h2o_rate = 0.26; // kg/hr (reduced from 0.5 to match legacy)
  
  return base_h2o_rate * temp_factor * pressure_factor * power_factor * catalyst_efficiency;
}

function electrolysisRate(h2o_available_kg, power_kw, electrode_efficiency, electrode_temp) {
  const energy_per_kg_o2 = 5.0; // kWh/kg O₂ (includes system losses)
  const max_o2_from_power = power_kw / energy_per_kg_o2; // kg O₂/hour
  
  // Stoichiometry: 18g H₂O → 8g O₂ → 0.444 kg O₂ per kg H₂O
  const max_o2_from_water = h2o_available_kg * 0.444;
  
  // Temperature efficiency (higher temp = better efficiency but more degradation)
  const temp_factor = Math.min(1.2, Math.max(0.7, (electrode_temp + 20) / 293.0));
  
  // Limited by power OR water availability
  const actual_o2_rate = Math.min(max_o2_from_power, max_o2_from_water) * 
                        electrode_efficiency * temp_factor * ELECTROLYSIS_EFFICIENCY;
  
  // Corresponding H₂O consumption
  const h2o_consumed = actual_o2_rate / 0.444;
  
  return { o2_kg_hr: actual_o2_rate, h2o_consumed_kg_hr: h2o_consumed };
}

// Run tests
console.log('=== v7 Sabatier Chemistry Physics Test ===\n');

console.log('1. Sabatier Reaction Rate (CO₂ + 4H₂ → CH₄ + 2H₂O)');
console.log('Conditions: 350°C, 606 Pa CO₂, 3 kW power');

const fresh_catalyst = sabatierReactionRate(623, 606, 1.0, 3.0);
console.log('Fresh catalyst (100%): ', fresh_catalyst.toFixed(3), 'kg H₂O/hr');

const degraded_catalyst = sabatierReactionRate(623, 606, 0.5, 3.0);
console.log('Degraded catalyst (50%):', degraded_catalyst.toFixed(3), 'kg H₂O/hr');
console.log('Degradation impact:    ', ((1 - degraded_catalyst/fresh_catalyst) * 100).toFixed(1), '% loss\n');

console.log('2. Electrolysis (2H₂O → 2H₂ + O₂)');
console.log('Conditions: 5 kg H₂O available, 3 kW power, 350°C');

const fresh_electrodes = electrolysisRate(5, 3.0, 1.0, 623);
console.log('Fresh electrodes (100%): ', fresh_electrodes.o2_kg_hr.toFixed(3), 'kg O₂/hr');

const degraded_electrodes = electrolysisRate(5, 3.0, 0.5, 623);
console.log('Degraded electrodes (50%):', degraded_electrodes.o2_kg_hr.toFixed(3), 'kg O₂/hr');
console.log('Degradation impact:      ', ((1 - degraded_electrodes.o2_kg_hr/fresh_electrodes.o2_kg_hr) * 100).toFixed(1), '% loss\n');

console.log('3. Daily Production (24.6 hour sol)');
const daily_h2o = fresh_catalyst * 24.6;
const daily_o2_fresh = fresh_electrodes.o2_kg_hr * 24.6;
const daily_o2_degraded = degraded_electrodes.o2_kg_hr * 24.6;

console.log('Daily H₂O production (fresh): ', daily_h2o.toFixed(2), 'kg/sol');
console.log('Daily O₂ production (fresh):  ', daily_o2_fresh.toFixed(2), 'kg/sol');
console.log('Daily O₂ production (degraded):', daily_o2_degraded.toFixed(2), 'kg/sol');
console.log('vs. v6 constant (2.8 kg/sol): ', ((daily_o2_fresh / 2.8) * 100).toFixed(1), '% of old rate\n');

console.log('4. Power Requirements');
console.log('Minimum Sabatier power:  1.5 kW');
console.log('Energy per kg O₂:        5.0 kWh');
console.log('Power for 2.8 kg O₂/day: ', (2.8 * 5.0 / 24.6).toFixed(1), 'kW average');