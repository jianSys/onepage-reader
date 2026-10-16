#pragma once
#include "activities/Activity.h"

/**
 * Month-view calendar. Uses the phone-synced wall clock (HalTime) to open on the
 * current month and highlight today; Up/Down step through months and Confirm jumps
 * back to today. Self-contained date math (Sakamoto day-of-week + days-in-month),
 * so it needs no external calendar library. If the clock was never synced it shows
 * the same "sync first" hint the lock-screen clock uses, since there is no reliable
 * "today" to anchor to.
 */
class CalendarActivity final : public Activity {
 public:
  explicit CalendarActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("Calendar", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&& lock) override;

 private:
  void goToToday();
  void shiftMonth(int delta);

  int viewYear = 2000;
  int viewMonth = 1;  // 1..12
  int todayYear = 0;
  int todayMonth = 0;
  int todayDay = 0;
  bool haveToday = false;  // clock was synced at entry, so today is known
};
