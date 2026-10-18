#include "CalculatorActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <cmath>
#include <cstdio>
#include <string>

#include "MappedInputManager.h"
#include "ToolsUi.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
const char* kKeys[16] = {
    "7", "8", "9", "/",  //
    "4", "5", "6", "*",  //
    "1", "2", "3", "-",  //
    "0", "C", "=", "+",  //
};
}  // namespace

CalculatorActivity::CalculatorActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
    : Activity("CalculatorActivity", renderer, mappedInput) {}

void CalculatorActivity::onEnter() {
  Activity::onEnter();
  requestUpdate();
}

void CalculatorActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    pressKey(cursor_);
    requestUpdate();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Left)) {
    cursor_ = (cursor_ + 15) % 16;
    requestUpdate();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Right)) {
    cursor_ = (cursor_ + 1) % 16;
    requestUpdate();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Up)) {
    cursor_ = (cursor_ + 12) % 16;
    requestUpdate();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Down)) {
    cursor_ = (cursor_ + 4) % 16;
    requestUpdate();
    return;
  }
}

void CalculatorActivity::pressKey(int index) {
  const char* k = kKeys[index];
  const char ch = k[0];
  if (ch >= '0' && ch <= '9') {
    const int d = ch - '0';
    if (justEvaluated_) {
      current_ = 0;
      justEvaluated_ = false;
    }
    current_ = current_ * 10 + d;
    entering_ = true;
  } else if (ch == 'C') {
    result_ = 0;
    current_ = 0;
    pendingOp_ = 0;
    entering_ = false;
    justEvaluated_ = false;
  } else if (ch == '=') {
    if (pendingOp_ != 0) {
      result_ = apply(result_, pendingOp_, current_);
      pendingOp_ = 0;
      current_ = result_;
      entering_ = false;
      justEvaluated_ = true;
    }
  } else {  // operator + - * /
    if (entering_) {
      if (pendingOp_ != 0) {
        result_ = apply(result_, pendingOp_, current_);
      } else {
        result_ = current_;
      }
      current_ = 0;
      entering_ = false;
    }
    // When not entering, keep result_ (handles repeated operators / chaining after '=').
    pendingOp_ = ch;
    justEvaluated_ = false;
  }
}

double CalculatorActivity::apply(double a, char op, double b) const {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b != 0 ? a / b : 0;
  }
  return b;
}

std::string CalculatorActivity::displayText() const {
  const double shown = entering_ ? current_ : result_;
  const long long iv = static_cast<long long>(shown);
  if (std::abs(shown - iv) < 1e-9) return std::to_string(iv);
  char buf[32];
  snprintf(buf, sizeof(buf), "%.4g", shown);
  return std::string(buf);
}

void CalculatorActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_CALCULATOR));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = pageHeight - (metrics.buttonHintsHeight + metrics.verticalSpacing);
  const int cardX = 14;
  const int cardW = pageWidth - cardX * 2;
  const int pad = 16;

  // ---- display card ----
  const int dispH = 104;
  const int dispBottom = contentTop + dispH;
  ToolsUi::drawCard(renderer, cardX, contentTop, cardW, dispH, 10);
  ToolsUi::drawTracked(renderer, SMALL_FONT_ID,
                       ToolsUi::eyebrow(tr(STR_CALCULATOR), "CALCULATOR").c_str(), cardX + pad, contentTop + 14, 2, true);

  const std::string text = displayText();
  const int valFont = NOTOSERIF_18_FONT_ID;
  const int valW = renderer.getTextWidth(valFont, text.c_str());
  const int valH = renderer.getLineHeight(valFont);
  const int valX = cardX + cardW - pad - valW;
  const int valY = contentTop + dispH - pad - valH;
  renderer.drawText(valFont, valX, valY, text.c_str(), true, EpdFontFamily::BOLD);

  // ---- key grid ----
  const int gridTop = dispBottom + 16;
  const int gridH = contentBottom - gridTop;
  const int gap = 10;
  const int cellW = (cardW - gap * (kCols - 1)) / kCols;
  const int cellH = (gridH - gap * (kRows - 1)) / kRows;
  const int keyFont = UI_12_FONT_ID;

  for (int i = 0; i < 16; i++) {
    const int r = i / kCols;
    const int c = i % kCols;
    const int x = cardX + c * (cellW + gap);
    const int y = gridTop + r * (cellH + gap);
    const bool selected = (i == cursor_);
    const std::string lbl = kKeys[i];
    const int lw = renderer.getTextWidth(keyFont, lbl.c_str());
    const int lh = renderer.getLineHeight(keyFont);

    if (selected) {
      renderer.fillRoundedRect(x, y, cellW, cellH, 8, Color::Black);
      renderer.drawText(keyFont, x + (cellW - lw) / 2, y + (cellH - lh) / 2, lbl.c_str(), false);
    } else {
      ToolsUi::drawCard(renderer, x, y, cellW, cellH, 8);
      renderer.drawText(keyFont, x + (cellW - lw) / 2, y + (cellH - lh) / 2, lbl.c_str(), true);
    }
  }

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
