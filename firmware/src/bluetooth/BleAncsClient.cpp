#include "BleAncsClient.h"

#ifdef ONEPAGE_C61

#include <Logging.h>
#include <esp_heap_caps.h>
#include <esp_timer.h>

#include <cstring>
#include <freertos/FreeRTOS.h>

#include "HalPowerManager.h"

extern "C" {
#include <host/ble_hs.h>
#include <host/ble_gap.h>
#include <host/ble_gatt.h>
#include <host/ble_uuid.h>
#include <host/util/util.h>
#include <nimble/nimble_port.h>
#include <nimble/nimble_port_freertos.h>
#include <os/os_mbuf.h>
}

namespace {
constexpr size_t MIN_INTERNAL_SRAM = 40 * 1024;
constexpr uint16_t CCCD_UUID = 0x2902;

// ANCS UUIDs in canonical (network byte) order. Used via ble_uuid_init_from_buf().
const uint8_t kAncsSvc[16] = {0x79, 0x05, 0xF4, 0x31, 0xB5, 0xCE, 0x4E, 0x99,
                              0xA4, 0x0F, 0x4B, 0x1E, 0x12, 0x2D, 0x00, 0xD0};
const uint8_t kNotifySource[16] = {0x9F, 0xBF, 0x12, 0x0D, 0x63, 0x01, 0x42, 0xD9,
                                   0x8C, 0x58, 0x25, 0xE6, 0x99, 0xA2, 0x1D, 0xBD};
const uint8_t kDataSource[16] = {0x22, 0xEA, 0xC6, 0xE9, 0x24, 0xD6, 0x4B, 0xB5,
                                 0xBE, 0x44, 0xB3, 0x6A, 0xCE, 0x7C, 0x7B, 0xFB};
const uint8_t kControlPoint[16] = {0x69, 0xD1, 0xD8, 0xF3, 0x45, 0xE1, 0x49, 0xA8,
                                   0x98, 0x21, 0x9B, 0xBE, 0x63, 0x9D, 0xA5, 0x09};

ble_uuid_any_t gAncsSvc, gNs, gDs, gCp;
bool gUuidsInit = false;
void initUuids() {
  if (gUuidsInit) return;
  ble_uuid_init_from_buf(&gAncsSvc, kAncsSvc, 16);
  ble_uuid_init_from_buf(&gNs, kNotifySource, 16);
  ble_uuid_init_from_buf(&gDs, kDataSource, 16);
  ble_uuid_init_from_buf(&gCp, kControlPoint, 16);
  gUuidsInit = true;
}

void startScan();

void bleHostTask(void* param) {
  nimble_port_run();
  nimble_port_freertos_deinit();
}
}  // namespace

// --- GAP / GATT callbacks (static members) --------------------------------

