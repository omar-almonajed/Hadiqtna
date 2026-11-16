#pragma once
#include <Arduino.h>
#include <vector>

struct QueuedReading {
  unsigned long sequenceNumber;
  float distanceCm;
  int signalStrength;
  String measuredAtIso;
};

/**
 * Persistent flash-backed bounded FIFO queue + NVS monotonic sequence counter.
 * Overflow policy: DROP_OLDEST (keeps the newest OFFLINE_QUEUE_MAX_RECORDS
 * readings and increments droppedOverflowCount in NVS).
 */
class OfflineReadingQueue {
public:
  bool begin();
  unsigned long enqueue(float distanceCm, int signalStrength, const String& measuredAtIso);
  std::vector<QueuedReading> peekBatch(size_t maxCount) const;
  bool popFront(size_t count);
  size_t count() const;
  unsigned long getNextSequenceNumber() const;
  unsigned long getDroppedOverflowCount() const;

private:
  bool loadAll(std::vector<QueuedReading>& out) const;
  bool saveAll(const std::vector<QueuedReading>& items);
  size_t cachedCount = 0;
  unsigned long nextSequenceNumber = 1;
  unsigned long droppedOverflowCount = 0;
};
