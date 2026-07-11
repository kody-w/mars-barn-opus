#!/usr/bin/env python3
"""Run the repository's function-style tests with the Python standard library."""
from __future__ import annotations

import importlib.util
import inspect
from pathlib import Path
import sys
import traceback
import unittest


ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = ROOT / "tests"


def load_module(path: Path):
    name = f"_mars_test_{path.stem}"
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def discover_tests(module):
    for name, value in inspect.getmembers(module):
        if inspect.isfunction(value) and name.startswith("test_"):
            yield f"{module.__name__}.{name}", value
        elif inspect.isclass(value) and name.startswith("Test"):
            for method_name, method in inspect.getmembers(
                value,
                inspect.isfunction,
            ):
                if not method_name.startswith("test_"):
                    continue

                def invoke(cls=value, selected=method_name):
                    instance = cls()
                    getattr(instance, selected)()

                yield f"{module.__name__}.{name}.{method_name}", invoke


def requested_tests(arguments):
    if not arguments:
        return [(path, None) for path in sorted(TESTS_DIR.glob("test_*.py"))]

    requests = []
    for argument in arguments:
        parts = argument.split("::")
        path = Path(parts[0])
        if not path.is_absolute():
            path = ROOT / path
        if not path.is_file() or path.parent != TESTS_DIR:
            raise ValueError(f"Unsupported test path: {parts[0]}")
        target = ".".join(parts[1:]) or None
        requests.append((path, target))
    return requests


def main(arguments=None):
    failures = []
    total = 0
    try:
        requests = requested_tests(arguments or [])
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2

    for path, target in requests:
        module = load_module(path)
        for test_name, test in discover_tests(module):
            short_name = test_name.removeprefix(f"{module.__name__}.")
            if target and short_name != target:
                continue
            total += 1
            try:
                test()
            except unittest.SkipTest:
                continue
            except Exception:
                failures.append((test_name, traceback.format_exc()))

    if failures:
        for test_name, failure in failures:
            print(f"\nFAIL: {test_name}\n{failure}", file=sys.stderr)
        print(
            f"\n{len(failures)} failed, {total - len(failures)} passed",
            file=sys.stderr,
        )
        return 1

    if total == 0:
        print("No tests matched", file=sys.stderr)
        return 2

    print(f"{total} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
