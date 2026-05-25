# Sensor Data Logging Documentation

## Overview

The EMS backend now logs **complete raw sensor data** from mobile devices in addition to the existing diagnostic statistics. This enables detailed analysis of accelerometer, gyroscope, and orientation data for debugging, research, and validation.

## What Gets Logged

### Full Raw Sensor Data (`sensor_full_raw_data.jsonl`)

Every sensor batch ingested via `/api/v1/ingest/live` is logged with:

- **Batch metadata**: patient_id, session_id, device_id, timestamp, sample count
- **Source information**: device source, sampling rate, battery level
- **Complete sample data**: For each of the 50+ samples in a batch:
  - Accelerometer (x, y, z) in m/s²
  - Gyroscope (x, y, z) in rad/s
  - Orientation (azimuth, pitch, roll) in degrees (if available)
  - Device timestamp in milliseconds

### Diagnostic Summary (`sensor_diag.jsonl`)

Aggregated statistics (already existing):
- Mean/min/max per axis for accelerometer and gyroscope
- Aggregate magnitude values
- Orientation coverage percentage

## Log File Locations

```
flask_backend/logs/
├── sensor_full_raw_data.jsonl    ← Full raw sensor data (NEW)
└── sensor_diag.jsonl              ← Diagnostic statistics (existing)
```

## Enabling/Disabling Logging

### Full Raw Data Logging
Always enabled by default. Cannot be disabled at runtime (logs are written with error handling so they never crash the API).

### Debug Console Logging
Control detailed console output with the `EMS_DEBUG_SENSOR_LOGS` environment variable:

```bash
# Enable (default)
export EMS_DEBUG_SENSOR_LOGS=1

# Disable
export EMS_DEBUG_SENSOR_LOGS=0
```

When enabled, each sensor batch will print:
- Sensor preview (first few rows of acc/gyro/ori windows)
- Feature vector preview (first 8 values of 144-D features)
- Confirmation that full raw data was logged

## Log Format

### sensor_full_raw_data.jsonl

Each line is a complete JSON object representing one batch:

```json
{
  "batch_id": "abc123def456...",
  "server_timestamp": "2025-05-25T14:32:15.123Z",
  "patient_id": "patient_123",
  "session_id": "session_456",
  "device_id": "device_789",
  "n_samples": 51,
  "batch_metadata": {
    "source": "flutter_mobile",
    "sampling_rate_hz": 50.0,
    "acceleration_unit": "m_s2",
    "gyroscope_unit": "rad_s",
    "battery_level": 85.5
  },
  "samples": [
    {
      "sample_index": 0,
      "timestamp_ms": 1716640335123,
      "acc_x": 0.1234,
      "acc_y": -0.5678,
      "acc_z": 9.8765,
      "gyro_x": 0.0012,
      "gyro_y": -0.0034,
      "gyro_z": 0.0056,
      "azimuth": 45.67,
      "pitch": -12.34,
      "roll": 5.67
    },
    ...51 samples total...
  ]
}
```

## Analyzing Sensor Data

### Using the Analysis Script

The included `scripts/analyze_sensor_logs.py` provides multiple analysis modes:

#### Summary View (default)
```bash
python scripts/analyze_sensor_logs.py
```

Shows:
- Number of batches per patient
- Total samples collected
- Time range for each patient

#### Detailed View
```bash
python scripts/analyze_sensor_logs.py --detail
```

Shows:
- Full batch metadata
- First 3 samples from each batch
- Detailed sensor values

#### Statistics
```bash
python scripts/analyze_sensor_logs.py --stat
```

Computes across all samples:
- Mean/std/min/max for accelerometer per axis
- Mean/std/min/max for gyroscope per axis
- Mean/std/min/max for orientation per axis
- Total sample count

#### Filtering
```bash
# By patient
python scripts/analyze_sensor_logs.py --patient patient_id_123

# By session
python scripts/analyze_sensor_logs.py --session session_id_456

# By device
python scripts/analyze_sensor_logs.py --device device_id_789

# Combination
python scripts/analyze_sensor_logs.py --patient patient_123 --session session_456 --stat
```

