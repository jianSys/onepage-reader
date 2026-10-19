#pragma once

#include <functional>
#include <memory>
#include <vector>

#include "I18n.h"
#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// Sub-hub for reading analytics (P4). Launched from Tools' "Reading Stats" entry; the rows
// are the overview (existing ReadingStatsActivity) plus, as each lands, the heatmap, profile
// and achievements screens. Each row launches its screen as a sub-activity so finishing it
// pops straight back here. Plain Activity: no freeink, no touch, keys only.
class ReadingAnalyticsMenuActivity final : public Activity {
 public:
  explicit ReadingAnalyticsMenuActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("ReadingAnalyticsMenu", renderer, mappedInput) {}
  ~ReadingAnalyticsMenuActivity() override = default;

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  struct Row {
    StrId titleId;
    StrId subtitleId;
    std::function<std::unique_ptr<Activity>(GfxRenderer&, MappedInputManager&)> factory;
  };

  std::vector<Row> rows;
  int selectorIndex = 0;
  ButtonNavigator buttonNavigator;

  void buildItems();
};
