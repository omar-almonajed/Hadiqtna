# HADIQTNA ESP32 Firmware (PlatformIO + Arduino)

## 1. Electrical Compatibility & Ultrasonic Sensor Notes

The exact ultrasonic sensor model is configurable (`SENSOR_MODEL` in `include/config.h`):
- **`HC-SR04`**: Standard 5V ultrasonic module. Its `ECHO` pin outputs **5V**, while ESP32 GPIOs are strictly **3.3V tolerant**.
- **`JSN-SR04T`**: Waterproof outdoor ultrasonic module recommended for public park waste bins. It also typically runs on **5V** with a **5V ECHO** signal (depending on board revision) and has a **~20 cm minimum blind zone** (objects closer than 20 cm cannot be measured reliably).

### Mandatory 5V-to-3.3V Protection on ECHO Pin
Before connecting `ECHO` to ESP32 `GPIO 18`, step down the 5V ECHO output using a resistor voltage divider:
- Sensor `ECHO` -> `1 kΩ` resistor -> Node `A` -> `2 kΩ` resistor -> `GND`
- Connect Node `A` to ESP32 `GPIO 18` (`Vout = 5V * (2 / (1 + 2)) = 3.33V`).
(Alternatively, use a dedicated 5V-to-3.3V logic level shifter.)

## 2. Default Pinout (`include/config.h`)

| Component | ESP32 Pin | Notes |
|-----------|-----------|-------|
| Ultrasonic `TRIG` | `GPIO 5` | Output |
| Ultrasonic `ECHO` | `GPIO 18` | Input via 5V->3.3V divider |
| Green LED (0–49%) | `GPIO 25` | 220–330Ω series resistor to GND |
| Yellow LED (50–79%) | `GPIO 26` | 220–330Ω series resistor to GND |
| Red LED (80–100%) | `GPIO 27` | 220–330Ω series resistor to GND |

## 3. Secrets Setup (Do Not Commit!)
1. Copy `include/secrets.h.example` to `include/secrets.h`.
2. Provision a token in the web console (`/devices` -> Provision / Rotate Token).
3. Fill in `WIFI_SSID`, `WIFI_PASSWORD`, `DEVICE_ID`, `DEVICE_TOKEN`, and `API_BASE_URL`.

## 4. Calibration
1. Mount the sensor under the bin lid.
2. Measure the distance from the sensor face to the **empty bin bottom** -> set `EMPTY_DISTANCE_CM` (and match in the web dashboard bin settings).
3. Measure the distance from the sensor face to the **full fill line** (keep `>= 20 cm` for JSN-SR04T) -> set `FULL_DISTANCE_CM`.

## 5. Build & Upload
```bash
cd firmware/esp32
pio run --target upload
pio device monitor -b 115200
```
