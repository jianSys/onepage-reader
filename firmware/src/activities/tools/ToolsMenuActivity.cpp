#include "ToolsMenuActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>
#include <string>

#include "MappedInputManager.h"
#include "ToolApp.h"
#include "ToolsUi.h"
#include "components/UITheme.h"
#include "fontIds.h"

int ToolsMenuActivity::getToolCount() const { return static_cast<int>(getToolApps().size()); }

void ToolsMenuActivity::onEnter() {
  Activity::onEnter();
  selectorIndex = 0;
  requestUpdate();
}

void ToolsMenuActivity::loop() {
  const auto apps = getToolApps();
  const int rows = static_cast<int>(apps.size());

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    onGoHome();
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    auto handler = [this](const ActivityResult&) { requestUpdate(); };
    if (selectorIndex >= 0 && selectorIndex < rows) {
      startActivityForResult(apps[selectorIndex].factory(renderer, mappedInput), std::move(handler));
    }
    return;
  }

  buttonNavigator.onNextRelease([this, rows] {
    selectorIndex = ButtonNavigator::nextIndex(selectorIndex, rows);
    requestUpdate();
  });
  buttonNavigator.onPreviousRelease([this, rows] {
    selectorIndex = ButtonNavigator::previousIndex(selectorIndex, rows);
    requestUpdate();
  });
}

void ToolsMenuActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_TOOLS));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = pageHeight - (metrics.buttonHintsHeight + metrics.verticalSpacing);
  ToolsUi::drawTracked(renderer, SMALL_FONT_ID, ToolsUi::eyebrow(tr(STR_TOOLS), "TOOLS").c_str(),
                       metrics.contentSidePadding, contentTop, 2, true);

  const int listTop = contentTop + 24;
  const int contentHeight = contentBottom - listTop;

  const auto apps = getToolApps();

  GUI.drawList(renderer, Rect{0, listTop, pageWidth, contentHeight}, static_cast<int>(apps.size()), selectorIndex,
               [&apps](int index) -> std::string { return I18N[apps[index].titleId]; },
               [&apps](int index) -> std::string { return I18N[apps[index].subtitleId]; },
               [](int) -> UIIcon { return UIIcon::None; }, nullptr);

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
