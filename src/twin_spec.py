"""Mars Barn Opus — Physical Twin Hardware Specification

Auto-generated engineering document specifying exactly what hardware
is needed to build the physical twin. Pin mappings, wiring, sensors,
actuators — everything the digital twin's state model implies.

The digital twin generates its own hardware spec. If the sim tracks
a value, the physical twin needs a sensor for it.
"""
from __future__ import annotations

from typing import Dict, List


def generate_hardware_spec() -> Dict:
    """Generate the complete physical twin hardware specification.

    Maps every digital twin state variable to physical hardware:
    - Sensors for inputs (temperature, pressure, light)
    - Actuators for outputs (heaters, pumps, LEDs)
    - Controllers for processing (Raspberry Pi, Arduino)
    """
    return {
        "title": "Mars Barn Opus — Physical Twin Hardware Specification",
        "version": "1.0",
        "description": "Everything needed to build the physical twin from the digital twin state model",
        "controller": {
            "primary": "Raspberry Pi 4B (4GB)",
            "secondary": "Arduino Mega 2560 (sensor I/O)",
            "communication": "USB serial between Pi and Arduino",
            "software": "Python 3.9+ running mission_control.py",
            "state_sync": "Pi reads /tmp/mars-twin-state.json, Arduino reads I2C",
        },
        "sensors": [
            {"name": "Interior Temperature", "maps_to": "colony.interior_temp_k",
             "hardware": "DHT22 or BME280", "pin": "Arduino A0 / I2C",
             "range": "-40°C to 80°C", "accuracy": "±0.5°C"},
            {"name": "Exterior Temperature", "maps_to": "environment.exterior_temp_k",
             "hardware": "DS18B20 (waterproof)", "pin": "Arduino D2 (OneWire)",
             "range": "-55°C to 125°C", "notes": "Simulate Mars exterior with freezer"},
            {"name": "Light Level (Solar)", "maps_to": "environment.irradiance_w_m2",
             "hardware": "BH1750 light sensor", "pin": "I2C (SDA/SCL)",
             "range": "0-65535 lux", "notes": "Map lux to W/m² for Mars equivalent"},
            {"name": "Pressure", "maps_to": "environment.pressure_pa",
             "hardware": "BMP280 barometric sensor", "pin": "I2C",
             "range": "300-1100 hPa", "notes": "Mars is ~6.1 hPa — scale proportionally"},
            {"name": "Air Quality (O2 proxy)", "maps_to": "colony.resources.o2_kg",
             "hardware": "MQ-135 gas sensor", "pin": "Arduino A1",
             "notes": "Relative air quality as O2 proxy"},
            {"name": "Humidity (H2O proxy)", "maps_to": "colony.resources.h2o_liters",
             "hardware": "DHT22 humidity", "pin": "Shared with temp sensor",
             "notes": "Humidity as water availability proxy"},
            {"name": "Power Monitor", "maps_to": "colony.resources.power_kwh",
             "hardware": "INA219 current/voltage sensor", "pin": "I2C",
             "notes": "Monitor actual solar panel output"},
        ],
        "actuators": [
            {"name": "Habitat Heater", "maps_to": "allocation.heating_fraction",
             "hardware": "12V ceramic heater + MOSFET", "pin": "Arduino D3 (PWM)",
             "control": "PWM proportional to heating allocation"},
            {"name": "ISRU Indicator", "maps_to": "allocation.isru_fraction",
             "hardware": "Blue LED strip", "pin": "Arduino D5 (PWM)",
             "control": "Brightness = ISRU allocation percentage"},
            {"name": "Greenhouse Light", "maps_to": "allocation.greenhouse_fraction",
             "hardware": "Green LED grow light strip", "pin": "Arduino D6 (PWM)",
             "control": "Brightness = greenhouse allocation"},
            {"name": "Alert Beacon", "maps_to": "sync_instructions.alert_level",
             "hardware": "RGB LED (WS2812B)", "pin": "Arduino D7",
             "control": "GREEN=nominal, YELLOW=warning, RED=critical, OFF=dead"},
            {"name": "Solar Panel Servo", "maps_to": "environment.sun_angle",
             "hardware": "SG90 servo motor", "pin": "Arduino D9 (Servo)",
             "control": "Angle tracks sun position from digital twin"},
            {"name": "Dome Interior Light", "maps_to": "colony.alive",
             "hardware": "Warm white LED (2700K)", "pin": "Arduino D10 (PWM)",
             "control": "Bright when alive, flicker pattern when cascade active"},
            {"name": "Landing Pad Beacons", "maps_to": "night detection",
             "hardware": "4x red LEDs", "pin": "Arduino D11",
             "control": "Blink at night, off during day"},
            {"name": "Rover Motors", "maps_to": "rovers autonomous",
             "hardware": "2x N20 gear motors + L298N driver",
             "pin": "Arduino D12/D13 + A2/A3",
             "control": "Random patrol pattern from sim state"},
            {"name": "Speaker/Buzzer", "maps_to": "events",
             "hardware": "Piezo buzzer or small speaker", "pin": "Arduino D4",
             "control": "Beep on events, alarm on cascade, silence on death"},
        ],
        "power": {
            "primary": "5V 3A USB-C (Raspberry Pi)",
            "secondary": "12V 2A barrel jack (Arduino + actuators)",
            "solar": "6V 1W mini solar panel → INA219 → charge controller",
            "battery": "18650 Li-ion cell for backup (optional)",
        },
        "physical_structure": {
            "base": "30cm x 30cm MDF or acrylic platform",
            "dome": "Clear plastic hemisphere (10cm diameter) over warm LED",
            "terrain": "Red/brown sand or clay over foam base",
            "modules": "3D printed or cardboard boxes with colored LEDs",
            "rover": "Small 2WD robot chassis (5cm) on terrain",
            "antenna": "Thin wire or toothpick with red LED on top",
            "solar_panels": "Small photovoltaic cells or blue cardboard on servo",
        },
        "wiring_summary": {
            "I2C_bus": ["BH1750", "BMP280", "INA219", "BME280"],
            "analog_pins": ["MQ-135 (A1)"],
            "digital_PWM": ["Heater (D3)", "ISRU LED (D5)", "GH LED (D6)",
                            "Dome light (D10)"],
            "digital_IO": ["OneWire temp (D2)", "Buzzer (D4)", "RGB LED (D7)",
                           "Servo (D9)", "Pad LEDs (D11)", "Motors (D12/D13)"],
        },
        "sync_protocol": {
            "interval": "Every 1 second (1 sol = 1 second in accelerated mode)",
            "source": "/tmp/mars-twin-state.json",
            "reader": "Python script on Pi reads JSON, sends commands to Arduino via serial",
            "format": "JSON → serial command string: 'H:25,I:40,G:35,A:GREEN,T:293'",
            "latency": "< 100ms from state file update to actuator response",
        },
    }


def spec_to_text(spec: Dict) -> str:
    """Render spec as human-readable text document."""
    lines = [
        f"{'='*70}",
        spec["title"],
        f"Version: {spec['version']}",
        f"{'='*70}",
        "",
        spec["description"],
        "",
        "CONTROLLER",
        f"  Primary: {spec['controller']['primary']}",
        f"  Secondary: {spec['controller']['secondary']}",
        f"  Sync: {spec['controller']['state_sync']}",
        "",
        "SENSORS",
    ]
    for s in spec["sensors"]:
        lines.append(f"  {s['name']}")
        lines.append(f"    Hardware: {s['hardware']}")
        lines.append(f"    Pin: {s['pin']}")
        lines.append(f"    Maps to: {s['maps_to']}")
        lines.append("")

    lines.append("ACTUATORS")
    for a in spec["actuators"]:
        lines.append(f"  {a['name']}")
        lines.append(f"    Hardware: {a['hardware']}")
        lines.append(f"    Pin: {a['pin']}")
        lines.append(f"    Control: {a['control']}")
        lines.append("")

    lines.append("SYNC PROTOCOL")
    for k, v in spec["sync_protocol"].items():
        lines.append(f"  {k}: {v}")

    return "\n".join(lines)
