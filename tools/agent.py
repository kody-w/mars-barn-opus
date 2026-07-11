#!/usr/bin/env python3
"""Rappter Agent Loader — One URL. One QR code. Boot an agent from anywhere.

Compatible with kody-w/AI-Agent-Templates BasicAgent interface:
  class MarsColonyAgent(BasicAgent):
    perform(**kwargs) → runs LisPy, checks status, runs gauntlet

Also runs standalone:
  python3 agent.py                          # interactive mode
  python3 agent.py --loop                   # continuous brainstem
  python3 agent.py --loop --interval 60     # every 60 seconds
  python3 agent.py --eval "(+ 2 3)"         # run LisPy expression
  python3 agent.py --status                 # colony status from latest frame

Point your local brainstem at this URL:
  python3 -c "$(curl -sL https://raw.githubusercontent.com/kody-w/mars-barn-opus/main/tools/agent.py)"

Or scan the QR code:
  https://kody-w.github.io/mars-barn-opus/agent.html
"""
from __future__ import annotations

import json
import math
import sys
import os
import hashlib
import argparse
from datetime import datetime, timezone
from pathlib import Path

try:
    import urllib.request
    HAS_NET = True
except:
    HAS_NET = False

# ── Config ──
RAW_BASE = "https://raw.githubusercontent.com/kody-w/mars-barn-opus/main"
AGENT_VERSION = "1.1.0"

# ══════════════════════════════════════════════════════════════
# BASICAGENT COMPATIBILITY (kody-w/AI-Agent-Templates)
# Same interface: __init__(name, metadata) + perform(**kwargs)
# The perform() runs LisPy. The agent IS a LisPy program.
# Drop this file into AI-Agent-Templates/agents/ and it works.
# ══════════════════════════════════════════════════════════════

class BasicAgent:
    """Compatibility shim — mirrors AI-Agent-Templates BasicAgent."""
    def __init__(self, name, metadata):
        self.name = name
        self.metadata = metadata
    def perform(self, **kwargs):
        pass


class MarsColonyAgent(BasicAgent):
    """Mars colony agent — runs LisPy programs against live frame data.
    
    Compatible with AI-Agent-Templates. The perform() method IS a LisPy program.
    Same VM as the browser sim, the OS, and the engine.
    """
    def __init__(self):
        self.name = 'MarsColony'
        self.metadata = {
            "name": self.name,
            "description": "Mars colony management agent. Pulls live frame data, runs LisPy governor programs, reports colony status. Same VM as the browser sim.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["status", "eval", "governor", "gauntlet"],
                               "description": "What to do: status check, eval LisPy, run governor, or gauntlet competition"},
                    "code": {"type": "string", "description": "LisPy code to evaluate (for eval action)"},
                    "runs": {"type": "integer", "description": "Number of gauntlet runs (default 10)"}
                },
                "required": ["action"]
            },
            # The agent's LisPy programs — the soul of the agent
            "lispy_programs": {
                "governor": LISPY_GOVERNOR,
                "status": LISPY_STATUS,
                "assess": LISPY_ASSESS,
                "memory": LISPY_MEMORY,
            }
        }
        self.vm = LispyVM()
        super().__init__(name=self.name, metadata=self.metadata)

    def perform(self, **kwargs):
        action = kwargs.get('action', 'status')
        # Seed VM with latest frame data
        latest = get_latest()
        if latest:
            frame = get_frame(latest['sol'])
            seed_vm_from_frame(self.vm, frame)

        if action == 'status':
            return self.vm.run(LISPY_STATUS)
        elif action == 'eval':
            return self.vm.run(kwargs.get('code', '(log "no code provided")'))
        elif action == 'governor':
            return self.vm.run(LISPY_GOVERNOR)
        elif action == 'gauntlet':
            return {'result': f'Run gauntlet with: python3 agent.py --gauntlet {kwargs.get("runs", 10)}'}
        return {'error': f'Unknown action: {action}'}


