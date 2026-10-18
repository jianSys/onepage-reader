#pragma once
#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "NotificationStore.h"

struct ble_gap_event;

// Background ANCS (Apple Notification Center Service) client. Mirrors BleHidHost:
// a single NimBLE host task, a FreeRTOS queue feeding the main loop, and a
// Bound/Discovery mode. The iPhone is the GATT server (peripheral); this device
// connects as central, bonds, and subscribes to ANCS.
//
// Lifecycle: the main loop calls drainPending() each frame to move captured
// notifications from the BLE task into NotificationStore. BLE task code never
// touches rendering or Activity objects.
class BleAncsClient {
public:
  enum class State { Stopped, Scanning, Connecting, Connected, Discovered, Subscribed };
  enum class Mode { Bound, Discovery };

  static constexpr int MAX_SCAN = 16;
  struct PeerEntry {
    uint8_t addr[6];
    uint8_t addrType;
    char name[24];
  };

  static BleAncsClient& getInstance();

  bool start();
  bool stop();
  bool isStarted() const { return started_; }

  // Discovery (pairing UI): collect nearby devices; connectTo() pairs the chosen one.
  void startDiscovery();
  int getDiscoveredCount() const { return scanCount_; }
  uint32_t getScanRevision() const { return scanRevision_; }
  bool getDiscovered(int index, PeerEntry& out) const;

  void connectTo(const uint8_t addr[6], uint8_t addrType);
  bool hasPeer() const { return peerValid_; }
  void getPeer(uint8_t addr[6], uint8_t& addrType) const;
  void setPeer(const uint8_t addr[6], uint8_t addrType, const char* name);
  void clearPeer();

  State getState() const { return state_; }

  // Pull captured notifications into the store. Returns number added.
  int drainPending(NotificationStore& store);

  // NimBLE C callbacks (static members -> accessible to private state and to
  // the file-scope helper functions that schedule the initial scan/connect).
  static int gapEvent(struct ble_gap_event* event, void* arg);
  static int onSvcFound(uint16_t conn, const struct ble_gatt_error* error,
                        const struct ble_gatt_svc* svc, void* arg);
  static int onChrFound(uint16_t conn, const struct ble_gatt_error* error,
                        const struct ble_gatt_chr* chr, void* arg);
  static int onDscFound(uint16_t conn, const struct ble_gatt_error* error, uint16_t chrValHandle,
                        const struct ble_gatt_dsc* dsc, void* arg);
  static void onSync();
  static void onReset(int reason);

private:
  BleAncsClient() = default;

  void onDiscovered(const uint8_t addr[6], uint8_t addrType, const char* name);
  void discoverAncs();
  void onNotificationSource(const uint8_t* data, uint16_t len);
  void onDataSource(const uint8_t* data, uint16_t len);
  void parseDataSource();
  void finalizeNotification(uint32_t uid);
  void requestAttributes(uint16_t conn, uint32_t uid);
  void enqueue(const PhoneNotification& n);

  bool started_ = false;
  State state_ = State::Stopped;
  Mode mode_ = Mode::Bound;

  PeerEntry scan_[MAX_SCAN];
  int scanCount_ = 0;
  uint32_t scanRevision_ = 0;

  uint8_t peerAddr_[6] = {0};
  uint8_t peerAddrType_ = 0;
  char peerName_[24] = {0};
  bool peerValid_ = false;

  uint16_t connHandle_ = 0xFFFF;

  uint16_t ancsSvcStart_ = 0, ancsSvcEnd_ = 0;
  uint16_t hNotifySource_ = 0, hDataSource_ = 0, hControlPoint_ = 0;

  // Reassembly buffer for the Data Source characteristic (chunks across MTU).
  uint8_t reasm_[512];
  uint16_t reasmLen_ = 0;
  PhoneNotification cur_;
  bool curHasUid_ = false;
  uint32_t curUid_ = 0;

  QueueHandle_t queue_ = nullptr;
};

extern BleAncsClient& BLE_ANCS;
