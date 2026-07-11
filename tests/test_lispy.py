"""Tests for LisPy VM — sandboxed colony control language."""
from __future__ import annotations

from contextlib import contextmanager
import re
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

from lispy import LispyVM, LispyError, read, CONTROL_PROGRAMS


@contextmanager
def raises(error_type, match):
    try:
        yield
    except error_type as error:
        assert re.search(match, str(error)), (
            f"{error!r} does not match {match!r}"
        )
    else:
        raise AssertionError(f"{error_type.__name__} was not raised")


class TestParser:
    def test_parse_number(self):
        assert read("42") == 42

    def test_parse_float(self):
        assert read("3.14") == 3.14

    def test_parse_symbol(self):
        assert read("hello") == "hello"

    def test_parse_list(self):
        assert read("(+ 1 2)") == ["+", 1, 2]

    def test_parse_nested(self):
        assert read("(+ (* 2 3) 4)") == ["+", ["*", 2, 3], 4]


class TestArithmetic:
    def test_add(self):
        vm = LispyVM()
        assert vm.run("(+ 1 2)") == 3

    def test_subtract(self):
        vm = LispyVM()
        assert vm.run("(- 10 3)") == 7

    def test_multiply(self):
        vm = LispyVM()
        assert vm.run("(* 4 5)") == 20

    def test_divide(self):
        vm = LispyVM()
        assert vm.run("(/ 10 2)") == 5

    def test_nested(self):
        vm = LispyVM()
        assert vm.run("(+ (* 2 3) (- 10 5))") == 11

    def test_divide_by_zero(self):
        vm = LispyVM()
        assert vm.run("(/ 10 0)") == 0  # Safe: returns 0


class TestControlFlow:
    def test_if_true(self):
        vm = LispyVM()
        assert vm.run("(if (> 5 3) 1 0)") == 1

    def test_if_false(self):
        vm = LispyVM()
        assert vm.run("(if (< 5 3) 1 0)") == 0

    def test_cond(self):
        vm = LispyVM()
        vm.set_env("x", 15)
        result = vm.run("(cond ((< x 10) 1) ((< x 20) 2) (true 3))")
        assert result == 2


class TestVariables:
    def test_define(self):
        vm = LispyVM()
        vm.run("(define x 42)")
        assert vm.get_env("x") == 42

    def test_set(self):
        vm = LispyVM()
        vm.set_env("x", 10)
        vm.run("(set! x 20)")
        assert vm.get_env("x") == 20

    def test_begin(self):
        vm = LispyVM()
        result = vm.run("(begin (define a 1) (define b 2) (+ a b))")
        assert result == 3


class TestLambda:
    def test_lambda(self):
        vm = LispyVM()
        vm.run("(define square (lambda (x) (* x x)))")
        assert vm.run("(square 5)") == 25

    def test_closure(self):
        vm = LispyVM()
        vm.run("(define make-adder (lambda (n) (lambda (x) (+ x n))))")
        vm.run("(define add5 (make-adder 5))")
        assert vm.run("(add5 10)") == 15


class TestSafety:
    def test_execution_limit(self):
        vm = LispyVM()
        vm.MAX_STEPS = 100
        # This should hit the limit
        with raises(LispyError, match="limit"):
            vm.run("(begin " + "(+ 1 1) " * 200 + ")")

    def test_undefined_variable(self):
        vm = LispyVM()
        with raises(LispyError, match="Undefined"):
            vm.run("nonexistent")


class TestColonyIntegration:
    def test_load_colony_state(self):
        vm = LispyVM()
        vm.load_colony_state({
            "o2_days": 15.0,
            "h2o_days": 20.0,
            "food_days": 8.0,
            "power_kwh": 300.0,
            "interior_temp_k": 293.15,
        })
        assert vm.get_env("o2_days") == 15.0
        assert vm.get_env("food_days") == 8.0

    def test_basic_governor_program(self):
        vm = LispyVM()
        vm.load_colony_state({
            "o2_days": 3.0, "h2o_days": 5.0,
            "food_days": 20.0, "power_kwh": 200.0,
        })
        vm.set_env("heating_alloc", 0.25)
        vm.set_env("isru_alloc", 0.40)
        vm.set_env("greenhouse_alloc", 0.35)
        vm.set_env("food_ration", 1.0)
        vm.run(CONTROL_PROGRAMS["basic_governor"])
        alloc = vm.get_allocation()
        assert alloc["isru"] == 0.70  # Crisis mode: heavy ISRU

    def test_adaptive_governor(self):
        vm = LispyVM()
        vm.load_colony_state({
            "o2_days": 3.0, "h2o_days": 10.0,
            "food_days": 15.0, "power_kwh": 200.0,
        })
        vm.set_env("heating_alloc", 0.25)
        vm.set_env("isru_alloc", 0.40)
        vm.set_env("greenhouse_alloc", 0.35)
        vm.set_env("food_ration", 1.0)
        vm.run(CONTROL_PROGRAMS["adaptive_governor"])
        alloc = vm.get_allocation()
        assert alloc["isru"] == 0.80  # O2 urgent

    def test_thermal_monitor(self):
        vm = LispyVM()
        vm.set_env("interior_temp_k", 270.0)  # -3°C — too cold
        vm.set_env("heating_alloc", 0.25)
        vm.run(CONTROL_PROGRAMS["thermal_monitor"])
        assert vm.get_env("heating_alloc") == 0.50
        assert "Boosting heat" in vm.output[0]

    def test_print_output(self):
        vm = LispyVM()
        vm.run('(print "hello mars")')
        assert vm.output == ["hello mars"]