class LispyBasicAgent(BasicAgent):
    """The OG BasicAgent — but as LisPy. The simplest possible agent."""
    def __init__(self):
        self.name = 'LispyBasic'
        self.metadata = {
            "name": self.name,
            "description": "Basic agent that runs any LisPy program. Drop-in replacement for basic_agent.py but with LisPy VM.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "LisPy S-expression to evaluate"}
                },
                "required": ["code"]
            }
        }
        self.vm = LispyVM()
        super().__init__(name=self.name, metadata=self.metadata)

    def perform(self, **kwargs):
        code = kwargs.get('code', '(log "hello from LisPy")')
        return self.vm.run(code)


class LispyMemoryAgent(BasicAgent):
    """Memory agent — stores and recalls context using LisPy env vars.
    
    Compatible with context_memory_agent.py but memory lives in the VM.
    Export as cartridge to persist. Import to restore.
    """
    def __init__(self):
        self.name = 'LispyMemory'
        self.metadata = {
            "name": self.name,
            "description": "Stores and recalls memories using LisPy VM environment. Memory persists in env vars. Export as cartridge to save.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["store", "recall", "list", "clear"],
                               "description": "store=save a memory, recall=get a memory, list=all keys, clear=wipe"},
                    "key": {"type": "string", "description": "Memory key (for store/recall)"},
                    "value": {"type": "string", "description": "Memory value (for store)"}
                },
                "required": ["action"]
            }
        }
        self.vm = LispyVM()
        self.vm.set_env('_memories', {})
        super().__init__(name=self.name, metadata=self.metadata)

    def perform(self, **kwargs):
        action = kwargs.get('action', 'list')
        key = kwargs.get('key', '')
        value = kwargs.get('value', '')
        if action == 'store':
            return self.vm.run(f'(begin (set! _mem_{key} "{value}") (log (concat "Stored: {key} = {value}")))')
        elif action == 'recall':
            return self.vm.run(f'(begin (log (concat "Recall: {key} = " (string _mem_{key}))))')
        elif action == 'list':
            keys = [k for k in self.vm.env if k.startswith('_mem_')]
            return {'ok': True, 'result': keys, 'output': [f'{len(keys)} memories stored']}
        elif action == 'clear':
            for k in list(self.vm.env):
                if k.startswith('_mem_'): del self.vm.env[k]
            return {'ok': True, 'result': 'cleared', 'output': ['Memory cleared']}
        return {'error': f'Unknown action: {action}'}


# ── LisPy Programs (the soul of each agent) ──
# These are the actual programs that run in the VM.
# Same language as the browser sim, the OS, the engine. 1:1.

LISPY_GOVERNOR = """(begin
  (cond
    ((< o2_days 5) (begin (set! isru_alloc 0.85) (set! greenhouse_alloc 0.05) (set! heating_alloc 0.10) (log "⚠ O₂ EMERGENCY")))
    ((< food_days 10) (begin (set! isru_alloc 0.25) (set! greenhouse_alloc 0.60) (set! heating_alloc 0.15) (log "🌱 Food priority")))
    ((< power_kwh 80) (begin (set! heating_alloc 0.55) (set! isru_alloc 0.25) (set! greenhouse_alloc 0.20) (log "⚡ Power critical")))
    (true (begin (set! isru_alloc 0.35) (set! greenhouse_alloc 0.40) (set! heating_alloc 0.25) (log "✓ Nominal")))))"""

LISPY_STATUS = """(begin
  (log (concat "Sol " (string sol) " | CRI " (string colony_risk_index)))
  (log (concat "O₂: " (string (round o2_days)) "d | H₂O: " (string (round h2o_days)) "d | Food: " (string (round food_days)) "d"))
  (log (concat "Power: " (string (round power_kwh)) " kWh | Solar: " (string (round (* solar_eff 100))) "%"))
  (log (concat "Crew: " (string crew_alive) "/" (string crew_total) " | Morale: " (string (round morale)) "%")))"""

LISPY_ASSESS = """(begin
  (define critical (> colony_risk_index 50))
  (define o2_ok (> o2_days 10))
  (define power_ok (> power_kwh 100))
  (define food_ok (> food_days 15))
  (cond
    (critical (log "🔴 CRITICAL — immediate action needed"))
    ((not o2_ok) (log "🟡 O₂ declining — boost ISRU"))
    ((not power_ok) (log "🟡 Power low — check solar"))
    ((not food_ok) (log "🟡 Food declining — boost greenhouse"))
    (true (log "🟢 All systems nominal"))))"""

