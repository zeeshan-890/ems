#!/usr/bin/env python3
"""
Utility to read and analyze sensor_full_raw_data.jsonl logs from the backend.

Usage:
    python analyze_sensor_logs.py                    # Show all batches summary
    python analyze_sensor_logs.py --patient <id>     # Filter by patient
    python analyze_sensor_logs.py --session <id>     # Filter by session
    python analyze_sensor_logs.py --export csv       # Export to CSV
    python analyze_sensor_logs.py --stat             # Show statistics
"""

from __future__ import annotations

import json
import argparse
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import numpy as np


def load_sensor_logs(log_path: Path) -> list[dict]:
    """Load all sensor data batches from JSONL file."""
    batches = []
    if not log_path.exists():
        print(f"Log file not found: {log_path}", file=sys.stderr)
        return batches

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    batches.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"Warning: Failed to parse line {line_num}: {e}", file=sys.stderr)
    except IOError as e:
        print(f"Error reading log file: {e}", file=sys.stderr)

    return batches


def filter_batches(
    batches: list[dict],
    patient_id: str | None = None,
    session_id: str | None = None,
    device_id: str | None = None,
) -> list[dict]:
    """Filter batches by patient/session/device ID."""
    filtered = batches
    if patient_id:
        filtered = [b for b in filtered if b.get("patient_id") == patient_id]
    if session_id:
        filtered = [b for b in filtered if b.get("session_id") == session_id]
    if device_id:
        filtered = [b for b in filtered if b.get("device_id") == device_id]
    return filtered


def print_summary(batches: list[dict]) -> None:
    """Print summary of all batches."""
    if not batches:
        print("No batches found")
        return

    print(f"\n{'─' * 80}")
    print(f"Sensor Data Summary: {len(batches)} batches")
    print(f"{'─' * 80}\n")

    # Group by patient
    by_patient = defaultdict(list)
    for batch in batches:
        by_patient[batch.get("patient_id", "unknown")].append(batch)

    total_samples = 0
    for patient_id in sorted(by_patient.keys()):
        patient_batches = by_patient[patient_id]
        n_batches = len(patient_batches)
        n_samples = sum(b.get("n_samples", 0) for b in patient_batches)
        total_samples += n_samples

        # Get time range
        timestamps = [b.get("server_timestamp") for b in patient_batches]
        timestamps = [t for t in timestamps if t]
        if timestamps:
            timestamps.sort()
            start_time = timestamps[0]
            end_time = timestamps[-1]
            print(f"Patient: {patient_id}")
            print(f"  Batches: {n_batches}, Samples: {n_samples}")
            print(f"  Time range: {start_time} → {end_time}")
        else:
            print(f"Patient: {patient_id}")
            print(f"  Batches: {n_batches}, Samples: {n_samples}")
        print()

    print(f"Total samples across all batches: {total_samples}")
    print(f"{'─' * 80}\n")


def print_batch_details(batches: list[dict], limit: int = 5) -> None:
    """Print detailed view of batches."""
    if not batches:
        print("No batches found")
        return

    for batch_idx, batch in enumerate(batches[:limit]):
        print(f"\n{'─' * 80}")
        print(f"Batch #{batch_idx + 1}")
        print(f"{'─' * 80}")
        print(f"Batch ID:       {batch.get('batch_id')}")
        print(f"Patient ID:     {batch.get('patient_id')}")
        print(f"Session ID:     {batch.get('session_id')}")
        print(f"Device ID:      {batch.get('device_id')}")
        print(f"Timestamp:      {batch.get('server_timestamp')}")
        print(f"Sample count:   {batch.get('n_samples')}")

        metadata = batch.get("batch_metadata", {})
        if metadata:
            print(f"Metadata:")
            print(f"  Source: {metadata.get('source')}")
            print(f"  Sampling rate: {metadata.get('sampling_rate_hz')} Hz")
            print(f"  Battery level: {metadata.get('battery_level')}")

        # Show first few samples
        samples = batch.get("samples", [])
        if samples:
            print(f"\nFirst 3 samples:")
            for i, sample in enumerate(samples[:3]):
                print(f"\n  Sample {i}:")
                print(f"    Timestamp: {sample.get('timestamp_ms')} ms")
                print(f"    Accel: ({sample.get('acc_x'):.4f}, {sample.get('acc_y'):.4f}, {sample.get('acc_z'):.4f}) m/s²")
                print(f"    Gyro:  ({sample.get('gyro_x'):.4f}, {sample.get('gyro_y'):.4f}, {sample.get('gyro_z'):.4f}) rad/s")
                if "azimuth" in sample:
                    print(f"    Orient: azimuth={sample.get('azimuth'):.2f}°, pitch={sample.get('pitch'):.2f}°, roll={sample.get('roll'):.2f}°")


