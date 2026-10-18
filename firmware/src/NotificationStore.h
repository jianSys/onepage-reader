#pragma once
#include <cstdint>
#include <cstring>

// One phone notification captured from iOS ANCS. Kept as a fixed-size POD so it
// can be copied through a FreeRTOS queue and stored in a ring buffer.
struct PhoneNotification {
  uint32_t uid = 0;        // ANCS NotificationUID (dedupe key)
  uint8_t category = 0;    // ANCS CategoryID
  uint8_t flags = 0;       // ANCS EventFlags
  uint32_t receivedAt = 0; // ms timestamp when captured
  bool read = false;
  char app[40] = {0};
  char title[64] = {0};
  char body[160] = {0};
  char date[40] = {0};

  void reset() { *this = PhoneNotification{}; }
};

// Fixed-capacity ring buffer of recent notifications, held in RAM. Most recent
// is at index 0 via at().
class NotificationStore {
public:
  static constexpr int kCapacity = 48;

  void add(const PhoneNotification& n);  // replaces entry with same uid
  int count() const { return count_; }
  int unreadCount() const;
  int findUid(uint32_t uid) const;  // -1 if absent
  void markAllRead();
  void clear();

  const PhoneNotification& at(int i) const {
    return items_[(head_ - 1 - i + kCapacity * 2) % kCapacity];
  }
  PhoneNotification& at(int i) { return items_[(head_ - 1 - i + kCapacity * 2) % kCapacity]; }

private:
  PhoneNotification items_[kCapacity];
  int head_ = 0;  // next write slot
  int count_ = 0;
};

extern NotificationStore NOTIFICATION_STORE;
