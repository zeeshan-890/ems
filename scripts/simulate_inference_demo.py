#!/usr/bin/env python3
"""Simulated IMU windows → 128-D features → ``run_inference`` (same path as FastAPI ``ml_bridge``).

Requires Colab-exported pickles under ``flask_backend/models/baseline_adl&fall/``.

Usage (from ``ems/``):

  python scripts/simulate_inference_demo.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

os.environ.setdefault("REPO_ROOT", str(_REPO))

_SCRIPTS = _REPO / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from flask_backend.app.ml_bridge import build_enhanced_features_numpy  # noqa: E402
from inference.motion_pipeline import InferenceArtifacts, load_artifacts, run_inference  # noqa: E402

WINDOW = 128
FS = 50.0


def _quiet_standing() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(0)
    t = np.arange(WINDOW, dtype=np.float64) / FS
    acc = np.column_stack(
        [
            rng.normal(0.2, 0.15, WINDOW),
            rng.normal(-9.7, 0.2, WINDOW),
            rng.normal(0.0, 0.15, WINDOW),
        ]
    )
    gyro = rng.normal(0.0, 0.05, size=(WINDOW, 3))
    ori = np.column_stack(
        [
            np.full(WINDOW, 120.0 + 2.0 * np.sin(2 * np.pi * 0.2 * t)),
            np.full(WINDOW, 40.0),
            np.full(WINDOW, -50.0),
        ]
    )
    return acc, gyro, ori


def _walking_like() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(2)
    t = np.arange(WINDOW, dtype=np.float64) / FS
    pace = 2.0  # Hz-ish step modulation
    acc = np.column_stack(
        [
            0.3 + 0.4 * np.sin(2 * np.pi * pace * t) + rng.normal(0, 0.12, WINDOW),
            -9.6 + 0.35 * np.sin(2 * np.pi * pace * t + 0.5) + rng.normal(0, 0.12, WINDOW),
            0.2 * np.sin(2 * np.pi * pace * t + 1.0) + rng.normal(0, 0.1, WINDOW),
        ]
    )
    gyro = np.column_stack(
        [
            0.15 * np.sin(2 * np.pi * pace * t) + rng.normal(0, 0.08, WINDOW),
            0.12 * np.cos(2 * np.pi * pace * t) + rng.normal(0, 0.08, WINDOW),
            rng.normal(0, 0.06, WINDOW),
        ]
    )
    ori = np.column_stack(
        [
            np.full(WINDOW, 115.0),
            38.0 + 3.0 * np.sin(2 * np.pi * 0.1 * t),
            np.full(WINDOW, -48.0),
        ]
    )
    return acc, gyro, ori


def _fall_jerk() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(1)
    acc = rng.normal(0.0, 1.0, size=(WINDOW, 3))
    peak = slice(WINDOW // 2 - 5, WINDOW // 2 + 5)
    acc[peak, 0] += 18.0
    acc[peak, 1] -= 12.0
    acc[peak, 2] += 8.0
    gyro = rng.normal(0.0, 0.3, size=(WINDOW, 3))
    gyro[peak, :] += 5.0
    ori = np.column_stack(
        [
            np.linspace(0, 90, WINDOW),
            np.linspace(40, 80, WINDOW),
            np.linspace(-10, -70, WINDOW),
        ]
    )
    return acc, gyro, ori


def _zeros() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    z = np.zeros((WINDOW, 3), dtype=np.float64)
    return z, z, z


def main() -> int:
    models_dir = (_REPO / "flask_backend" / "models").resolve()
    manifest = models_dir / "inference_manifest.json"

    scenarios: list[tuple[str, tuple[np.ndarray, np.ndarray, np.ndarray]]] = [
        ("quiet_standing", _quiet_standing()),
        ("walking_like", _walking_like()),
        ("fall_jerk", _fall_jerk()),
        ("zeros", _zeros()),
    ]

    print("Simulated windows (128 samples x 3 axes @ ~50 Hz semantics)\n")

    try:
        art: InferenceArtifacts = load_artifacts(manifest, models_dir)
    except Exception as exc:
        print(f"Could not load artifacts: {exc}")
        print(f"\nPlace pickles next to manifest:\n  {models_dir / 'baseline_adl&fall'}\n")
        print("Synthetic window summaries (no model):")
        for name, (acc, gyro, ori) in scenarios:
            print(
                f"  [{name}] acc_mean={acc.mean(axis=0)} | gyro_rms={np.sqrt(np.mean(gyro**2)):.4f} | "
                f"feat_dim={build_enhanced_features_numpy(acc, gyro, ori).shape[0]}"
            )
        return 1

    print(
        f"Loaded: schema={art.manifest.get('schema_version')} "
        f"fall_binary={art.fall_binary_enabled} fall_type={art.fall_type_enabled} "
        f"thr={art.fall_threshold}\n"
    )

    for name, (acc, gyro, ori) in scenarios:
        feat = build_enhanced_features_numpy(acc, gyro, ori)
        vec = feat.tolist()
        out = run_inference(
            art,
            vec,
            None,
            predict_fall_type=False,
            acc_window=None,
            gyro_window=None,
            ori_window=None,
        )
        print(f"[{name}]")
        print(f"  feat L2={float(np.linalg.norm(feat)):.4f}  (dim={len(vec)})")
        print(
            f"  branch={out['branch']}  is_fall={out['is_fall']}  "
            f"p_fall={out['fall_probability']:.4f}"
        )
        if out["branch"] == "adl":
            print(f"  activity_label={out.get('activity_label')}")
        else:
            print(f"  fall_type skipped: {out.get('fall_type_skipped_reason')}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