int BleAncsClient::gapEvent(struct ble_gap_event* event, void* arg) {
  BleAncsClient& self = BleAncsClient::getInstance();
  switch (event->type) {
    case BLE_GAP_EVENT_DISC: {
      struct ble_hs_adv_fields fields;
      if (ble_hs_adv_parse_fields(&fields, event->disc.data, event->disc.length_data) != 0) return 0;
      char name[24] = {0};
      if (fields.name_len > 0) {
        uint8_t n = fields.name_len < 23 ? fields.name_len : 23;
        memcpy(name, fields.name, n);
        name[n] = '\0';
      }
      if (self.mode_ == Mode::Discovery) {
        self.onDiscovered(event->disc.addr.val, event->disc.addr.type, name);
        return 0;
      }
      if (!self.peerValid_) return 0;
      if (memcmp(event->disc.addr.val, self.peerAddr_, 6) != 0) return 0;
      LOG_INF("BLEANCS", "peer seen -> connecting");
      ble_gap_disc_cancel();
      self.state_ = State::Connecting;
      uint8_t ownAddrType;
      ble_hs_id_infer_auto(0, &ownAddrType);
      if (ble_gap_connect(ownAddrType, &event->disc.addr, 30000, nullptr,
                          BleAncsClient::gapEvent, nullptr) != 0) {
        startScan();
        self.state_ = State::Scanning;
      }
      return 0;
    }

    case BLE_GAP_EVENT_CONNECT:
      if (event->connect.status == 0) {
        self.connHandle_ = event->connect.conn_handle;
        self.ancsSvcStart_ = self.ancsSvcEnd_ = 0;
        self.hNotifySource_ = self.hDataSource_ = self.hControlPoint_ = 0;
        self.reasmLen_ = 0;
        self.curHasUid_ = false;
        self.cur_.reset();
        self.state_ = State::Connected;
        LOG_INF("BLEANCS", "connected (handle=%u)", self.connHandle_);
        // Bonding is required for ANCS; initiate security so the link encrypts.
        ble_gap_security_initiate(self.connHandle_);
      } else {
        LOG_INF("BLEANCS", "connect failed (status=%d)", event->connect.status);
        if (self.peerValid_) {
          startScan();
          self.state_ = State::Scanning;
        } else {
          self.state_ = State::Stopped;
        }
      }
      return 0;

    case BLE_GAP_EVENT_DISCONNECT:
      LOG_INF("BLEANCS", "disconnected (reason=%d)", event->disconnect.reason);
      self.connHandle_ = 0xFFFF;
      self.ancsSvcStart_ = self.ancsSvcEnd_ = 0;
      self.hNotifySource_ = self.hDataSource_ = self.hControlPoint_ = 0;
      self.state_ = self.peerValid_ ? State::Scanning : State::Stopped;
      if (self.peerValid_) startScan();
      return 0;

    case BLE_GAP_EVENT_ENC_CHANGE:
      // Link encrypted: ANCS is now available — discover the service.
      if (event->enc_change.status == 0 && self.connHandle_ != 0xFFFF) {
        LOG_INF("BLEANCS", "encrypted; discovering ANCS");
        self.discoverAncs();
      }
      return 0;

    case BLE_GAP_EVENT_NOTIFY_RX: {
      uint16_t len = OS_MBUF_PKTLEN(event->notify_rx.om);
      uint8_t buf[256];
      if (len > sizeof(buf)) len = sizeof(buf);
      if (ble_hs_mbuf_to_flat(event->notify_rx.om, buf, sizeof(buf), &len) != 0) return 0;
      if (event->notify_rx.attr_handle == self.hNotifySource_) {
        self.onNotificationSource(buf, len);
      } else if (event->notify_rx.attr_handle == self.hDataSource_) {
        self.onDataSource(buf, len);
      }
      return 0;
    }

    default:
      return 0;
  }
}

int BleAncsClient::onDscFound(uint16_t conn, const struct ble_gatt_error* error, uint16_t chrValHandle,
                              const struct ble_gatt_dsc* dsc, void* arg) {
  BleAncsClient& self = BleAncsClient::getInstance();
  if (error->status == 0 && dsc) {
    if (ble_uuid_u16(&dsc->uuid.u) == CCCD_UUID) {
      if (chrValHandle == self.hNotifySource_ || chrValHandle == self.hDataSource_) {
        uint8_t v[2] = {0x01, 0x00};  // enable notifications
        ble_gattc_write_flat(conn, dsc->handle, v, 2, nullptr, nullptr);
      }
    }
  } else if (error->status == BLE_HS_EDONE) {
    self.state_ = State::Subscribed;
    LOG_INF("BLEANCS", "ANCS subscribed (ns=%u ds=%u cp=%u)", self.hNotifySource_, self.hDataSource_,
            self.hControlPoint_);
  }
  return 0;
}

int BleAncsClient::onChrFound(uint16_t conn, const struct ble_gatt_error* error,
                              const struct ble_gatt_chr* chr, void* arg) {
  BleAncsClient& self = BleAncsClient::getInstance();
  if (error->status == 0 && chr) {
    if (ble_uuid_cmp(&chr->uuid.u, &gNs.u) == 0) self.hNotifySource_ = chr->val_handle;
    else if (ble_uuid_cmp(&chr->uuid.u, &gDs.u) == 0) self.hDataSource_ = chr->val_handle;
    else if (ble_uuid_cmp(&chr->uuid.u, &gCp.u) == 0) self.hControlPoint_ = chr->val_handle;
  } else if (error->status == BLE_HS_EDONE) {
    LOG_INF("BLEANCS", "chr disc done ns=%u ds=%u cp=%u", self.hNotifySource_, self.hDataSource_,
            self.hControlPoint_);
    ble_gattc_disc_all_dscs(conn, self.ancsSvcStart_, self.ancsSvcEnd_, onDscFound, nullptr);
  }
  return 0;
}