def compute_statistics(batches: list[dict]) -> None:
    """Compute and display statistics across all samples."""
    if not batches:
        print("No batches found")
        return

    # Collect all samples
    all_acc = {"x": [], "y": [], "z": []}
    all_gyro = {"x": [], "y": [], "z": []}
    all_ori = {"azimuth": [], "pitch": [], "roll": []}

    for batch in batches:
        for sample in batch.get("samples", []):
            all_acc["x"].append(float(sample.get("acc_x", 0)))
            all_acc["y"].append(float(sample.get("acc_y", 0)))
            all_acc["z"].append(float(sample.get("acc_z", 0)))

            all_gyro["x"].append(float(sample.get("gyro_x", 0)))
            all_gyro["y"].append(float(sample.get("gyro_y", 0)))
            all_gyro["z"].append(float(sample.get("gyro_z", 0)))

            if "azimuth" in sample:
                all_ori["azimuth"].append(float(sample.get("azimuth")))
                all_ori["pitch"].append(float(sample.get("pitch")))
                all_ori["roll"].append(float(sample.get("roll")))

    print(f"\n{'─' * 80}")
    print("Sensor Statistics")
    print(f"{'─' * 80}\n")

    if all_acc["x"]:
        print("Accelerometer (m/s²):")
        for axis in ["x", "y", "z"]:
            values = all_acc[axis]
            print(f"  {axis}: mean={np.mean(values):.4f}, std={np.std(values):.4f}, "
                  f"min={min(values):.4f}, max={max(values):.4f}")

    if all_gyro["x"]:
        print("\nGyroscope (rad/s):")
        for axis in ["x", "y", "z"]:
            values = all_gyro[axis]
            print(f"  {axis}: mean={np.mean(values):.4f}, std={np.std(values):.4f}, "
                  f"min={min(values):.4f}, max={max(values):.4f}")

    if all_ori["azimuth"]:
        print("\nOrientation (degrees):")
        for axis in ["azimuth", "pitch", "roll"]:
            values = all_ori[axis]
            print(f"  {axis}: mean={np.mean(values):.2f}, std={np.std(values):.2f}, "
                  f"min={min(values):.2f}, max={max(values):.2f}")

    print(f"\nTotal samples: {len(all_acc['x'])}")
    print(f"{'─' * 80}\n")


def export_to_csv(batches: list[dict], output_file: Path | None = None) -> None:
    """Export sensor data to CSV format."""
    if not batches:
        print("No batches found")
        return

    if output_file is None:
        output_file = Path("sensor_data_export.csv")

    try:
        with open(output_file, "w", encoding="utf-8") as f:
            # Write header
            f.write("batch_id,patient_id,session_id,device_id,timestamp,sample_index,"
                   "timestamp_ms,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,"
                   "azimuth,pitch,roll\n")

            # Write data
            for batch in batches:
                batch_id = batch.get("batch_id")
                patient_id = batch.get("patient_id")
                session_id = batch.get("session_id")
                device_id = batch.get("device_id")
                server_ts = batch.get("server_timestamp")

                for sample in batch.get("samples", []):
                    f.write(f"{batch_id},{patient_id},{session_id},{device_id},"
                           f"{server_ts},{sample.get('sample_index')},"
                           f"{sample.get('timestamp_ms')},"
                           f"{sample.get('acc_x')},{sample.get('acc_y')},{sample.get('acc_z')},"
                           f"{sample.get('gyro_x')},{sample.get('gyro_y')},{sample.get('gyro_z')},"
                           f"{sample.get('azimuth', '')},{sample.get('pitch', '')},{sample.get('roll', '')}\n")

        print(f"✓ Exported {sum(len(b.get('samples', [])) for b in batches)} samples to {output_file}")
    except IOError as e:
        print(f"Error writing CSV: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze sensor_full_raw_data.jsonl logs from EMS backend"
    )
    parser.add_argument(
        "--log-file",
        type=Path,
        default=Path(__file__).parent.parent / "flask_backend" / "logs" / "sensor_full_raw_data.jsonl",
        help="Path to sensor_full_raw_data.jsonl file",
    )
    parser.add_argument("--patient", type=str, help="Filter by patient ID")
    parser.add_argument("--session", type=str, help="Filter by session ID")
    parser.add_argument("--device", type=str, help="Filter by device ID")
    parser.add_argument(
        "--stat", action="store_true", help="Show statistics across all samples"
    )
    parser.add_argument(
        "--export", type=str, help="Export to CSV (specify output file or 'auto')"
    )
    parser.add_argument(
        "--detail", action="store_true", help="Show detailed batch information"
    )

    args = parser.parse_args()

    # Load logs
    batches = load_sensor_logs(args.log_file)
    batches = filter_batches(batches, args.patient, args.session, args.device)

    if not batches:
        print("No batches found matching the filters")
        return

    # Handle operations
    if args.stat:
        compute_statistics(batches)
    elif args.export:
        output_file = None if args.export == "auto" else Path(args.export)
        export_to_csv(batches, output_file)
    elif args.detail:
        print_batch_details(batches)
    else:
        print_summary(batches)


if __name__ == "__main__":
    main()
