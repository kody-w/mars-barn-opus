from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_frames.py"


class TestFrameGenerator(unittest.TestCase):
    def run_generator(self, frames_dir: Path, *args: str, check: bool = True):
        return subprocess.run(
            [
                sys.executable,
                str(GENERATOR),
                "--frames-dir",
                str(frames_dir),
                *args,
            ],
            check=check,
            capture_output=True,
            text=True,
        )

    def test_generation_is_batch_independent(self):
        with tempfile.TemporaryDirectory() as bulk_tmp, tempfile.TemporaryDirectory() as daily_tmp:
            bulk_dir = Path(bulk_tmp)
            daily_dir = Path(daily_tmp)

            self.run_generator(bulk_dir, "--count", "2")
            self.run_generator(daily_dir, "--count", "1")
            self.run_generator(daily_dir, "--count", "1")

            for sol in (1, 2):
                name = f"sol-{sol:04d}.json"
                self.assertEqual(
                    json.loads((bulk_dir / name).read_text()),
                    json.loads((daily_dir / name).read_text()),
                )

    def test_generated_frame_passes_twin_hash_gate(self):
        sys.path.insert(0, str(ROOT / "src"))
        from attestation import TwinVerificationGate, hash_frame

        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp)
            self.run_generator(frames_dir, "--count", "1")
            frame_path = frames_dir / "sol-0001.json"
            frame = json.loads(frame_path.read_text())
            self.assertEqual(frame["_hash"], hash_frame(frame)[:16])
            result = TwinVerificationGate(
                require_on_chain=False
            ).verify_frame(frame_path)
            self.assertTrue(result.valid, result.error)

    def test_existing_frame_requires_reconciliation(self):
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp)
            self.run_generator(frames_dir, "--count", "3")

            manifest_path = frames_dir / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["frames"] = manifest["frames"][:2]
            manifest["total_frames"] = 2
            manifest["last_sol"] = 2
            manifest_path.write_text(json.dumps(manifest, indent=2))
            original_third_frame = (frames_dir / "sol-0003.json").read_bytes()

            failed = self.run_generator(
                frames_dir,
                "--count",
                "1",
                check=False,
            )

            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("does not match frame files", failed.stderr)
            self.assertEqual(
                (frames_dir / "sol-0003.json").read_bytes(),
                original_third_frame,
            )

            self.run_generator(frames_dir, "--reconcile")
            self.run_generator(frames_dir, "--check")
            reconciled = json.loads(manifest_path.read_text())
            self.assertEqual(reconciled["total_frames"], 3)
            self.assertEqual(reconciled["last_sol"], 3)

    def test_reconciliation_rejects_modified_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp)
            self.run_generator(frames_dir, "--count", "2")

            first_path = frames_dir / "sol-0001.json"
            first = json.loads(first_path.read_text())
            first["mars"]["temp_k"] += 1
            first_path.write_text(json.dumps(first, indent=2))

            append_failed = self.run_generator(
                frames_dir,
                "--count",
                "1",
                check=False,
            )
            self.assertNotEqual(append_failed.returncode, 0)
            self.assertFalse((frames_dir / "sol-0003.json").exists())

            failed = self.run_generator(
                frames_dir,
                "--reconcile",
                check=False,
            )

            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("modified historical frame Sol 1", failed.stderr)

    def test_reconciliation_rejects_truncated_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp)
            self.run_generator(frames_dir, "--count", "2")
            (frames_dir / "sol-0002.json").unlink()

            failed = self.run_generator(
                frames_dir,
                "--reconcile",
                check=False,
            )

            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("missing Sol 2", failed.stderr)
            manifest = json.loads((frames_dir / "manifest.json").read_text())
            self.assertEqual(manifest["last_sol"], 2)

    def test_bundle_normalizes_versioned_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp)
            frame = {
                "sol": 1,
                "version": 12,
                "environment": {
                    "temperature_k": 225.8,
                    "pressure_pa": 571.1,
                    "solar_irradiance": 606.7,
                    "dust_storm": True,
                    "wind_speed_ms": 18.8,
                    "solar_longitude": 202.9,
                    "season": "Northern Autumn",
                },
                "events": [],
                "hazards": [],
            }
            (frames_dir / "sol-0001.json").write_text(
                json.dumps(frame, indent=2)
            )

            self.run_generator(frames_dir, "--reconcile")
            self.run_generator(frames_dir, "--check")
            bundle = json.loads((frames_dir / "frames.json").read_text())
            mars = bundle["frames"]["1"]["mars"]

            self.assertAlmostEqual(mars["temp_c"], -47.35, places=2)
            self.assertEqual(mars["dust_tau"], 0.8)
            self.assertEqual(mars["solar_wm2"], 606.7)
            self.assertEqual(mars["wind_ms"], 18.8)

    def test_reconciliation_rejects_invalid_frame_semantics(self):
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp)
            invalid = {
                "sol": 1,
                "version": 12,
                "environment": {
                    "pressure_pa": 571.1,
                    "solar_irradiance": 606.7,
                },
                "events": [],
                "hazards": [],
            }
            (frames_dir / "sol-0001.json").write_text(
                json.dumps(invalid, indent=2)
            )

            failed = self.run_generator(
                frames_dir,
                "--reconcile",
                check=False,
            )

            self.assertNotEqual(failed.returncode, 0)
            self.assertIn(
                "Sol 1 missing environment.temperature_k",
                failed.stderr,
            )


if __name__ == "__main__":
    unittest.main()
