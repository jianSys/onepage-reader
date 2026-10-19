#include "AppsMenuActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>
#include <string>

#include "AppGame.h"
#include "MappedInputManager.h"
#include "components/UITheme.h"

void AppsMenuActivity::onEnter() {
  Activity::onEnter();
  selectorIndex = 0;
  requestUpdate();
}

void AppsMenuActivity::loop() {
  const auto apps = getGameApps();
  const int rows = static_cast<int>(apps.size());

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    onGoHome();
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    auto handler = [this](const ActivityResult&) {
      // Re-render when a game returns (e.g. a finished Sudoku clears its save).
      requestUpdate();
    };
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

void AppsMenuActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_APPS));

  const int listTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentHeight = pageHeight - listTop - metrics.buttonHintsHeight - metrics.verticalSpacing;

  const auto apps = getGameApps();

  GUI.drawList(renderer, Rect{0, listTop, pageWidth, contentHeight}, static_cast<int>(apps.size()), selectorIndex,
               [&apps](int index) -> std::string { return I18N[apps[index].titleId]; },
               [&apps](int index) -> std::string { return I18N[apps[index].subtitleId]; },
               [](int) -> UIIcon { return UIIcon::Apps; }, nullptr);

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
