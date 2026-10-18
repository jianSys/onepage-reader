#pragma once

#include "activities/Activity.h"
#include <cstdint>
#include <string>

// Lists phone notifications captured from iOS ANCS (stored in NOTIFICATION_STORE)
// and shows their detail. Launched from the Tools menu. While this activity is
// foreground the main loop can refresh it live as new alerts arrive.
class NotificationActivity : public Activity {
 public:
  NotificationActivity(GfxRenderer& renderer, MappedInputManager& mappedInput);

  void onEnter() override;
  void onExit() override;
  void loop() override;
  void render(RenderLock&& lock) override;

  // Allow the main loop to refresh the list live while this activity is shown.
  static bool isForeground() { return sForeground != nullptr; }
  static void refreshForeground();

 private:
  enum class View { List, Detail } view_ = View::List;
  int selectorIndex_ = 0;
  uint32_t detailUid_ = 0;  // opened notification; -re-found each render so it
                            // stays valid if the store shifts underneath us

  static NotificationActivity* sForeground;

  void renderList();
  void renderDetail();
  void openDetail(int index);
  void markAllRead();
  void clearAll();
};