LISPY_MEMORY = """(begin
  (log "Memory agent ready")
  (log "Use (set! _mem_KEY VALUE) to store")
  (log "Use _mem_KEY to recall")
  (log "Memory persists in VM env — export as cartridge to save"))"""

# ── LisPy VM (canonical Python implementation) ──
class LispyVM:
    def __init__(self):
        self.env = {}
        self.output = []
        self.steps = 0
        self.max_steps = 100000

    def set_env(self, k, v):
        self.env[k] = v

    def tokenize(self, src):
        tokens, i = [], 0
        while i < len(src):
            c = src[i]
            if c in ' \t\n\r': i += 1; continue
            if c == ';':
                while i < len(src) and src[i] != '\n': i += 1
                continue
            if c in '()': tokens.append(c); i += 1; continue
            if c == '"':
                s = '"'; i += 1
                while i < len(src) and src[i] != '"':
                    if src[i] == '\\': s += src[i]; i += 1
                    s += src[i]; i += 1
                if i < len(src): i += 1
                tokens.append(s + '"'); continue
            tok = ''
            while i < len(src) and src[i] not in ' \t\n\r()':
                tok += src[i]; i += 1
            tokens.append(tok)
        return tokens

    def parse(self, tokens, pos=None):
        if pos is None: pos = [0]
        if pos[0] >= len(tokens): raise Exception('EOF')
        t = tokens[pos[0]]; pos[0] += 1
        if t == '(':
            lst = []
            while pos[0] < len(tokens) and tokens[pos[0]] != ')':
                lst.append(self.parse(tokens, pos))
            if pos[0] < len(tokens): pos[0] += 1
            return lst
        if t.startswith('"'): return ('__str', t[1:-1])
        try: return float(t) if '.' in t else int(t)
        except: return t

    def eval(self, expr):
        self.steps += 1
        if self.steps > self.max_steps: raise Exception('Step limit')
        if isinstance(expr, (int, float)): return expr
        if isinstance(expr, tuple) and expr[0] == '__str': return expr[1]
        if isinstance(expr, str):
            if expr == 'true': return True
            if expr == 'false': return False
            if expr in self.env: return self.env[expr]
            raise Exception(f'Undefined: {expr}')
        if not isinstance(expr, list) or not expr: return expr
        op, args = expr[0], expr[1:]
        if op == 'begin':
            r = None
            for a in args: r = self.eval(a)
            return r
        if op == 'define': self.env[args[0]] = self.eval(args[1]); return self.env[args[0]]
        if op == 'set!': self.env[args[0]] = self.eval(args[1]); return self.env[args[0]]
        if op == 'if': return self.eval(args[1]) if self.eval(args[0]) else (self.eval(args[2]) if len(args) > 2 else False)
        if op == 'cond':
            for clause in args:
                if self.eval(clause[0]):
                    r = None
                    for b in clause[1:]: r = self.eval(b)
                    return r
            return False
        if op in ('log', 'print'):
            v = ' '.join(str(self.eval(a)) for a in args)
            self.output.append(v)
            return v
        if op == 'concat': return ''.join(str(self.eval(a)) for a in args)
        if op == 'string': return str(self.eval(args[0]))
        vals = [self.eval(a) for a in args]
        ops = {
            '+': lambda: sum(vals), '-': lambda: -vals[0] if len(vals)==1 else vals[0]-vals[1],
            '*': lambda: math.prod(vals), '/': lambda: vals[0]/vals[1],
            '<': lambda: vals[0]<vals[1], '>': lambda: vals[0]>vals[1],
            '<=': lambda: vals[0]<=vals[1], '>=': lambda: vals[0]>=vals[1],
            '=': lambda: vals[0]==vals[1], '!=': lambda: vals[0]!=vals[1],
            'min': lambda: min(vals), 'max': lambda: max(vals),
            'abs': lambda: abs(vals[0]), 'round': lambda: round(vals[0]),
            'and': lambda: all(vals), 'or': lambda: any(vals), 'not': lambda: not vals[0],
        }
        if op in ops: return ops[op]()
        raise Exception(f'Unknown: {op}')

    def run(self, src):
        self.steps = 0; self.output = []
        try:
            tokens = self.tokenize(src)
            ast = self.parse(tokens)
            result = self.eval(ast)
            return {'ok': True, 'result': result, 'env': self.env, 'output': self.output}
        except Exception as e:
            return {'ok': False, 'error': str(e), 'env': self.env, 'output': self.output}


