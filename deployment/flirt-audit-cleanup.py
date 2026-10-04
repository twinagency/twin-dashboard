#!/usr/bin/env python3
"""Run the identified disposable cleanup with the existing isolated runtime runner."""
import importlib.util
from pathlib import Path
root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("runner", root / "flirt-optional-live-check.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
runner.main("flirt-audit-cleanup.cjs")
