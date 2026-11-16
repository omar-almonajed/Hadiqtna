#pragma once

// Load local secrets (copy secrets.h.example -> secrets.h; secrets.h is gitignored)
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #define WIFI_SSID            "REPLACE_WITH_WIFI_SSID"
  #define WIFI_PASSWORD        "REPLACE_WITH_WIFI_PASSWORD"
  #define WIFI_BACKUP_SSID     ""
  #define WIFI_BACKUP_PASSWORD ""
  #define DEVICE_ID            "BIN-ESP32-001"
  #define DEVICE_TOKEN         "REPLACE_WITH_PROVISIONED_DEVICE_TOKEN"
  #define API_BASE_URL         "https://YOUR_CLOUD_RUN_OR_APP_URL"
  #define LOCAL_API_BASE_URL   ""
#endif

// -----------------------------------------------------------------------------
// Ultrasonic Sensor Hardware Configuration
// Supported sensor families:
//   SENSOR_MODEL_HC_SR04   (standard 5V or 3.3V-compatible indoor/protected module)
//   SENSOR_MODEL_JSN_SR04T (waterproof outdoor probe; requires >=20cm min blind zone)
// IMPORTANT: If your sensor Echo pin outputs 5V, you MUST use a voltage divider
// (e.g. 1kOhm + 2kOhm) or bidirectional level shifter before GPIO input on ESP32!
// -----------------------------------------------------------------------------
#define SENSOR_MODEL_HC_SR04   1
#define SENSOR_MODEL_JSN_SR04T 2
#define SENSOR_MODEL           SENSOR_MODEL_JSN_SR04T

#define SENSOR_TRIGGER_PIN 5
#define SENSOR_ECHO_PIN    18

// Physical range bounds (cm) depending on ultrasonic transducer
#define SENSOR_MIN_RANGE_CM 2.0f
#define SENSOR_MAX_RANGE_CM 400.0f

// -----------------------------------------------------------------------------
// LED Status Indicator Pins (3.3V GPIO -> 220-330 Ohm resistor -> LED -> GND)
// -----------------------------------------------------------------------------
#define LED_GREEN_PIN  25
#define LED_YELLOW_PIN 26
#define LED_RED_PIN    27

// Configurable LED percentage thresholds
#define LED_YELLOW_THRESHOLD_PERCENT 50
#define LED_RED_THRESHOLD_PERCENT    80

// -----------------------------------------------------------------------------
// Bin Depth Calibration Placeholders (MEASURE YOUR ACTUAL BIN BEFORE DEPLOYING!)
// EMPTY_DISTANCE_CM: Distance from sensor face to bottom of empty bin
// FULL_DISTANCE_CM:  Distance from sensor face to max waste level (keep > sensor blind zone!)
// -----------------------------------------------------------------------------
#define EMPTY_DISTANCE_CM 90.0f
#define FULL_DISTANCE_CM  15.0f

// -----------------------------------------------------------------------------
// Sampling, Low-Bandwidth Telemetry & 5-Minute Pilot Default
// -----------------------------------------------------------------------------
#define SAMPLE_COUNT             9
#define SAMPLE_DELAY_MS          60
#define SMOOTHING_ALPHA          0.6f
#define READING_INTERVAL_SECONDS 300
#define MIN_DELTA_TO_SEND_CM     0.5f
#define HEARTBEAT_FORCE_CYCLES   6
#define USE_COMPACT_JSON         1
#define HTTP_MAX_RETRIES         2
#define BATCH_FLUSH_MAX_SIZE     10
#define NTP_SERVER_PRIMARY       "pool.ntp.org"
#define NTP_SERVER_SECONDARY     "time.google.com"

// -----------------------------------------------------------------------------
// Offline-First Bounded Ring Buffer & Exponential Backoff
// Overflow policy: DROP_OLDEST (keeps latest 120 readings ~ 10 hours at 5-min interval)
// -----------------------------------------------------------------------------
#define OFFLINE_QUEUE_MAX_RECORDS 120
#define OFFLINE_QUEUE_FILE        "/readings_q.jsonl"
#define BACKOFF_BASE_MS           15000UL
#define BACKOFF_MAX_MS            300000UL

// -----------------------------------------------------------------------------
// Power Resilience Configuration
// Requires stable 5V >= 1A supply (or regulated battery/solar buck converter).
// Use POWER_MODE_BATTERY_DEEP_SLEEP for battery/solar enclosures (disables Wi-Fi between cycles).
// Do NOT assume solar autonomy without measuring actual deployment power draw & winter irradiance.
// -----------------------------------------------------------------------------
#define POWER_MODE_MAINS_5V           1
#define POWER_MODE_BATTERY_DEEP_SLEEP 2
#define POWER_MODE                    POWER_MODE_MAINS_5V
