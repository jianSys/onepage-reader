#include "BleHost.h"

#include <nimble/nimble_port.h>
#include <nimble/nimble_port_freertos.h>

namespace {

bool gActive = false;

// The single NimBLE host task. Runs until nimble_port_stop() is called, then
// tears itself down. Both BLE roles reuse this one task.
void hostTask(void* param) {
  (void)param;
  nimble_port_run();
  nimble_port_freertos_deinit();
  gActive = false;
}

}  // namespace

namespace BleHost {

int ensureStarted() {
  if (gActive) return 0;
  const int rc = nimble_port_init();
  if (rc != 0) return rc;
  nimble_port_freertos_init(hostTask);
  gActive = true;
  return 0;
}

int stop() {
  if (!gActive) return 0;
  const int rc = nimble_port_stop();
  gActive = false;
  return rc;
}

bool isActive() { return gActive; }

}  // namespace BleHost
