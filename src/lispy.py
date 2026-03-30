"""Mars Barn Opus — LisPy VM

A safe, sandboxed Lisp interpreter for colony control programs.
No file I/O. No imports. No network. Pure computation.

The colony's onboard computer runs LisPy programs that control
heating, ISRU, greenhouse, and emergency responses. Same code
runs in simulation AND on real hardware.

S-expressions are both data AND executable code (homoiconic).
The output of one program is the input to the next — data sloshing
at the language level.

Usage:
    vm = LispyVM()
    vm.set_env("o2_days", 15.0)
    vm.set_env("food_days", 8.0)
    result = vm.run("(if (< o2_days 10) (set! isru_alloc 0.7) (set! isru_alloc 0.4))")
"""
from __future__ import annotations

import math
import operator
from typing import Any, Dict, List, Optional, Union

Symbol = str
Number = Union[int, float]
Atom = Union[Symbol, Number]
Expr = Union[Atom, List]


class LispyError(Exception):
    """Error in LisPy execution."""
    pass


class Environment:
    """LisPy variable environment with parent scope chain."""

    def __init__(self, params=(), args=(), parent=None):
        self.data: Dict[str, Any] = {}
        self.data.update(zip(params, args))
        self.parent = parent

    def get(self, name: str) -> Any:
        if name in self.data:
            return self.data[name]
        if self.parent:
            return self.parent.get(name)
        raise LispyError(f"Undefined: {name}")

    def set(self, name: str, value: Any) -> None:
        self.data[name] = value

    def update_existing(self, name: str, value: Any) -> None:
        """Update a variable in the nearest scope where it exists."""
        if name in self.data:
            self.data[name] = value
        elif self.parent:
            self.parent.update_existing(name, value)
        else:
            self.data[name] = value


def tokenize(source: str) -> List[str]:
    """Split source into tokens, preserving quoted strings."""
    tokens = []
    i = 0
    s = source
    while i < len(s):
        c = s[i]
        if c in ' \t\n\r':
            i += 1
        elif c == ';':
            # Comment: skip to end of line
            while i < len(s) and s[i] != '\n':
                i += 1
        elif c == '(':
            tokens.append('(')
            i += 1
        elif c == ')':
            tokens.append(')')
            i += 1
        elif c == '"':
            j = i + 1
            while j < len(s) and s[j] != '"':
                j += 1
            tokens.append(s[i:j + 1])
            i = j + 1
        else:
            j = i
            while j < len(s) and s[j] not in ' \t\n\r()':
                j += 1
            tokens.append(s[i:j])
            i = j
    return tokens


def parse(tokens: List[str]) -> Expr:
    """Parse tokens into an AST."""
    if not tokens:
        raise LispyError("Unexpected EOF")
    token = tokens.pop(0)
    if token == '(':
        expr = []
        while tokens and tokens[0] != ')':
            expr.append(parse(tokens))
        if not tokens:
            raise LispyError("Missing closing )")
        tokens.pop(0)  # Remove ')'
        return expr
    elif token == ')':
        raise LispyError("Unexpected )")
    else:
        return atomize(token)


def atomize(token: str) -> Atom:
    """Convert token to number, string, or symbol."""
    # String literals
    if token.startswith('"') and token.endswith('"'):
        return token[1:-1]
    try:
        return int(token)
    except ValueError:
        try:
            return float(token)
        except ValueError:
            return Symbol(token)


def read(source: str) -> Expr:
    """Parse source string into AST."""
    tokens = tokenize(source)
    if not tokens:
        return []
    return parse(tokens)