# ── Network ──
def fetch_json(url):
    if not HAS_NET: return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'RappterAgent/1.0'})
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read())
    except Exception as e:
        return None


def fetch_text(url):
    if not HAS_NET: return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'RappterAgent/1.0'})
        return urllib.request.urlopen(req, timeout=15).read().decode()
    except:
        return None


# ── Agent Functions ──
def get_latest():
    return fetch_json(f"{RAW_BASE}/data/frames/latest.json")


def get_frame(sol):
    return fetch_json(f"{RAW_BASE}/data/frames/sol-{sol:04d}.json")


def get_bundle():
    return fetch_json(f"{RAW_BASE}/data/frames/frames.json")


def get_manifest():
    return fetch_json(f"{RAW_BASE}/data/frames/manifest.json")


def frame_mars(frame):
    """Normalize legacy and versioned frame environment fields."""
    raw = (frame or {}).get('mars') or (frame or {}).get('environment') or {}
    temp_k = raw.get('temp_k', raw.get('temperature_k'))
    temp_c = raw.get('temp_c', raw.get('temperature_c'))
    if temp_k is None:
        temp_k = temp_c + 273.15 if temp_c is not None else 213.15
    if temp_c is None:
        temp_c = temp_k - 273.15
    return {
        'temp_c': temp_c,
        'temp_k': temp_k,
        'dust_tau': raw.get(
            'dust_tau',
            0.8 if raw.get('dust_storm') else 0.15,
        ),
        'solar_wm2': raw.get('solar_wm2', raw.get('solar_irradiance', 490)),
        'wind_ms': raw.get('wind_ms', raw.get('wind_speed_ms', 4)),
        'pressure_pa': raw.get('pressure_pa', 740),
        'season': raw.get('season', 'Unknown'),
        'lmst': raw.get('lmst', 12),
    }


def seed_vm_from_frame(vm, frame):
    """Seed the LisPy VM with Mars conditions from a frame."""
    if not frame: return
    m = frame_mars(frame)
    vm.set_env('sol', frame.get('sol', 0))
    vm.set_env('temp_c', m.get('temp_c', -60))
    vm.set_env('temp_k', m.get('temp_k', 213))
    vm.set_env('dust_tau', m.get('dust_tau', 0.15))
    vm.set_env('solar_wm2', m.get('solar_wm2', 490))
    vm.set_env('wind_ms', m.get('wind_ms', 4))
    vm.set_env('pressure_pa', m.get('pressure_pa', 740))
    vm.set_env('season', m.get('season', 'Unknown'))
    vm.set_env('lmst', m.get('lmst', 12))
    vm.set_env('events_active', len(frame.get('events', [])))
    # Defaults for colony state (override with cartridge if available)
    for k, v in {'o2_days':18,'h2o_days':22,'food_days':31,'power_kwh':342,
                  'crew_alive':4,'crew_total':6,'colony_risk_index':28,
                  'morale':72,'solar_eff':0.82,'modules_built':3,'research_count':2}.items():
        if k not in vm.env: vm.set_env(k, v)


