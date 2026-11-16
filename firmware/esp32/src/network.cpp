#include "network.h"
#include "config.h"
#include <WiFi.h>
#include <time.h>

bool NetworkManager::connectSsid(
  const char* ssid,
  const char* password,
  const char* label,
  unsigned long timeoutMs
) {
  if (!ssid || strlen(ssid) == 0 || strcmp(ssid, "REPLACE_WITH_WIFI_SSID") == 0) {
    return false;
  }

  Serial.printf("[NET] Connecting [%s] SSID: %s\n", label, ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    currentState = NET_WIFI_CONNECTED;
    activeNetworkLabel = label;
    Serial.printf("[NET] Connected [%s] IP=%s GW=%s RSSI=%d dBm\n",
                  label,
                  WiFi.localIP().toString().c_str(),
                  WiFi.gatewayIP().toString().c_str(),
                  WiFi.RSSI());
    return true;
  }

  WiFi.disconnect(false);
  return false;
}

bool NetworkManager::connectWiFi(unsigned long timeoutMs) {
  if (WiFi.status() == WL_CONNECTED) {
    currentState = NET_WIFI_CONNECTED;
    return true;
  }

  if (connectSsid(WIFI_SSID, WIFI_PASSWORD, "WIFI_PRIMARY", timeoutMs)) {
    return true;
  }

  // Fallback to secondary SSID (e.g. local 4G SIM router AP when fixed internet drops)
  if (strlen(WIFI_BACKUP_SSID) > 0) {
    Serial.println("[NET] Primary Wi-Fi unavailable. Trying backup 4G/router SSID...");
    if (connectSsid(WIFI_BACKUP_SSID, WIFI_BACKUP_PASSWORD, "WIFI_BACKUP_4G", timeoutMs)) {
      return true;
    }
  }

  currentState = NET_OFFLINE;
  activeNetworkLabel = "NONE";
  Serial.println("[NET] ERROR: No Wi-Fi network available (offline mode active).");
  return false;
}

bool NetworkManager::ensureConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    if (currentState == NET_OFFLINE) currentState = NET_WIFI_CONNECTED;
    return true;
  }
  currentState = NET_OFFLINE;
  return connectWiFi(15000);
}

void NetworkManager::syncTimeNtp() {
  if (WiFi.status() != WL_CONNECTED) return;
  Serial.println("[NTP] Synchronizing system clock...");
  configTime(0, 0, NTP_SERVER_PRIMARY, NTP_SERVER_SECONDARY);
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 6000)) {
    ntpSynced = true;
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    Serial.printf("[NTP] Time synchronized: %s\n", buf);
  } else {
    Serial.println("[NTP] WARNING: NTP unreachable (likely offline/filtered). Using fallback timestamp.");
  }
}

String NetworkManager::getIsoTimestamp() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 500)) {
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S.000Z", &timeinfo);
    return String(buf);
  }
  return "1970-01-01T00:00:00.000Z";
}

int NetworkManager::getRssi() {
  if (WiFi.status() != WL_CONNECTED) return -120;
  return WiFi.RSSI();
}

NetState NetworkManager::getState() const {
  return currentState;
}

String NetworkManager::getActiveNetworkLabel() const {
  return activeNetworkLabel;
}

void NetworkManager::printDiagnostics() const {
  Serial.printf("[DIAG] Net=%s (%s) | IP=%s | RSSI=%d dBm | NTP=%s\n",
                currentState == NET_OFFLINE ? "OFFLINE" : "WIFI_UP",
                activeNetworkLabel.c_str(),
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "0.0.0.0",
                WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -120,
                ntpSynced ? "OK" : "NO_SYNC");
}
