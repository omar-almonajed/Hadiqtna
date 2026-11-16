#pragma once
#include <Arduino.h>

struct SensorMeasurement {
  bool valid;
  float distanceCm;
  int fillPercentage;
  const char* errorReason;
};

class UltrasonicSensorDriver {
public:
  UltrasonicSensorDriver(uint8_t trigPin, uint8_t echoPin, float emptyCm, float fullCm);
  void begin();
  SensorMeasurement takeStableMeasurement();

private:
  uint8_t _trigPin;
  uint8_t _echoPin;
  float _emptyCm;
  float _fullCm;
  bool _hasSmoothed;
  float _smoothedDistanceCm;

  float readSingleDistanceCm();
  int computeFillPercentage(float distanceCm);
};
