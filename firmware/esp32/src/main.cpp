#include <Arduino.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include "config.h"
#include "sensor.h"
#include "network.h"
#include "offline_queue.h"
#include "api_client.h"

UltrasonicSensorDriver sensor(
  SENSOR_TRIGGER_PIN,
  SENSOR_ECHO_PIN,
  EMPTY_DISTANCE_CM,
  FULL_DISTANCE_CM
);
NetworkManager network;
OfflineReadingQueue offlineQueue;
HadiqtnaApiClient apiClient;

RTC_DATA_ATTR float lastQueuedDistanceCm = -999.0f;
RTC_DATA_ATTR int skippedCycles = 0;

unsigned long currentBackoffMs = 0;
unsigned long nextRetryAtMs = 0;
String bootResetReason = "UNKNOWN";

String formatResetReason(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWER_ON";
    case ESP_RST_BROWNOUT: return "BROWNOUT_POWER_DROP";
    case ESP_RST_SW: return "SOFTWARE_RESET";
    case ESP_RST_PANIC: return "PANIC_REBOOT";
    case ESP_RST_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_INT_WDT: return "WATCHDOG_RESET";
    case ESP_RST_DEEPSLEEP: return "DEEP_SLEEP_WAKE";
    default: return "OTHER_RESET";
  }
}

void updateLedIndicators(int fillPercentage) {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_YELLOW_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);

  if (fillPercentage >= LED_RED_THRESHOLD_PERCENT) {
    digitalWrite(LED_RED_PIN, HIGH);
  } else if (fillPercentage >= LED_YELLOW_THRESHOLD_PERCENT) {
    digitalWrite(LED_YELLOW_PIN, HIGH);
  } else {
    digitalWrite(LED_GREEN_PIN, HIGH);
  }
}

void flushQueuedReadings() {
  if (offlineQueue.count() == 0) return;

  unsigned long nowMs = millis();
  if (nextRetryAtMs > 0 && nowMs < nextRetryAtMs) {
    Serial.printf("[SYNC] Exponential backoff active (%lu ms remaining). Queued=%u\n",
                  nextRetryAtMs - nowMs,
                  static_cast<unsigned int>(offlineQueue.count()));
    return;
  }

  if (!network.ensureConnected()) {
    currentBackoffMs = (currentBackoffMs == 0)
      ? BACKOFF_BASE_MS
      : min(currentBackoffMs * 2UL, BACKOFF_MAX_MS);
    nextRetryAtMs = millis() + currentBackoffMs;
    Serial.printf("[NET] Offline; buffered readings preserved (%u). Next retry in %lu ms.\n",
                  static_cast<unsigned int>(offlineQueue.count()),
                  currentBackoffMs);
    return;
  }

  network.syncTimeNtp();
  network.printDiagnostics();

  while (offlineQueue.count() > 0) {
    std::vector<QueuedReading> batch = offlineQueue.peekBatch(BATCH_FLUSH_MAX_SIZE);
    if (batch.empty()) break;

    DeviceTelemetryDiagnostics diag{
      offlineQueue.count(),
      offlineQueue.getDroppedOverflowCount(),
      bootResetReason,
      network.getActiveNetworkLabel()
    };

    Serial.printf("[API] Flushing %u reading(s) (first seq=%lu) to backend...\n",
                  static_cast<unsigned int>(batch.size()),
                  batch[0].sequenceNumber);

    ApiPostResult res = apiClient.postReadingBatch(DEVICE_ID, batch, diag);
    if (res.success && res.confirmedPrefixCount > 0) {
      offlineQueue.popFront(res.confirmedPrefixCount);
      currentBackoffMs = 0;
      nextRetryAtMs = 0;
      Serial.printf("[API] Confirmed %u reading(s) via %s (HTTP %d). Remaining=%u\n",
                    static_cast<unsigned int>(res.confirmedPrefixCount),
                    res.endpointUsed.c_str(),
                    res.httpCode,
                    static_cast<unsigned int>(offlineQueue.count()));
    } else {
      currentBackoffMs = (currentBackoffMs == 0)
        ? BACKOFF_BASE_MS
        : min(currentBackoffMs * 2UL, BACKOFF_MAX_MS);
      nextRetryAtMs = millis() + currentBackoffMs;
      Serial.printf("[API] Delivery NOT confirmed (HTTP %d). Readings kept safely on flash. Backoff=%lu ms.\n",
                    res.httpCode, currentBackoffMs);
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(350);

  bootResetReason = formatResetReason(esp_reset_reason());
  Serial.println("\n=== HADIQTNA | Smart Bin ESP32 Firmware (Syria Field Hardened) ===");
  Serial.printf("Device ID: %s | Reset Reason: %s | Interval: %ds\n",
                DEVICE_ID, bootResetReason.c_str(), READING_INTERVAL_SECONDS);
  Serial.printf("Calibration -> Empty: %.1f cm | Full: %.1f cm\n",
                EMPTY_DISTANCE_CM, FULL_DISTANCE_CM);

  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_YELLOW_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  updateLedIndicators(0);

  sensor.begin();
  offlineQueue.begin();

  if (network.connectWiFi()) {
    network.syncTimeNtp();
    network.printDiagnostics();
    flushQueuedReadings();
  }
}

void sleepUntilNextCycle() {
#if POWER_MODE == POWER_MODE_BATTERY_DEEP_SLEEP
  Serial.printf("[PWR] Entering Deep Sleep for %d seconds...\n", READING_INTERVAL_SECONDS);
  Serial.flush();
  esp_sleep_enable_timer_wakeup(static_cast<uint64_t>(READING_INTERVAL_SECONDS) * 1000000ULL);
  esp_deep_sleep_start();
#else
  delay(static_cast<unsigned long>(READING_INTERVAL_SECONDS) * 1000UL);
#endif
}

void loop() {
  SensorMeasurement reading = sensor.takeStableMeasurement();

  if (!reading.valid) {
    Serial.printf("[SENSOR] Invalid measurement (%s); skipping enqueue.\n",
                  reading.errorReason ? reading.errorReason : "UNKNOWN");
    flushQueuedReadings();
    sleepUntilNextCycle();
    return;
  }

  Serial.printf("[SENSOR] Distance=%.1f cm | Fill=%d%%\n",
                reading.distanceCm, reading.fillPercentage);
  updateLedIndicators(reading.fillPercentage);

  // Low-bandwidth optimization: avoid queuing identical steady-state readings until heartbeat cycle
  bool significantChange = fabsf(reading.distanceCm - lastQueuedDistanceCm) >= MIN_DELTA_TO_SEND_CM;
  bool heartbeatDue = skippedCycles >= HEARTBEAT_FORCE_CYCLES;

  if (significantChange || heartbeatDue) {
    String timestamp = network.getIsoTimestamp();
    int rssi = network.getRssi();
    unsigned long seq = offlineQueue.enqueue(reading.distanceCm, rssi, timestamp);
    lastQueuedDistanceCm = reading.distanceCm;
    skippedCycles = 0;
    Serial.printf("[QUEUE] Buffered reading seq=%lu (queue=%u/%d)\n",
                  seq,
                  static_cast<unsigned int>(offlineQueue.count()),
                  OFFLINE_QUEUE_MAX_RECORDS);
  } else {
    skippedCycles++;
    Serial.printf("[TELEMETRY] Reading unchanged (delta < %.1f cm); cycle %d/%d.\n",
                  MIN_DELTA_TO_SEND_CM, skippedCycles, HEARTBEAT_FORCE_CYCLES);
  }

  flushQueuedReadings();
  sleepUntilNextCycle();
}
