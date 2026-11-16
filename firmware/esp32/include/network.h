#pragma once
#include <Arduino.h>

enum NetState {
  NET_OFFLINE = 0,
  NET_WIFI_CONNECTED = 1,
  NET_API_REACHABLE = 2
};

class NetworkManager {
public:
  bool connectWiFi(unsigned long timeoutMs = 20000);
  bool ensureConnected();
  void syncTimeNtp();
  String getIsoTimestamp();
  int getRssi();
  NetState getState() const;
  String getActiveNetworkLabel() const;
  void printDiagnostics() const;

private:
  bool connectSsid(const char* ssid, const char* password, const char* label, unsigned long timeoutMs);
  NetState currentState = NET_OFFLINE;
  String activeNetworkLabel = "NONE";
  bool ntpSynced = false;
};
