#include "offline_queue.h"
#include "config.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Preferences.h>

static Preferences prefs;
static const char* PREFS_NS = "hadiqtna";
static const char* KEY_NEXT_SEQ = "nextSeq";
static const char* KEY_DROPPED = "dropped";

bool OfflineReadingQueue::begin() {
  if (!LittleFS.begin(true)) {
    Serial.println("[QUEUE] ERROR: LittleFS mount failed!");
    return false;
  }

  prefs.begin(PREFS_NS, false);
  nextSequenceNumber = prefs.getULong(KEY_NEXT_SEQ, 1);
  if (nextSequenceNumber == 0) nextSequenceNumber = 1;
  droppedOverflowCount = prefs.getULong(KEY_DROPPED, 0);

  std::vector<QueuedReading> existing;
  loadAll(existing);
  cachedCount = existing.size();

  // Ensure monotonic sequence never regresses behind any queued item after brownout
  for (const auto& item : existing) {
    if (item.sequenceNumber >= nextSequenceNumber) {
      nextSequenceNumber = item.sequenceNumber + 1;
      prefs.putULong(KEY_NEXT_SEQ, nextSequenceNumber);
    }
  }

  Serial.printf("[QUEUE] Mounted LittleFS. Queued=%u/%d, NextSeq=%lu, DroppedOverflow=%lu\n",
                static_cast<unsigned int>(cachedCount),
                OFFLINE_QUEUE_MAX_RECORDS,
                nextSequenceNumber,
                droppedOverflowCount);
  return true;
}

bool OfflineReadingQueue::loadAll(std::vector<QueuedReading>& out) const {
  out.clear();
  if (!LittleFS.exists(OFFLINE_QUEUE_FILE)) {
    return true;
  }

  File file = LittleFS.open(OFFLINE_QUEUE_FILE, "r");
  if (!file) {
    return false;
  }

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) continue;

    QueuedReading item;
    item.sequenceNumber = doc["s"] | 0UL;
    item.distanceCm = doc["cm"] | -1.0f;
    item.signalStrength = doc["r"] | -120;
    item.measuredAtIso = String((const char*)(doc["t"] | "1970-01-01T00:00:00.000Z"));
    if (item.sequenceNumber > 0) {
      out.push_back(item);
    }
  }
  file.close();
  return true;
}

bool OfflineReadingQueue::saveAll(const std::vector<QueuedReading>& items) {
  const char* tmpPath = "/readings_q.tmp";
  File tmp = LittleFS.open(tmpPath, "w");
  if (!tmp) {
    return false;
  }

  for (const auto& item : items) {
    JsonDocument doc;
    doc["s"] = item.sequenceNumber;
    doc["cm"] = roundf(item.distanceCm * 10.0f) / 10.0f;
    doc["r"] = item.signalStrength;
    doc["t"] = item.measuredAtIso;
    serializeJson(doc, tmp);
    tmp.print('\n');
  }
  tmp.flush();
  tmp.close();

  if (LittleFS.exists(OFFLINE_QUEUE_FILE)) {
    LittleFS.remove(OFFLINE_QUEUE_FILE);
  }
  bool renamed = LittleFS.rename(tmpPath, OFFLINE_QUEUE_FILE);
  if (renamed) {
    cachedCount = items.size();
  }
  return renamed;
}

unsigned long OfflineReadingQueue::enqueue(
  float distanceCm,
  int signalStrength,
  const String& measuredAtIso
) {
  std::vector<QueuedReading> items;
  loadAll(items);

  unsigned long assignedSeq = nextSequenceNumber;
  nextSequenceNumber++;
  prefs.putULong(KEY_NEXT_SEQ, nextSequenceNumber);

  // Bounded storage overflow policy: DROP_OLDEST
  while (items.size() >= OFFLINE_QUEUE_MAX_RECORDS) {
    items.erase(items.begin());
    droppedOverflowCount++;
    prefs.putULong(KEY_DROPPED, droppedOverflowCount);
    Serial.printf("[QUEUE] WARNING: Queue full (%d). Applied DROP_OLDEST policy (total dropped=%lu).\n",
                  OFFLINE_QUEUE_MAX_RECORDS, droppedOverflowCount);
  }

  QueuedReading rec;
  rec.sequenceNumber = assignedSeq;
  rec.distanceCm = distanceCm;
  rec.signalStrength = signalStrength;
  rec.measuredAtIso = measuredAtIso;
  items.push_back(rec);

  if (!saveAll(items)) {
    Serial.println("[QUEUE] ERROR: Failed to persist reading to LittleFS!");
  }
  return assignedSeq;
}

std::vector<QueuedReading> OfflineReadingQueue::peekBatch(size_t maxCount) const {
  std::vector<QueuedReading> all;
  loadAll(all);
  if (all.size() <= maxCount) {
    return all;
  }
  return std::vector<QueuedReading>(all.begin(), all.begin() + maxCount);
}

bool OfflineReadingQueue::popFront(size_t removeCount) {
  if (removeCount == 0) return true;
  std::vector<QueuedReading> items;
  if (!loadAll(items)) return false;

  if (removeCount >= items.size()) {
    items.clear();
  } else {
    items.erase(items.begin(), items.begin() + removeCount);
  }
  return saveAll(items);
}

size_t OfflineReadingQueue::count() const {
  return cachedCount;
}

unsigned long OfflineReadingQueue::getNextSequenceNumber() const {
  return nextSequenceNumber;
}

unsigned long OfflineReadingQueue::getDroppedOverflowCount() const {
  return droppedOverflowCount;
}