#### Export to CSV
```bash
# Auto-generate filename (sensor_data_export.csv)
python scripts/analyze_sensor_logs.py --export auto

# Custom filename
python scripts/analyze_sensor_logs.py --export my_sensor_data.csv

# With filtering
python scripts/analyze_sensor_logs.py --patient patient_123 --export patient_123_data.csv
```

### Manual Log Review

Since logs are JSONL (one JSON per line), you can process them with standard tools:

```bash
# Count batches
wc -l flask_backend/logs/sensor_full_raw_data.jsonl

# View first batch
head -1 flask_backend/logs/sensor_full_raw_data.jsonl | jq .

# Filter by patient (requires jq)
cat flask_backend/logs/sensor_full_raw_data.jsonl | jq 'select(.patient_id == "patient_123")'

# Extract sample counts
cat flask_backend/logs/sensor_full_raw_data.jsonl | jq '.n_samples' | paste -sd+ | bc
```

### Python Integration

Load and analyze logs programmatically:

```python
import json
from pathlib import Path

log_file = Path("flask_backend/logs/sensor_full_raw_data.jsonl")

with open(log_file) as f:
    for line in f:
        batch = json.loads(line)
        patient_id = batch["patient_id"]
        samples = batch["samples"]
        
        # Process each sample
        for sample in samples:
            acc_x = sample["acc_x"]
            acc_y = sample["acc_y"]
            acc_z = sample["acc_z"]
            # ... your analysis ...
```

## Performance Considerations

- **I/O Impact**: Minimal. Writes are async and non-blocking (errors are caught).
- **File Size**: ~1KB per batch (50-100 samples). Expect 1-10MB per patient per monitoring session.
- **Archival**: Consider rotating/compressing logs after data analysis is complete.

## Use Cases

### 1. Fall Detection Validation
Export data from confirmed fall incidents and verify sensor signatures:
```bash
python scripts/analyze_sensor_logs.py --session fall_session_id --export --stat
```

### 2. Baseline Normality Checking
Monitor sensor ranges during normal ADL to detect anomalies:
```bash
python scripts/analyze_sensor_logs.py --patient patient_id --stat
```

### 3. Model Debugging
When inference produces unexpected results, inspect raw sensor values:
```bash
# Export full data and load into ML analysis notebook
python scripts/analyze_sensor_logs.py --patient patient_id --export auto
```

### 4. Device Validation
Compare sensor quality between devices:
```bash
python scripts/analyze_sensor_logs.py --device device_1 --stat
python scripts/analyze_sensor_logs.py --device device_2 --stat
```

### 5. Data Export for Research
Prepare sanitized datasets for external analysis:
```bash
python scripts/analyze_sensor_logs.py --export research_dataset.csv
# Then manually remove PII before sharing
```

## Integration with Existing Code

### Backend Changes
- Added `_log_full_sensor_data()` function in `monitoring_routes.py`
- Integrated into `/api/v1/ingest/live` endpoint
- No changes to API contracts or response schemas
- Non-blocking: failures don't affect normal operation

### Frontend (No Changes Required)
- Mobile app continues to send sensor data normally
- No modifications needed to Flutter or web frontends

## Troubleshooting

### Logs Not Appearing
1. Check if `EMS_DIAG_DIR` environment variable is set
2. Verify `flask_backend/logs/` directory exists and is writable
3. Check backend logs for write errors
4. Ensure sensor data is actually being ingested (`/api/v1/ingest/live` called)

### Large Log Files
If files grow too large:
```bash
# Archive old logs
gzip flask_backend/logs/sensor_full_raw_data.jsonl

# Or truncate (careful - deletes history)
> flask_backend/logs/sensor_full_raw_data.jsonl
```

### Log File Corruption
If a batch JSON is malformed (rare), the analysis script will warn but continue:
```
Warning: Failed to parse line 1234: ...
```

The rest of the file remains readable.

## Future Enhancements

Potential additions:
- Automatic log rotation (daily/weekly files)
- Compression (.jsonl.gz)
- Real-time streaming API for live analysis
- Dashboard visualizations of sensor trends
- Anomaly detection alerts