int BleAncsClient::onSvcFound(uint16_t conn, const struct ble_gatt_error* error,
                             const struct ble_gatt_svc* svc, void* arg) {
  BleAncsClient& self = BleAncsClient::getInstance();
  if (error->status == 0 && svc) {
    self.ancsSvcStart_ = svc->start_handle;
    self.ancsSvcEnd_ = svc->end_handle;
    LOG_INF("BLEANCS", "ANCS svc [%u..%u]", self.ancsSvcStart_, self.ancsSvcEnd_);
    ble_gattc_disc_all_chrs(conn, self.ancsSvcStart_, self.ancsSvcEnd_, onChrFound, nullptr);
  }
  return 0;
}

namespace {
void startScan() {
  struct ble_gap_disc_params params = {};
  // Low-duty scan: 30 ms window every 300 ms (~10%) so the e-ink UI keeps
  // rendering responsively while unconnected. Units are 0.625 ms.
  params.itvl = 480;     // 300 ms
  params.window = 48;    // 30 ms
  params.passive = 0;
  params.filter_duplicates = 1;
  uint8_t ownAddrType;
  if (ble_hs_id_infer_auto(0, &ownAddrType) != 0) return;
  int rc = ble_gap_disc(ownAddrType, BLE_HS_FOREVER, &params, BleAncsClient::gapEvent, nullptr);
  if (rc != 0) {
    LOG_ERR("BLEANCS", "ble_gap_disc failed: %d", rc);
  } else {
    LOG_INF("BLEANCS", "scanning for phone...");
  }
}
}  // namespace

void BleAncsClient::onSync() {
  BleAncsClient& self = BleAncsClient::getInstance();
  if (self.hasPeer()) startScan();
}

void BleAncsClient::onReset(int reason) { LOG_ERR("BLEANCS", "NimBLE reset reason=%d", reason); }

BleAncsClient& BleAncsClient::getInstance() {
  static BleAncsClient instance;
  return instance;
}

// Global accessor mirroring BLE_HID_HOST.
BleAncsClient& BLE_ANCS = BleAncsClient::getInstance();

bool BleAncsClient::start() {
  if (started_) return true;

  const size_t freeInternal = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  if (freeInternal < MIN_INTERNAL_SRAM) {
    LOG_ERR("BLEANCS", "insufficient internal SRAM (%u), not starting", (unsigned)freeInternal);
    return false;
  }

  if (!queue_) {
    queue_ = xQueueCreate(8, sizeof(PhoneNotification));
    if (!queue_) {
      LOG_ERR("BLEANCS", "action queue alloc failed");
      return false;
    }
  }

  initUuids();
  if (nimble_port_init() != ESP_OK) {
    LOG_ERR("BLEANCS", "nimble_port_init failed");
    return false;
  }
  ble_hs_cfg.sync_cb = &BleAncsClient::onSync;
  ble_hs_cfg.reset_cb = &BleAncsClient::onReset;
  ble_hs_cfg.sm_bonding = 1;
  ble_hs_cfg.sm_mitm = 0;
  ble_hs_cfg.sm_sc = 1;
  ble_hs_cfg.sm_our_key_dist = 3;
  ble_hs_cfg.sm_their_key_dist = 3;

  nimble_port_freertos_init(bleHostTask);
  started_ = true;
  state_ = peerValid_ ? State::Scanning : State::Stopped;
  // Hold full CPU speed: low-power mode breaks controller radio timing.
  HalPowerManager::setBleActive(true);
  LOG_INF("BLEANCS", "started");
  return true;
}

