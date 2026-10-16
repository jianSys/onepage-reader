#include "Activity.h"

#include <CrossPointSettings.h>

#include "ActivityManager.h"

void Activity::onEnter() { LOG_DBG("ACT", "Entering activity: %s", name.c_str()); }

void Activity::onExit() { LOG_DBG("ACT", "Exiting activity: %s", name.c_str()); }

void Activity::requestUpdate(bool immediate) { activityManager.requestUpdate(immediate); }

void Activity::requestUpdateAndWait() { activityManager.requestUpdateAndWait(); }

void Activity::onGoHome(HomeMenuItem item) { activityManager.goHome(item); }

void Activity::displayUiBuffer() const {
  // Menu/list redraws run on the FAST LUT for responsiveness; the moving
  // inverted selection accumulates ghosting, so every N redraws we scrub with
  // a HALF refresh (same spirit as the readers' per-page cycle). N reuses the
  // reader's refresh-frequency knob but is clamped to >= 8 so an aggressive
  // "1 page" setting doesn't turn every keypress into a slow ~1.7s flash.
  static int fastRefreshCount = 0;
  int period = SETTINGS.getRefreshFrequency();
  if (period < 8) period = 8;

  if (fastRefreshCount >= period) {
    renderer.displayBuffer(HalDisplay::HALF_REFRESH);
    fastRefreshCount = 0;
  } else {
    renderer.displayBuffer();
    fastRefreshCount++;
  }
}

void Activity::onSelectBook(const std::string& path) { activityManager.goToReader(path); }

void Activity::startActivityForResult(std::unique_ptr<Activity>&& activity, ActivityResultHandler resultHandler) {
  this->resultHandler = std::move(resultHandler);
  activityManager.pushActivity(std::move(activity));
}

void Activity::setResult(ActivityResult&& result) { this->result = std::move(result); }

void Activity::finish() { activityManager.popActivity(); }
