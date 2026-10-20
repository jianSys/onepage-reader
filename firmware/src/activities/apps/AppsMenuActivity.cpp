#include "AppsMenuActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>
#include <string>

#include "AppGame.h"
#include "MappedInputManager.h"
#include "WordBookStore.h"
#include "activities/wordbook/WordBookActivity.h"
#include "components/UITheme.h"

void AppsMenuActivity::onEnter() {
  Activity::onEnter();
  selectorIndex = 0;

  // One list for both registries. ToolApp and AppGame have the same shape, so a
  // row only ever needs the one type.
  entries = getToolApps();
  for (const auto& game : getGameApps()) {
    entries.push_back({game.titleId, game.subtitleId, game.factory});
  }

  requestUpdate();
}

void AppsMenuActivity::loop() {
  const int rows = getRowCount();

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    onGoHome();
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    if (selectorIndex < 0 || selectorIndex >= rows) return;
    auto handler = [this](const ActivityResult&) {
      // Re-render when a child returns (a finished game clears its save, an added
      // word changes the word book row's badge).
      requestUpdate();
    };
    std::unique_ptr<Activity> child;
    if (isWordBookRow(selectorIndex)) {
      child = std::make_unique<WordBookActivity>(renderer, mappedInput);
    } else {
      child = entries[selectorIndex].factory(renderer, mappedInput);
    }
    startActivityForResult(std::move(child), std::move(handler));
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

  GUI.drawList(
      renderer, Rect{0, listTop, pageWidth, contentHeight}, getRowCount(), selectorIndex,
      [this](int index) -> std::string {
        if (isWordBookRow(index)) return tr(STR_WORD_BOOK);
        return I18N[entries[index].titleId];
      },
      [this](int index) -> std::string {
        if (isWordBookRow(index)) {
          // A count rather than a fixed blurb: it says whether there is anything
          // to review before the reader opens the screen.
          const int due = WORDBOOK.getDueCount();
          return due > 0 ? std::to_string(due) + " " + tr(STR_DUE_TO_REVIEW) : std::string();
        }
        return I18N[entries[index].subtitleId];
      },
      [](int) -> UIIcon { return UIIcon::Apps; }, nullptr);

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