def standard_env() -> Environment:
    """Create the standard LisPy environment with safe builtins."""
    env = Environment()
    # Arithmetic
    env.set('+', lambda *a: sum(a))
    env.set('-', lambda a, b=None: -a if b is None else a - b)
    env.set('*', lambda *a: math.prod(a))
    env.set('/', lambda a, b: a / b if b != 0 else 0)
    env.set('%', lambda a, b: a % b if b != 0 else 0)
    # Comparison
    env.set('>', operator.gt)
    env.set('<', operator.lt)
    env.set('>=', operator.ge)
    env.set('<=', operator.le)
    env.set('=', operator.eq)
    env.set('!=', lambda a, b: a != b)
    # Math
    env.set('abs', abs)
    env.set('max', max)
    env.set('min', min)
    env.set('round', round)
    env.set('sqrt', math.sqrt)
    env.set('sin', math.sin)
    env.set('cos', math.cos)
    env.set('pi', math.pi)
    # Logic
    env.set('and', lambda a, b: a and b)
    env.set('or', lambda a, b: a or b)
    env.set('not', lambda a: not a)
    # List ops
    env.set('list', lambda *a: list(a))
    env.set('car', lambda a: a[0] if a else None)
    env.set('cdr', lambda a: a[1:] if a else [])
    env.set('cons', lambda a, b: [a] + (b if isinstance(b, list) else [b]))
    env.set('len', len)
    env.set('null?', lambda a: a is None or a == [] or a == 0)
    # String
    env.set('str', str)
    # Constants
    env.set('true', True)
    env.set('false', False)
    env.set('nil', None)
    return env


class LispyVM:
    """Safe LisPy virtual machine for colony control programs.

    Sandboxed: no file I/O, no imports, no network.
    Execution limited to MAX_STEPS to prevent infinite loops.
    """

    MAX_STEPS = 10000

    def __init__(self):
        self.env = standard_env()
        self.steps = 0
        self.output: List[str] = []

    def set_env(self, name: str, value: Any) -> None:
        """Set a variable in the VM environment."""
        self.env.set(name, value)

    def get_env(self, name: str) -> Any:
        """Get a variable from the VM environment."""
        return self.env.get(name)

    def run(self, source: str) -> Any:
        """Execute a LisPy program. Returns the result."""
        self.steps = 0
        self.output = []
        try:
            ast = read(source)
            return self._eval(ast, self.env)
        except LispyError:
            raise
        except Exception as e:
            raise LispyError(f"Runtime error: {e}")

    def run_program(self, source: str) -> Any:
        """Execute multiple expressions separated by newlines."""
        self.steps = 0
        self.output = []
        result = None
        # Split into top-level expressions
        tokens = tokenize(source)
        while tokens:
            ast = parse(tokens)
            result = self._eval(ast, self.env)
        return result

    def _eval(self, expr: Expr, env: Environment) -> Any:
        """Evaluate an expression in an environment."""
        self.steps += 1
        if self.steps > self.MAX_STEPS:
            raise LispyError(f"Execution limit exceeded ({self.MAX_STEPS} steps)")

        # Number — return as-is
        if isinstance(expr, (int, float)):
            return expr

        # String literal (already unquoted by atomize) — detect by checking
        # if it contains spaces or if it's not a valid symbol
        if isinstance(expr, str):
            # If it looks like a variable name, look it up
            # If it contains spaces or special chars, treat as string literal
            if ' ' in expr or expr == '':
                return expr
            # Try lookup; if not found and has special chars, return as string
            try:
                return env.get(expr)
            except LispyError:
                # Could be an undefined variable — re-raise
                raise

        # Empty list
        if not expr:
            return None

        # Special forms
        head = expr[0]

        if head == 'quote':
            return expr[1] if len(expr) > 1 else None

        elif head == 'if':
            test = expr[1]
            then = expr[2]
            else_ = expr[3] if len(expr) > 3 else None
            if self._eval(test, env):
                return self._eval(then, env)
            elif else_ is not None:
                return self._eval(else_, env)
            return None

        elif head == 'cond':
            for clause in expr[1:]:
                if self._eval(clause[0], env):
                    return self._eval(clause[1], env)
            return None

        elif head == 'define' or head == 'def':
            _, name, body = expr
            env.set(name, self._eval(body, env))
            return None

        elif head == 'set!':
            _, name, body = expr
            val = self._eval(body, env)
            env.update_existing(name, val)
            return val

        elif head == 'lambda' or head == 'fn':
            _, params, body = expr
            return lambda *args: self._eval(body, Environment(params, args, env))

        elif head == 'begin' or head == 'do':
            result = None
            for sub in expr[1:]:
                result = self._eval(sub, env)
            return result

        elif head == 'print':
            val = self._eval(expr[1], env)
            self.output.append(str(val))
            return val

        elif head == 'let':
            # (let ((x 1) (y 2)) body)
            bindings = expr[1]
            body = expr[2]
            local_env = Environment(parent=env)
            for binding in bindings:
                local_env.set(binding[0], self._eval(binding[1], env))
            return self._eval(body, local_env)

        else:
            # Function call
            proc = self._eval(head, env)
            args = [self._eval(arg, env) for arg in expr[1:]]
            if callable(proc):
                return proc(*args)
            raise LispyError(f"Not callable: {head}")

    def load_colony_state(self, colony_state: Dict) -> None:
        """Load colony state variables into the VM environment.

        After this, LisPy programs can read colony state directly:
        (if (< o2_days 10) ...)
        """
        for key, val in colony_state.items():
            if isinstance(val, (int, float, str, bool)):
                self.env.set(key, val)
            elif isinstance(val, dict):
                for k2, v2 in val.items():
                    if isinstance(v2, (int, float, str, bool)):
                        self.env.set(f"{key}_{k2}", v2)

    def get_allocation(self) -> Dict[str, float]:
        """Read allocation variables from the VM environment.

        Programs set these: heating_alloc, isru_alloc, greenhouse_alloc, food_ration
        """
        return {
            "heating": self.env.data.get("heating_alloc", 0.25),
            "isru": self.env.data.get("isru_alloc", 0.40),
            "greenhouse": self.env.data.get("greenhouse_alloc", 0.35),
            "ration": self.env.data.get("food_ration", 1.0),
        }


