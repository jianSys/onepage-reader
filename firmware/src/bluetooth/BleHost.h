#pragma once

// Shared NimBLE host lifecycle.
//
// The ESP32 (C61) radio runs a SINGLE NimBLE host task. The page-turner HID host
// (BleHidHost) and the iOS ANCS client (BleAncsClient) are mutually exclusive —
// only one may use the radio at a time. Both used to call nimble_port_init() /
// nimble_port_freertos_init() independently, which double-initialized the host
// and panicked the device. This module owns the single host task so init happens
// exactly once; each role stops the other before starting itself.
namespace BleHost {

// Start the host task if not already running. Idempotent. Returns 0 on success.
int ensureStarted();

// Fully stop the host task. Idempotent. Returns 0 on success.
int stop();

// True while the shared host task is running.
bool isActive();

}  // namespace BleHost