bool BleAncsClient::stop() {
  if (!started_) return true;
  if (connHandle_ != 0xFFFF) ble_gap_terminate(connHandle_, BLE_ERR_REM_USER_CONN_TERM);
  ble_gap_disc_cancel();
  int rc = nimble_port_stop();
  if (rc == 0) nimble_port_deinit();
  started_ = false;
  state_ = State::Stopped;
  connHandle_ = 0xFFFF;
  HalPowerManager::setBleActive(false);
  LOG_INF("BLEANCS", "stopped");
  return true;
}

void BleAncsClient::startDiscovery() {
  scanCount_ = 0;
  scanRevision_++;
  mode_ = Mode::Discovery;
  state_ = State::Scanning;
  ble_gap_disc_cancel();
  startScan();
}

void BleAncsClient::onDiscovered(const uint8_t addr[6], uint8_t addrType, const char* name) {
  for (int i = 0; i < scanCount_; i++) {
    if (memcmp(scan_[i].addr, addr, 6) == 0) return;
  }
  if (scanCount_ >= MAX_SCAN) return;
  PeerEntry& e = scan_[scanCount_++];
  memcpy(e.addr, addr, 6);
  e.addrType = addrType;
  e.name[0] = '\0';
  if (name) {
    strncpy(e.name, name, sizeof(e.name) - 1);
    e.name[sizeof(e.name) - 1] = '\0';
  }
  scanRevision_++;
  LOG_INF("BLEANCS", "discovered #%u: %s", scanCount_, e.name[0] ? e.name : "(unnamed)");
}

bool BleAncsClient::getDiscovered(int index, PeerEntry& out) const {
  if (index >= scanCount_) return false;
  out = scan_[index];
  return true;
}

void BleAncsClient::connectTo(const uint8_t addr[6], uint8_t addrType) {
  setPeer(addr, addrType, nullptr);
  mode_ = Mode::Bound;
  state_ = State::Scanning;
  ble_gap_disc_cancel();
  startScan();
}

void BleAncsClient::setPeer(const uint8_t addr[6], uint8_t addrType, const char* name) {
  memcpy(peerAddr_, addr, 6);
  peerAddrType_ = addrType;
  peerValid_ = true;
  if (name) {
    strncpy(peerName_, name, sizeof(peerName_) - 1);
    peerName_[sizeof(peerName_) - 1] = '\0';
  }
}

void BleAncsClient::getPeer(uint8_t addr[6], uint8_t& addrType) const {
  memcpy(addr, peerAddr_, 6);
  addrType = peerAddrType_;
}

void BleAncsClient::clearPeer() {
  peerValid_ = false;
  memset(peerAddr_, 0, 6);
  peerAddrType_ = 0;
  peerName_[0] = '\0';
}

void BleAncsClient::discoverAncs() {
  initUuids();
  state_ = State::Discovered;
  ble_gattc_disc_svc_by_uuid(connHandle_, &gAncsSvc.u, onSvcFound, nullptr);
}

void BleAncsClient::onNotificationSource(const uint8_t* d, uint16_t len) {
  if (len < 8) return;
  const uint8_t eventId = d[0];
  const uint8_t flags = d[1];
  const uint8_t cat = d[2];
  const uint32_t uid =
      ((uint32_t)d[4] << 24) | ((uint32_t)d[5] << 16) | ((uint32_t)d[6] << 8) | d[7];
  if (eventId == 2) return;  // removed: UI drops by uid
  if (eventId == 0 || eventId == 1) {
    cur_.reset();
    cur_.uid = uid;
    cur_.category = cat;
    cur_.flags = flags;
    curHasUid_ = true;
    curUid_ = uid;
    reasmLen_ = 0;
    requestAttributes(connHandle_, uid);
  }
}

