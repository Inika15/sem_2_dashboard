"""
Voltage Logger via PySerial
Reads voltage data from a serial port and saves it to data.csv

Requirements:
    pip install pyserial

Usage:
    1. Update PORT and BAUD_RATE to match your device
    2. Run: python voltage_logger.py
    3. Press Ctrl+C to stop — data is saved to data.csv
"""

import serial
import csv
import time
from datetime import datetime

# ── Configuration ─────────────────────────────────────────────
PORT      = "COM3"       # Windows: "COM3", "COM4", etc.
                         # Mac/Linux: "/dev/ttyUSB0", "/dev/ttyACM0"
BAUD_RATE = 9600         # Must match your device's baud rate
TIMEOUT   = 1            # Serial read timeout in seconds
CSV_FILE  = "data.csv"
# ──────────────────────────────────────────────────────────────


def parse_voltage(raw_line: str) -> float | None:
    """
    Parse a voltage value from a raw serial line.

    Handles these common formats:
        "3.14"          → 3.14
        "3.14V"         → 3.14
        "Voltage:3.14"  → 3.14
        "V=3.14"        → 3.14

    Returns None if parsing fails.
    """
    line = raw_line.strip().upper()

    # Strip common prefixes/suffixes
    for prefix in ("VOLTAGE:", "V=", "VOLT:", "ADC:"):
        if line.startswith(prefix):
            line = line[len(prefix):]

    line = line.rstrip("V").strip()

    try:
        return float(line)
    except ValueError:
        return None


def main():
    print(f"Opening serial port {PORT} at {BAUD_RATE} baud...")
    print(f"Saving data to '{CSV_FILE}'")
    print("Press Ctrl+C to stop.\n")

    try:
        ser = serial.Serial(PORT, BAUD_RATE, timeout=TIMEOUT)
        time.sleep(2)  # Wait for device to initialise (important for Arduino)
    except serial.SerialException as e:
        print(f"[ERROR] Could not open port {PORT}: {e}")
        print("Check that the port is correct and the device is connected.")
        return

    with open(CSV_FILE, mode="w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Timestamp", "Voltage (V)"])   # Header row

        row_count = 0
        try:
            while True:
                raw = ser.readline()

                if not raw:
                    continue  # Timeout — no data received

                try:
                    line = raw.decode("utf-8", errors="ignore").strip()
                except Exception:
                    continue

                if not line:
                    continue

                voltage = parse_voltage(line)

                if voltage is None:
                    print(f"[SKIP] Could not parse: {line!r}")
                    continue

                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                writer.writerow([timestamp, voltage])
                csv_file.flush()   # Write immediately so data isn't lost on Ctrl+C

                row_count += 1
                print(f"[{timestamp}]  Voltage = {voltage:.4f} V  (row {row_count})")

        except KeyboardInterrupt:
            print(f"\nStopped. {row_count} rows saved to '{CSV_FILE}'.")
        finally:
            ser.close()


if __name__ == "__main__":
    main()