# Built-in colony control programs
CONTROL_PROGRAMS = {
    "basic_governor": """
(begin
  (define crisis (< (min o2_days h2o_days food_days) 10))
  (if crisis
    (begin
      (set! heating_alloc 0.15)
      (set! isru_alloc 0.70)
      (set! greenhouse_alloc 0.15)
      (set! food_ration 0.50))
    (begin
      (set! heating_alloc 0.25)
      (set! isru_alloc 0.40)
      (set! greenhouse_alloc 0.35)
      (set! food_ration 1.0))))
""",
    "adaptive_governor": """
(begin
  (define o2_urgent (< o2_days 5))
  (define food_urgent (< food_days 5))
  (define power_low (< power_kwh 100))
  (cond
    (o2_urgent (begin
      (set! isru_alloc 0.80)
      (set! heating_alloc 0.10)
      (set! greenhouse_alloc 0.10)
      (set! food_ration 0.50)))
    (food_urgent (begin
      (set! greenhouse_alloc 0.60)
      (set! isru_alloc 0.25)
      (set! heating_alloc 0.15)
      (set! food_ration 0.75)))
    (power_low (begin
      (set! heating_alloc 0.40)
      (set! isru_alloc 0.30)
      (set! greenhouse_alloc 0.30)
      (set! food_ration 0.80)))
    (true (begin
      (set! heating_alloc 0.20)
      (set! isru_alloc 0.45)
      (set! greenhouse_alloc 0.35)
      (set! food_ration 1.0)))))
""",
    "thermal_monitor": """
(begin
  (define temp_c (- interior_temp_k 273.15))
  (define too_cold (< temp_c 5))
  (define too_hot (> temp_c 35))
  (cond
    (too_cold (begin (set! heating_alloc 0.50) (print "THERMAL: Boosting heat")))
    (too_hot (begin (set! heating_alloc 0.10) (print "THERMAL: Reducing heat")))
    (true (print "THERMAL: Nominal"))))
""",
}