def show_status():
    latest = get_latest()
    if not latest:
        print("Cannot reach public repo. Offline.")
        return
    frame = get_frame(latest['sol'])
    if not frame:
        print(f"Latest: Sol {latest['sol']} (frame fetch failed)")
        return
    m = frame_mars(frame)
    print(f"╔══════════════════════════════════╗")
    print(f"║  MARS STATUS — Sol {latest['sol']:<14}║")
    print(f"╠══════════════════════════════════╣")
    print(f"║  Temp:    {m['temp_c']}°C{' ':16}║")
    print(f"║  Dust τ:  {m['dust_tau']}{' ':19}║")
    print(f"║  Solar:   {m['solar_wm2']} W/m²{' ':14}║")
    print(f"║  Wind:    {m['wind_ms']} m/s{' ':16}║")
    print(f"║  Season:  {m['season'][:18]:<18}║")
    print(f"║  Events:  {len(frame.get('events',[]))}{' ':21}║")
    print(f"║  Hazards: {len(frame.get('hazards',[]))}{' ':21}║")
    print(f"╚══════════════════════════════════╝")
    if frame.get('events'):
        for e in frame['events']:
            print(f"  ⚡ {e['type']}: {e.get('desc','')}")
    if frame.get('hazards'):
        for h in frame['hazards']:
            print(f"  ⚠ {h['type']}" + (f" → {h.get('target','')}" if h.get('target') else ''))


def run_repl():
    vm = LispyVM()
    latest = get_latest()
    if latest:
        frame = get_frame(latest['sol'])
        seed_vm_from_frame(vm, frame)
        print(f"Connected to Sol {latest['sol']} · LisPy VM ready")
    else:
        print("Offline mode · LisPy VM ready")
    print("Type LisPy expressions. (help) for commands. Ctrl+C to exit.\n")

    while True:
        try:
            code = input("λ> ").strip()
            if not code: continue
            if code in ('exit', 'quit', '(exit)', '(quit)'): break
            result = vm.run(code)
            if result['ok']:
                for line in result['output']: print(line)
                if result['result'] is not None and not result['output']:
                    print(result['result'])
            else:
                print(f"ERROR: {result['error']}")
        except (KeyboardInterrupt, EOFError):
            print("\nBye.")
            break


def run_eval(code):
    vm = LispyVM()
    latest = get_latest()
    if latest:
        frame = get_frame(latest['sol'])
        seed_vm_from_frame(vm, frame)
    result = vm.run(code)
    if result['ok']:
        for line in result['output']: print(line)
        if result['result'] is not None and not result['output']:
            print(result['result'])
    else:
        print(f"ERROR: {result['error']}")
        sys.exit(1)


def run_loop(interval):
    import time
    print(f"Agent loop: every {interval}s · Ctrl+C to stop\n")
    vm = LispyVM()
    last_sol = 0
    while True:
        try:
            latest = get_latest()
            if latest and latest['sol'] != last_sol:
                frame = get_frame(latest['sol'])
                seed_vm_from_frame(vm, frame)
                last_sol = latest['sol']
                m = frame_mars(frame)
                print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                      f"Sol {latest['sol']} · {m.get('temp_c','?')}°C · "
                      f"τ{m.get('dust_tau','?')} · {len(frame.get('events',[]))} events")
                # Run governor
                gov = vm.run('(cond ((< o2_days 5) "O2_EMERGENCY") ((< power_kwh 80) "POWER_CRITICAL") (true "NOMINAL"))')
                if gov['ok']: print(f"  Governor: {gov['result']}")
            else:
                print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] No new frame (Sol {last_sol})")
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\nAgent stopped.")
            break


# ── Main ──
def main():
    parser = argparse.ArgumentParser(
        description='Rappter Agent — boot from anywhere, connect to the sim',
        epilog='One URL. One QR code. One agent.\n'
               'curl -sL https://raw.githubusercontent.com/kody-w/mars-barn-opus/main/tools/agent.py | python3 -')
    parser.add_argument('--status', action='store_true', help='Show Mars status from latest frame')
    parser.add_argument('--eval', type=str, help='Evaluate a LisPy expression')
    parser.add_argument('--loop', action='store_true', help='Run as continuous brainstem')
    parser.add_argument('--interval', type=int, default=300, help='Loop interval in seconds')
    parser.add_argument('--version', action='store_true', help='Show version')
    args = parser.parse_args()

    if args.version:
        print(f"Rappter Agent v{AGENT_VERSION}")
        return

    print(f"═══ RAPPTER AGENT v{AGENT_VERSION} ═══")
    print(f"Source: {RAW_BASE}")
    print()

    if args.status:
        show_status()
    elif args.eval:
        run_eval(args.eval)
    elif args.loop:
        run_loop(args.interval)
    else:
        run_repl()


if __name__ == '__main__':
    main()
