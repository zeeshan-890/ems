# Console Sensor Logging

## Overview

In addition to file logging (`sensor_full_raw_data.jsonl`), you can now see sensor data logged to the console in real-time as batches arrive. This is helpful for:

- **Live monitoring** during development/testing
- **Quick diagnostics** without accessing log files
- **Real-time validation** of sensor data quality
- **Debugging** sensor issues immediately

## What Gets Logged to Console

For each sensor batch, the console displays:

### Header Information
- Batch ID (first 8 chars)
- Patient ID
- Session ID (first 8 chars)
- Sample count
- Server timestamp

### Accelerometer Statistics (m/s²)
- Per-axis: mean ± std / min..max
- Magnitude: mean ± std / min..max

### Gyroscope Statistics (rad/s)
- Per-axis: mean ± std / min..max  
- Magnitude: mean ± std / min..max

### Orientation Statistics (degrees)
- Azimuth: mean ± std / min..max
- Pitch: mean ± std / min..max
- Roll: mean ± std / min..max
- Coverage (how many samples had orientation)

### Sample Preview
First 2 samples showing raw (acc_x, acc_y, acc_z) and (gyro_x, gyro_y, gyro_z) values

## Example Output

```
─────────────────────────────────────────────────────────────────────────────────
🔹 SENSOR BATCH  │  batch=a1b2c3d4  │  patient=elderly_001
   session=sess789  │  samples=51  │  2025-05-25T14:32:15.123Z
─────────────────────────────────────────────────────────────────────────────────
  ACCELEROMETER (m/s²)  [mean ± std / min..max]
    X: +0.123±0.456  /  -1.234 .. +2.345
    Y: -0.567±0.234  /  -1.567 .. +1.234
    Z: +9.876±0.123  /  +9.654 .. +10.123
  |ACC|: +9.881±0.134  /  +9.654 .. +10.156

  GYROSCOPE (rad/s)  [mean ± std / min..max]
    X: +0.00123±0.00456  /  -0.01234 .. +0.02345
    Y: -0.00567±0.00234  /  -0.01567 .. +0.01234
    Z: +0.00876±0.00123  /  +0.00654 .. +0.01123
  |GYR|: +0.00981±0.00134  /  +0.00654 .. +0.01156

  ORIENTATION (degrees)  [51/51 samples]
    Azimuth: 123.45±12.34  /   45.67 .. 234.56
    Pitch:   -12.34± 5.67  /  -45.67 .. +23.45
    Roll:     34.56±15.23  /  -67.89 .. +78.90

  SAMPLE DATA (first 2 of 51)
    Sample 0: acc=(+0.123, -0.567, +9.876)  gyro=(+0.00123, -0.00567, +0.00876)
    Sample 1: acc=(+0.234, -0.678, +9.765)  gyro=(+0.00234, -0.00678, +0.00987)
─────────────────────────────────────────────────────────────────────────────────
```

## Configuration

### Enable Console Logging (Default)

```bash
export EMS_LOG_SENSOR_CONSOLE=1
```

Or start the backend with:
```bash
EMS_LOG_SENSOR_CONSOLE=1 uvicorn flask_backend.app.main:app
```

### Disable Console Logging

```bash
export EMS_LOG_SENSOR_CONSOLE=0
```

Valid values: `1`, `true`, `yes`, `on` (case-insensitive)

## Independent Logging Controls

Console logging and other logging features are independent:

```bash
# Console logging OFF, debug logging ON
EMS_LOG_SENSOR_CONSOLE=0 EMS_DEBUG_SENSOR_LOGS=1 uvicorn ...

# Console logging ON, debug logging OFF
EMS_LOG_SENSOR_CONSOLE=1 EMS_DEBUG_SENSOR_LOGS=0 uvicorn ...

# Both ON (most verbose)
EMS_LOG_SENSOR_CONSOLE=1 EMS_DEBUG_SENSOR_LOGS=1 uvicorn ...

# Both OFF (minimal output)
EMS_LOG_SENSOR_CONSOLE=0 EMS_DEBUG_SENSOR_LOGS=0 uvicorn ...
```

## Use Cases

### 1. Live Monitoring During Development
```bash
# Start backend with console logging
EMS_LOG_SENSOR_CONSOLE=1 uvicorn flask_backend.app.main:app --reload

# See sensor data in real-time as mobile app sends it
```

### 2. Quick Sensor Health Check
Watch the console output to verify:
- ✅ Accelerometer is within gravity ± variation (should be ~9.8 m/s² on Z)
- ✅ Gyroscope is stable (low values unless device is rotating)
- ✅ Orientation data is present and varying smoothly
- ✅ All sensors are active (non-zero std dev)

### 3. Debugging Sudden Issues
If sensor data suddenly looks wrong:
- Console logs show it immediately
- You can cross-reference with inference results
- Easy to spot noise, drops, or hardware issues

### 4. Production Monitoring
For production servers:
- Set `EMS_LOG_SENSOR_CONSOLE=0` to reduce output
- File logging (`sensor_full_raw_data.jsonl`) continues regardless
- Use analysis scripts for deeper investigation

## Performance Notes

- **Minimal overhead**: Statistics calculation runs only once per batch
- **Buffered output**: Uses `flush=True` to ensure immediate visibility
- **No blocking**: If console write is slow, doesn't affect API
- **Configurable**: Easy to disable in production if needed

## Integration with Other Features

Console logging works alongside:
- ✅ File logging (`sensor_full_raw_data.jsonl`) - always happens
- ✅ Diagnostic logging (`sensor_diag.jsonl`) - always happens
- ✅ Debug logging (via `EMS_DEBUG_SENSOR_LOGS`) - independent toggle
- ✅ Analysis scripts - work with file logs

## Troubleshooting

### No Console Output
1. Check `EMS_LOG_SENSOR_CONSOLE` is not set to `0`
2. Verify sensor data is being sent (`/api/v1/ingest/live` called)
3. Check backend is running with the configuration
4. Ensure backend stdout is not redirected

### Too Much Output
1. Set `EMS_LOG_SENSOR_CONSOLE=0` to disable
2. Set `EMS_DEBUG_SENSOR_LOGS=0` to reduce other debug output
3. Use log rotation for file logs

### Missing Orientation Data
If `ORIENTATION` section shows `[0/51 samples]`:
- Mobile app not sending orientation data
- Check if device has magnetometer/compass
- Verify app configuration for orientation sensor usage

## Environment Variable Summary

| Variable | Default | Purpose |
|----------|---------|---------|
| `EMS_LOG_SENSOR_CONSOLE` | `1` | Log sensor data to console |
| `EMS_DEBUG_SENSOR_LOGS` | `1` | Log additional debug info |
| `EMS_DIAG_DIR` | `./logs` | Where to write log files |

## See Also

- [SENSOR_LOGGING.md](SENSOR_LOGGING.md) - Complete file logging documentation
- `scripts/analyze_sensor_logs.py` - Analysis tools for log files
- `flask_backend/app/monitoring_routes.py` - Implementation details
