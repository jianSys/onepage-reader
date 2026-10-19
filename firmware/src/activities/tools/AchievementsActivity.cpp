#include "AchievementsActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <algorithm>
#include <string>

#include "MappedInputManager.h"
#include "components/UITheme.h"
#include "fontIds.h"

void AchievementsActivity::onEnter() {
  Activity::onEnter();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);
  views = ReadingAchievements::buildViews();
  selectorIndex = 0;
  requestUpdate();
}

void AchievementsActivity::loop() {
  const int rowCount = static_cast<int>(views.size());
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();  // pop back to the reading-analytics hub
    return;
  }
  if (rowCount > 0) {
    buttonNavigator.onNextRelease([this, rowCount] {
      selectorIndex = ButtonNavigator::nextIndex(selectorIndex, rowCount);
      requestUpdate();
    });
    buttonNavigator.onPreviousRelease([this, rowCount] {
      selectorIndex = ButtonNavigator::previousIndex(selectorIndex, rowCount);
      requestUpdate();
    });
  }
}

void AchievementsActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  int unlockedCount = 0;
  for (const auto& v : views) {
    if (v.unlocked) ++unlockedCount;
  }
  const std::string subtitle = std::string(tr(STR_RS_ACH_HEADER)) + " " + std::to_string(unlockedCount) + " / " +
                               std::to_string(views.size());
  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_RS_ACHIEVEMENTS),
                 subtitle.c_str());

  const int listTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentHeight = pageHeight - listTop - metrics.buttonHintsHeight - metrics.verticalSpacing;

  GUI.drawList(
      renderer, Rect{0, listTop, pageWidth, contentHeight}, static_cast<int>(views.size()), selectorIndex,
      [this](int i) -> std::string { return I18N[views[i].definition->titleId]; },
      [this](int i) -> std::string { return ReadingAchievements::description(*views[i].definition); },
      [](int) -> UIIcon { return UIIcon::None; },
      [this](int i) -> std::string {
        if (views[i].unlocked) return tr(STR_RS_ACH_DONE);
        const uint64_t pct = views[i].target > 0 ? views[i].progress * 100ULL / views[i].target : 0;
        return std::to_string(std::min<uint64_t>(pct, 100ULL)) + "%";
      },
      false,
      [this](int i) -> bool { return !views[i].unlocked; });

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
