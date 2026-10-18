#include "NotificationStore.h"

NotificationStore NOTIFICATION_STORE;

void NotificationStore::add(const PhoneNotification& n) {
  const int existing = findUid(n.uid);
  if (existing >= 0) {
    items_[existing] = n;  // update in place (keep its position)
    return;
  }
  items_[head_] = n;
  head_ = (head_ + 1) % kCapacity;
  if (count_ < kCapacity) count_++;
}

int NotificationStore::findUid(uint32_t uid) const {
  for (int i = 0; i < count_; i++) {
    const int idx = (head_ - 1 - i + kCapacity * 2) % kCapacity;
    if (items_[idx].uid == uid) return idx;
  }
  return -1;
}

int NotificationStore::unreadCount() const {
  int u = 0;
  for (int i = 0; i < count_; i++) {
    const int idx = (head_ - 1 - i + kCapacity * 2) % kCapacity;
    if (!items_[idx].read) u++;
  }
  return u;
}

void NotificationStore::markAllRead() {
  for (int i = 0; i < count_; i++) {
    const int idx = (head_ - 1 - i + kCapacity * 2) % kCapacity;
    items_[idx].read = true;
  }
}

void NotificationStore::clear() {
  head_ = 0;
  count_ = 0;
  for (int i = 0; i < kCapacity; i++) items_[i].reset();
}
