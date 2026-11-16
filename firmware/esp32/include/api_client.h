#pragma once
#include <Arduino.h>
#include <vector>
#include "offline_queue.h"

struct ApiPostResult {
  bool success;
  int httpCode;
  size_t confirmedPrefixCount;
  String endpointUsed;
  String responseBody;
};

struct DeviceTelemetryDiagnostics {
  size_t queuedReadingsCount;
  unsigned long overflowDroppedCount;
  String lastPowerResetReason;
  String networkType;
};

class HadiqtnaApiClient {
public:
  ApiPostResult postReadingBatch(
    const String& deviceId,
    const std::vector<QueuedReading>& readings,
    const DeviceTelemetryDiagnostics& diag
  );

  ApiPostResult postSensorReading(
    const String& deviceId,
    unsigned long sequenceNumber,
    float distanceCm,
    int signalStrength,
    const String& measuredAtIso
  );

private:
  ApiPostResult postJsonToBaseUrl(
    const String& baseUrl,
    const String& path,
    const String& payload,
    size_t batchSize
  );
};
