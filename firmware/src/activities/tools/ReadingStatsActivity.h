#pragma once

#include "activities/Activity.h"

// Read-only view of the accumulated reading statistics tracked by CrossPointState.
// Mirrors crossmux's "reading analytics": a 7-day bar chart plus lifetime totals.
// The C61 keeps a wall clock (internal RTC seeded via the web companion's
// POST /api/set-time or SNTP), so per-day buckets are available once the clock is
// synced; before that, only the lifetime totals are meaningful.
class ReadingStatsActivity : public Activity {
 public:
  ReadingStatsActivity(GfxRenderer& renderer, MappedInputManager& mappedInput);

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  // Formats a duration (seconds) into a compact localized string, e.g.
  // "1h 23m" (en) or "1小时23分" (zh).
  static std::string formatDuration(uint32_t seconds);
};
