#include "sensor.h"
#include "config.h"
#include <algorithm>
#include <vector>

UltrasonicSensorDriver::UltrasonicSensorDriver(
  uint8_t trigPin,
  uint8_t echoPin,
  float emptyCm,
  float fullCm
)
  : _trigPin(trigPin),
    _echoPin(echoPin),
    _emptyCm(emptyCm),
    _fullCm(fullCm),
    _hasSmoothed(false),
    _smoothedDistanceCm(0.0f) {}

void UltrasonicSensorDriver::begin() {
  pinMode(_trigPin, OUTPUT);
  pinMode(_echoPin, INPUT);
  digitalWrite(_trigPin, LOW);
  delay(50);
}

float UltrasonicSensorDriver::readSingleDistanceCm() {
  digitalWrite(_trigPin, LOW);
  delayMicroseconds(4);
  digitalWrite(_trigPin, HIGH);
  // JSN-SR04T works reliably with 15-20us trigger pulse; HC-SR04 accepts 10-20us
  delayMicroseconds(15);
  digitalWrite(_trigPin, LOW);

  // Timeout 35ms (~600cm max round-trip)
  unsigned long durationUs = pulseIn(_echoPin, HIGH, 35000UL);
  if (durationUs == 0) {
    return -1.0f;
  }

  // Speed of sound ~0.0343 cm/us -> distance = (duration * 0.0343) / 2
  float distanceCm = (static_cast<float>(durationUs) * 0.0343f) / 2.0f;
  return distanceCm;
}

int UltrasonicSensorDriver::computeFillPercentage(float distanceCm) {
  if (_emptyCm <= _fullCm) return 0;
  float pct = ((_emptyCm - distanceCm) / (_emptyCm - _fullCm)) * 100.0f;
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return static_cast<int>(roundf(pct));
}

SensorMeasurement UltrasonicSensorDriver::takeStableMeasurement() {
  std::vector<float> validSamples;
  validSamples.reserve(SAMPLE_COUNT);

  const float minRange = (SENSOR_MODEL == SENSOR_MODEL_JSN_SR04T) ? 20.0f : SENSOR_MIN_RANGE_CM;
  const float maxAllowed = min(_emptyCm + 40.0f, SENSOR_MAX_RANGE_CM);

  for (int i = 0; i < SAMPLE_COUNT; ++i) {
    float d = readSingleDistanceCm();
    if (d >= minRange && d <= maxAllowed) {
      validSamples.push_back(d);
    }
    delay(SAMPLE_DELAY_MS);
  }

  if (validSamples.size() < 3) {
    return {false, -1.0f, 0, "INSUFFICIENT_VALID_SAMPLES"};
  }

  // Median filter to eliminate ultrasonic echo spikes
  std::sort(validSamples.begin(), validSamples.end());
  float medianCm = validSamples[validSamples.size() / 2];

  // Exponential smoothing across measurement cycles
  if (!_hasSmoothed) {
    _smoothedDistanceCm = medianCm;
    _hasSmoothed = true;
  } else {
    _smoothedDistanceCm =
      (SMOOTHING_ALPHA * medianCm) + ((1.0f - SMOOTHING_ALPHA) * _smoothedDistanceCm);
  }

  float roundedCm = roundf(_smoothedDistanceCm * 10.0f) / 10.0f;
  int fillPct = computeFillPercentage(roundedCm);

  return {true, roundedCm, fillPct, nullptr};
}
