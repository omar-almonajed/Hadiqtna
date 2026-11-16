#include "api_client.h"
#include "config.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

ApiPostResult HadiqtnaApiClient::postJsonToBaseUrl(
  const String& baseUrl,
  const String& path,
  const String& payload,
  size_t batchSize
) {
  if (baseUrl.length() == 0) {
    return {false, -1, 0, "", "EMPTY_BASE_URL"};
  }

  const String endpoint = baseUrl + path;

  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; ++attempt) {
    HTTPClient http;
    int code = -1;
    String body;

    if (endpoint.startsWith("https://")) {
      WiFiClientSecure* client = new WiFiClientSecure();
      // For production hardening, pin CA certificate via client->setCACert(ROOT_CA_PEM)
      client->setInsecure();
      if (http.begin(*client, endpoint)) {
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
        http.setTimeout(10000);
        code = http.POST(payload);
        body = http.getString();
        http.end();
      }
      delete client;
    } else {
      if (http.begin(endpoint)) {
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
        http.setTimeout(8000);
        code = http.POST(payload);
        body = http.getString();
        http.end();
      }
    }

    // Only mark confirmed when backend explicitly returns 2xx OR 409 duplicate
    if (code >= 200 && code < 300) {
      return {true, code, batchSize, endpoint, body};
    }

    if (code == 409) {
      // Backend explicitly confirmed this sequence was already persisted (duplicate protection)
      return {true, code, batchSize, endpoint, body};
    }

    Serial.printf("[API] %s attempt %d failed HTTP %d: %s\n",
                  endpoint.c_str(), attempt, code, body.c_str());

    if (code >= 400 && code < 500 && code != 429) {
      return {false, code, 0, endpoint, body};
    }

    delay(1000 * attempt);
  }

  return {false, -1, 0, endpoint, "RETRY_EXHAUSTED"};
}

ApiPostResult HadiqtnaApiClient::postReadingBatch(
  const String& deviceId,
  const std::vector<QueuedReading>& readings,
  const DeviceTelemetryDiagnostics& diag
) {
  if (readings.empty()) {
    return {true, 200, 0, "", "EMPTY_BATCH"};
  }

  // Single compact payload when only 1 reading is queued; batch payload when flushing multiple
  if (readings.size() == 1) {
    const auto& r = readings[0];
    JsonDocument doc;
#if USE_COMPACT_JSON
    doc["d"] = deviceId;
    doc["s"] = r.sequenceNumber;
    doc["cm"] = roundf(r.distanceCm * 10.0f) / 10.0f;
    doc["r"] = r.signalStrength;
    doc["t"] = r.measuredAtIso;
    doc["q"] = diag.queuedReadingsCount;
    doc["ov"] = diag.overflowDroppedCount;
    if (diag.lastPowerResetReason.length() > 0) doc["rst"] = diag.lastPowerResetReason;
    if (diag.networkType.length() > 0) doc["net"] = diag.networkType;
#else
    doc["deviceId"] = deviceId;
    doc["sequenceNumber"] = r.sequenceNumber;
    doc["distanceCm"] = roundf(r.distanceCm * 10.0f) / 10.0f;
    doc["signalStrength"] = r.signalStrength;
    doc["measuredAt"] = r.measuredAtIso;
#endif
    String payload;
    serializeJson(doc, payload);

    ApiPostResult primary = postJsonToBaseUrl(String(API_BASE_URL), "/api/iot/readings", payload, 1);
    if (primary.success) return primary;

    if (strlen(LOCAL_API_BASE_URL) > 0) {
      Serial.println("[API] Primary cloud unreachable; falling back to LOCAL_API_BASE_URL...");
      return postJsonToBaseUrl(String(LOCAL_API_BASE_URL), "/api/iot/readings", payload, 1);
    }
    return primary;
  }

  JsonDocument doc;
#if USE_COMPACT_JSON
  doc["d"] = deviceId;
  doc["q"] = diag.queuedReadingsCount;
  doc["ov"] = diag.overflowDroppedCount;
  if (diag.lastPowerResetReason.length() > 0) doc["rst"] = diag.lastPowerResetReason;
  if (diag.networkType.length() > 0) doc["net"] = diag.networkType;
  JsonArray arr = doc["b"].to<JsonArray>();
  for (const auto& r : readings) {
    JsonObject obj = arr.add<JsonObject>();
    obj["s"] = r.sequenceNumber;
    obj["cm"] = roundf(r.distanceCm * 10.0f) / 10.0f;
    obj["r"] = r.signalStrength;
    obj["t"] = r.measuredAtIso;
  }
#else
  doc["deviceId"] = deviceId;
  JsonArray arr = doc["readings"].to<JsonArray>();
  for (const auto& r : readings) {
    JsonObject obj = arr.add<JsonObject>();
    obj["sequenceNumber"] = r.sequenceNumber;
    obj["distanceCm"] = roundf(r.distanceCm * 10.0f) / 10.0f;
    obj["signalStrength"] = r.signalStrength;
    obj["measuredAt"] = r.measuredAtIso;
  }
#endif

  String payload;
  serializeJson(doc, payload);

  ApiPostResult primary = postJsonToBaseUrl(String(API_BASE_URL), "/api/iot/readings/batch", payload, readings.size());
  if (primary.success) return primary;

  if (strlen(LOCAL_API_BASE_URL) > 0) {
    Serial.println("[API] Primary cloud unreachable for batch; falling back to LOCAL_API_BASE_URL...");
    return postJsonToBaseUrl(String(LOCAL_API_BASE_URL), "/api/iot/readings/batch", payload, readings.size());
  }
  return primary;
}

ApiPostResult HadiqtnaApiClient::postSensorReading(
  const String& deviceId,
  unsigned long sequenceNumber,
  float distanceCm,
  int signalStrength,
  const String& measuredAtIso
) {
  QueuedReading single{sequenceNumber, distanceCm, signalStrength, measuredAtIso};
  DeviceTelemetryDiagnostics diag{0, 0, "", ""};
  return postReadingBatch(deviceId, {single}, diag);
}
