#include "WordBookActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>
#include <string>
#include <vector>

#include "MappedInputManager.h"
#include "WordBookStore.h"
#include "activities/util/ConfirmationActivity.h"
#include "activities/util/KeyboardEntryActivity.h"
#include "activities/wordbook/WordReviewActivity.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
// Hold threshold for the long-press "delete word" action (firmware convention).
constexpr unsigned long LONG_PRESS_MS = 1000;
// Virtual rows before the word list.
constexpr int ACTION_ROWS = 2;
constexpr int ROW_REVIEW = 0;
constexpr int ROW_ADD = 1;
}  // namespace

int WordBookActivity::getRowCount() const { return ACTION_ROWS + WORDBOOK.getCount(); }

void WordBookActivity::onEnter() {
  Activity::onEnter();
  selectorIndex = 0;
  pendingWord.clear();
  requestUpdate();
}

void WordBookActivity::loop() {
  const int rows = getRowCount();
  if (selectorIndex >= rows) selectorIndex = rows - 1;
  if (selectorIndex < 0) selectorIndex = 0;

  const int pageItems = UITheme::getInstance().getNumberOfItemsPerPage(renderer, true, false, true, true);

  // Swallow input until Confirm is released after a long-press fired, so the
  // release doesn't also trigger the row action.
  if (longPressFired) {
    if (!mappedInput.isPressed(MappedInputManager::Button::Confirm)) {
      longPressFired = false;
    }
    return;
  }

  const bool onWordRow = selectorIndex >= ACTION_ROWS;

  // Long-press Confirm on a word row: prompt to delete it.
  if (onWordRow && mappedInput.isPressed(MappedInputManager::Button::Confirm) &&
      mappedInput.getHeldTime() >= LONG_PRESS_MS) {
    longPressFired = true;
    promptDeleteWord(selectorIndex - ACTION_ROWS);
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    if (selectorIndex == ROW_REVIEW) {
      startReview();
      return;
    }
    if (selectorIndex == ROW_ADD) {
      startAddWord();
      return;
    }
    // Single tap on a word row is a no-op in this MVP.
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    onGoHome();
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
  buttonNavigator.onNextContinuous([this, rows, pageItems] {
    selectorIndex = ButtonNavigator::nextPageIndex(selectorIndex, rows, pageItems);
    requestUpdate();
  });
  buttonNavigator.onPreviousContinuous([this, rows, pageItems] {
    selectorIndex = ButtonNavigator::previousPageIndex(selectorIndex, rows, pageItems);
    requestUpdate();
  });
}

void WordBookActivity::startReview() {
  auto handler = [this](const ActivityResult&) { requestUpdate(); };
  startActivityForResult(std::make_unique<WordReviewActivity>(renderer, mappedInput), std::move(handler));
}

void WordBookActivity::startAddWord() {
  // First prompt: the word. On confirm we chain to the meaning prompt.
  auto wordHandler = [this](const ActivityResult& result) {
    if (result.isCancelled) return;
    pendingWord = std::get<KeyboardResult>(result.data).text;
    if (pendingWord.empty()) return;

    auto meaningHandler = [this](const ActivityResult& mresult) {
      if (mresult.isCancelled) {
        pendingWord.clear();
        return;
      }
      const std::string meaning = std::get<KeyboardResult>(mresult.data).text;
      WORDBOOK.addWord(pendingWord, meaning);
      pendingWord.clear();
      requestUpdate();
    };
    startActivityForResult(std::make_unique<KeyboardEntryActivity>(renderer, mappedInput, tr(STR_MEANING_LABEL),
                                                                   std::string(), 127, InputType::Text),
                           std::move(meaningHandler));
  };
  startActivityForResult(std::make_unique<KeyboardEntryActivity>(renderer, mappedInput, tr(STR_WORD_LABEL),
                                                                 std::string(), 32, InputType::Text),
                         std::move(wordHandler));
}

void WordBookActivity::promptDeleteWord(int entryIndex) {
  auto handler = [this, entryIndex](const ActivityResult& res) {
    if (res.isCancelled) return;
    if (WORDBOOK.removeAt(entryIndex)) {
      const int rows = getRowCount();
      if (selectorIndex >= rows) selectorIndex = rows - 1;
      if (selectorIndex < ACTION_ROWS) selectorIndex = ACTION_ROWS - 1;  // keep on Add row when list shrinks
      requestUpdate(true);
    }
  };
  const std::string word = WORDBOOK.getEntries()[entryIndex].word;
  startActivityForResult(
      std::make_unique<ConfirmationActivity>(renderer, mappedInput, tr(STR_DELETE_WORD_PROMPT), word),
      std::move(handler));
}

void WordBookActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_WORD_BOOK));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentHeight = pageHeight - contentTop - metrics.buttonHintsHeight - metrics.verticalSpacing;

  const auto& entries = WORDBOOK.getEntries();
  const int rows = getRowCount();
  const int due = WORDBOOK.getDueCount();

  GUI.drawList(
      renderer, Rect{0, contentTop, pageWidth, contentHeight}, rows, selectorIndex,
      [&](int index) -> std::string {
        if (index == ROW_REVIEW) return tr(STR_REVIEW);
        if (index == ROW_ADD) return tr(STR_ADD_WORD);
        return entries[index - ACTION_ROWS].word;
      },
      [&](int index) -> std::string {
        if (index == ROW_REVIEW) {
          if (entries.empty()) return std::string();  // nothing to review yet
          return std::to_string(due) + " " + tr(STR_DUE_TO_REVIEW);
        }
        if (index == ROW_ADD) return std::string();
        return entries[index - ACTION_ROWS].meaning;
      },
      [](int) -> UIIcon { return UIIcon::None; },
      [&](int index) -> std::string {
        if (index >= ACTION_ROWS) return "B" + std::to_string(entries[index - ACTION_ROWS].box);
        return std::string();
      });

  if (entries.empty()) {
    renderer.drawText(UI_10_FONT_ID, metrics.contentSidePadding, contentTop + contentHeight / 2, tr(STR_NO_WORDS_YET));
  }

  const bool onWordRow = selectorIndex >= ACTION_ROWS;
  const auto labels =
      mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), onWordRow ? tr(STR_DELETE) : tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  renderer.displayBuffer();
}