void BleAncsClient::requestAttributes(uint16_t conn, uint32_t uid) {
  if (hControlPoint_ == 0) return;
  // Get Notification Attributes: CommandID + UID + [AttributeID (+2-byte max len)]*.
  uint8_t cmd[2 + 4 + 5 * 3];
  int p = 0;
  cmd[p++] = 0x00;  // Get Notification Attributes
  cmd[p++] = (uid >> 24) & 0xFF;
  cmd[p++] = (uid >> 16) & 0xFF;
  cmd[p++] = (uid >> 8) & 0xFF;
  cmd[p++] = uid & 0xFF;
  cmd[p++] = 0x00;                                   // AppIdentifier (no length)
  cmd[p++] = 0x01; cmd[p++] = 0x00; cmd[p++] = 0x40;  // Title, max 64
  cmd[p++] = 0x02; cmd[p++] = 0x00; cmd[p++] = 0x40;  // Subtitle, max 64
  cmd[p++] = 0x03; cmd[p++] = 0x00; cmd[p++] = 0xA0;  // Message, max 160
  cmd[p++] = 0x05; cmd[p++] = 0x00; cmd[p++] = 0x28;  // Date, max 40
  ble_gattc_write_flat(conn, hControlPoint_, cmd, p, nullptr, nullptr);
}

void BleAncsClient::onDataSource(const uint8_t* d, uint16_t len) {
  if (reasmLen_ + len > sizeof(reasm_)) {
    reasmLen_ = 0;  // overflow: drop and wait for the next notification
    return;
  }
  memcpy(reasm_ + reasmLen_, d, len);
  reasmLen_ += len;
  parseDataSource();
}

void BleAncsClient::parseDataSource() {
  if (reasmLen_ < 5) return;
  if (reasm_[0] != 0x00) {  // unexpected command id
    reasmLen_ = 0;
    return;
  }
  if (!curHasUid_) return;
  const uint32_t uid =
      ((uint32_t)reasm_[1] << 24) | ((uint32_t)reasm_[2] << 16) | ((uint32_t)reasm_[3] << 8) | reasm_[4];
  curUid_ = uid;

  uint16_t pos = 5;
  bool complete = false;
  while (pos + 3 <= reasmLen_) {
    const uint8_t attr = reasm_[pos];
    const uint16_t alen = ((uint16_t)reasm_[pos + 1] << 8) | reasm_[pos + 2];
    if (pos + 3 + alen > reasmLen_) {
      // Incomplete record: keep only the unparsed tail and wait for more chunks.
      memmove(reasm_, reasm_ + pos, reasmLen_ - pos);
      reasmLen_ -= pos;
      return;
    }
    const uint8_t* data = reasm_ + pos + 3;
    switch (attr) {
      case 0x00:  // AppIdentifier
        strncpy(cur_.app, (const char*)data, sizeof(cur_.app) - 1);
        cur_.app[sizeof(cur_.app) - 1] = '\0';
        break;
      case 0x01:  // Title
        strncpy(cur_.title, (const char*)data, sizeof(cur_.title) - 1);
        cur_.title[sizeof(cur_.title) - 1] = '\0';
        break;
      case 0x02:  // Subtitle — currently folded away; reserved for future display
        break;
      case 0x03:  // Message
        strncpy(cur_.body, (const char*)data, sizeof(cur_.body) - 1);
        cur_.body[sizeof(cur_.body) - 1] = '\0';
        break;
      case 0x05:  // Date — last attribute we request -> response complete
        strncpy(cur_.date, (const char*)data, sizeof(cur_.date) - 1);
        cur_.date[sizeof(cur_.date) - 1] = '\0';
        complete = true;
        break;
      default:
        break;
    }
    pos += 3 + alen;
    if (complete) break;
  }
  if (complete) {
    finalizeNotification(uid);
    reasmLen_ = 0;
    curHasUid_ = false;
    cur_.reset();
  }
}

void BleAncsClient::finalizeNotification(uint32_t uid) {
  cur_.uid = uid;
  cur_.receivedAt = (uint32_t)(esp_timer_get_time() / 1000);
  cur_.read = false;
  enqueue(cur_);
}

void BleAncsClient::enqueue(const PhoneNotification& n) {
  if (queue_) xQueueSend(queue_, &n, 0);
}

int BleAncsClient::drainPending(NotificationStore& store) {
  int added = 0;
  PhoneNotification n;
  if (!queue_) return 0;
  while (xQueueReceive(queue_, &n, 0) == pdTRUE) {
    store.add(n);
    added++;
  }
  return added;
}

#endif  // ONEPAGE_C61
