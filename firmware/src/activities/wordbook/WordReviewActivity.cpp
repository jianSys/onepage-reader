#include "WordReviewActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <string>

#include "MappedInputManager.h"
#include "WordBookStore.h"
#include "components/UITheme.h"
#include "fontIds.h"

void WordReviewActivity::onEnter() {
  Activity::onEnter();
  queue = WORDBOOK.buildReviewQueue();
  position = 0;
  revealed = false;
  finished = queue.empty();
  requestUpdate();
}

void WordReviewActivity::advance() {
  revealed = false;
  ++position;
  if (position >= queue.size()) finished = true;
  requestUpdate();
}

void WordReviewActivity::loop() {
  if (finished) {
    if (mappedInput.wasReleased(MappedInputManager::Button::Confirm) ||
        mappedInput.wasReleased(MappedInputManager::Button::Back)) {
      finish();
    }
    return;
  }

  if (!revealed) {
    if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
      revealed = true;
      requestUpdate();
    } else if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
      finish();
    }
    return;
  }

  // Revealed: grade with NavPrevious (forgot) / NavNext (known); Back bails out.
  buttonNavigator.onNextRelease([this] {
    WORDBOOK.grade(queue[position], true);
    advance();
  });
  buttonNavigator.onPreviousRelease([this] {
    WORDBOOK.grade(queue[position], false);
    advance();
  });
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();
  }
}

void WordReviewActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();
  const int maxWidth = pageWidth - 2 * metrics.contentSidePadding;

  if (finished) {
    GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_REVIEW));
    renderer.drawCenteredText(UI_12_FONT_ID, pageHeight / 2, tr(STR_REVIEW_DONE), true, EpdFontFamily::BOLD);
    const auto labels = mappedInput.mapLabels(tr(STR_BACK), tr(STR_SELECT), "", "");
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
    renderer.displayBuffer();
    return;
  }

  const WordEntry& e = WORDBOOK.getEntries()[queue[position]];
  const std::string progress = std::to_string(position + 1) + " / " + std::to_string(queue.size());
  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_REVIEW),
                 progress.c_str());

  const int centerY = pageHeight / 2;
  const std::string word = renderer.truncatedText(UI_12_FONT_ID, e.word.c_str(), maxWidth, EpdFontFamily::BOLD);
  renderer.drawCenteredText(UI_12_FONT_ID, centerY - 40, word.c_str(), true, EpdFontFamily::BOLD);

  if (revealed) {
    const std::string meaning = renderer.truncatedText(UI_10_FONT_ID, e.meaning.c_str(), maxWidth);
    renderer.drawCenteredText(UI_10_FONT_ID, centerY + 20, meaning.c_str());
    const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", tr(STR_FORGOT), tr(STR_KNOWN));
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
  } else {
    renderer.drawCenteredText(UI_10_FONT_ID, pageHeight - metrics.buttonHintsHeight - 50, tr(STR_REVEAL_HINT));
    const auto labels = mappedInput.mapLabels(tr(STR_BACK), tr(STR_SELECT), "", "");
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
  }

  renderer.displayBuffer();
}
