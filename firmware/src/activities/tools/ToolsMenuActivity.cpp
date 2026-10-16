#include "ToolsMenuActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>
#include <string>

#include "MappedInputManager.h"
#include "PomodoroActivity.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
// Tool rows. Extend by appending here and handling the index in launchTool().
enum ToolRow { ROW_POMODORO = 0, ROW_COUNT };

const char* toolTitle(int row) {
  switch (row) {
    case ROW_POMODORO:
      return tr(STR_POMODORO);
    default:
      return "";
  }
}

const char* toolSubtitle(int row) {
  switch (row) {
    case ROW_POMODORO:
      return tr(STR_POMODORO_HINT);
    default:
      return "";
  }
}
}  // namespace

int ToolsMenuActivity::getToolCount() const { return ROW_COUNT; }

void ToolsMenuActivity::onEnter() {
  Activity::onEnter();
  selectorIndex = 0;
  requestUpdate();
}

void ToolsMenuActivity::loop() {
  const int rows = getToolCount();

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    onGoHome();
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    auto handler = [this](const ActivityResult&) { requestUpdate(); };
    if (selectorIndex == ROW_POMODORO) {
      startActivityForResult(std::make_unique<PomodoroActivity>(renderer, mappedInput), std::move(handler));
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
  const int contentHeight = pageHeight - contentTop - metrics.buttonHintsHeight - metrics.verticalSpacing;

  GUI.drawList(renderer, Rect{0, contentTop, pageWidth, contentHeight}, getToolCount(), selectorIndex,
               [](int index) -> std::string { return toolTitle(index); },
               [](int index) -> std::string { return toolSubtitle(index); },
               [](int) -> UIIcon { return UIIcon::None; }, nullptr);

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
