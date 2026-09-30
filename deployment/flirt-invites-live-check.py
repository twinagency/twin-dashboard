#!/usr/bin/env python3
"""Verify invitation/signup/review using the existing protected FLIRT runner."""
import importlib.util
from pathlib import Path
import sys
spec = importlib.util.spec_from_file_location("live_check", Path(__file__).with_name("flirt-optional-live-check.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
if __name__ == "__main__":
    try:
        runner.main("flirt-invites-live-check.cjs")
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
