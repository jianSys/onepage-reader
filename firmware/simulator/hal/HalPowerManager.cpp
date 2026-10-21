// HAL power manager backend stub for the simulator.
// The host has no real power management — battery is fixed, and "deep sleep" is either
// a process exit (native) or a park-until-wakeup (browser).

#include <HalPowerManager.h>

#include "../simulator_config.h"

namespace simulator {
// Defined in hal/HalGPIO.cpp.
void waitForPowerWakeup();
}  // namespace simulator

void HalPowerManager::begin() {}
void HalPowerManager::setPowerSaving(bool) {}
#ifdef __EMSCRIPTEN__
// The page cannot power down, and exiting the runtime would strand it on the sleep frame
// with no way back. Park the firmware thread instead: the browser main thread keeps
// pumping keys and repainting, and control returns to enterDeepSleep()'s resume tail when
// the power button is tapped again.
void HalPowerManager::startDeepSleep(HalGPIO&) const { simulator::waitForPowerWakeup(); }
#else
// Native: exiting the process is the closest thing to a powered-down device.
void HalPowerManager::startDeepSleep(HalGPIO&) const { std::exit(0); }
#endif
uint16_t HalPowerManager::getBatteryPercentage() const { return SIMULATOR_BATTERY_PERCENT; }

HalPowerManager::Lock::Lock() {}
HalPowerManager::Lock::~Lock() {}

HalPowerManager powerManager;
