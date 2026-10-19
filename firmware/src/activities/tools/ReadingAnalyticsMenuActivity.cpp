#include "ReadingAnalyticsMenuActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>
#include <string>

#include "MappedInputManager.h"
#include "AchievementsActivity.h"
#include "ReadingHeatmapActivity.h"
#include "ReadingProfileActivity.h"
#include "ReadingStatsActivity.h"
#include "components/UITheme.h"
#include "fontIds.h"

void ReadingAnalyticsMenuActivity::buildItems() {
  rows.clear();
  rows.push_back({StrId::STR_RS_OVERVIEW, StrId::STR_READING_STATS_HINT,
                  [](GfxRenderer& r, MappedInputManager& i) -> std::unique_ptr<Activity> {
                    return std::make_unique<ReadingStatsActivity>(r, i);
                  }});
  rows.push_back({StrId::STR_RS_HEATMAP, StrId::STR_RS_HEATMAP_HINT,
                  [](GfxRenderer& r, MappedInputManager& i) -> std::unique_ptr<Activity> {
                    return std::make_unique<ReadingHeatmapActivity>(r, i);
                  }});
  rows.push_back({StrId::STR_RS_PROFILE, StrId::STR_RS_PROFILE_HINT,
                  [](GfxRenderer& r, MappedInputManager& i) -> std::unique_ptr<Activity> {
                    return std::make_unique<ReadingProfileActivity>(r, i);
                  }});
  rows.push_back({StrId::STR_RS_ACHIEVEMENTS, StrId::STR_RS_ACHIEVEMENTS_HINT,
                  [](GfxRenderer& r, MappedInputManager& i) -> std::unique_ptr<Activity> {
                    return std::make_unique<AchievementsActivity>(r, i);
                  }});
}

void ReadingAnalyticsMenuActivity::onEnter() {
  Activity::onEnter();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);
  buildItems();
  selectorIndex = 0;
  requestUpdate();
}

void ReadingAnalyticsMenuActivity::loop() {
  const int rowCount = static_cast<int>(rows.size());

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();  // pop back to the tools hub
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    if (selectorIndex >= 0 && selectorIndex < rowCount) {
      auto handler = [this](const ActivityResult&) { requestUpdate(); };
      startActivityForResult(rows[selectorIndex].factory(renderer, mappedInput), std::move(handler));
    }
    return;
  }

  buttonNavigator.onNextRelease([this, rowCount] {
    selectorIndex = ButtonNavigator::nextIndex(selectorIndex, rowCount);
    requestUpdate();
  });
  buttonNavigator.onPreviousRelease([this, rowCount] {
    selectorIndex = ButtonNavigator::previousIndex(selectorIndex, rowCount);
    requestUpdate();
  });
}

void ReadingAnalyticsMenuActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_READING_ANALYTICS));

  const int listTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentHeight = pageHeight - listTop - metrics.buttonHintsHeight - metrics.verticalSpacing;

  GUI.drawList(renderer, Rect{0, listTop, pageWidth, contentHeight}, static_cast<int>(rows.size()), selectorIndex,
               [this](int i) -> std::string { return I18N[rows[i].titleId]; },
               [this](int i) -> std::string { return I18N[rows[i].subtitleId]; },
               [](int) -> UIIcon { return UIIcon::None; }, nullptr);

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
