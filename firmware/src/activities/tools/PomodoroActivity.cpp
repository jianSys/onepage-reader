#include "PomodoroActivity.h"

#include <Arduino.h>
#include <GfxRenderer.h>
#include <HalDisplay.h>
#include <I18n.h>

#include <algorithm>

#include "MappedInputManager.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
// Sample the countdown a couple of times a second; only a minute rollover (or
// reaching zero) repaints the panel.
constexpr unsigned long POLL_INTERVAL_MS = 500;
constexpr int MIN_MINUTES = 1;
constexpr int MAX_MINUTES = 99;

// Seven-segment on/off patterns. Bits: a=0 b=1 c=2 d=3 e=4 f=5 g=6.
constexpr uint8_t kSegDigit[10] = {0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
                                   0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111};

// Draw one seven-segment digit from solid rectangles. (x,y) is the top-left of the
// w*h cell; t is the bar thickness. 1-bit e-ink reads solid bars cleanly.
void drawSegDigit(const GfxRenderer& r, int x, int y, int w, int h, int t, uint8_t pattern) {
  const int half = h / 2;
  const int vLen = half - t * 3 / 2;  // vertical bar length between horizontal bars
  if (vLen < t) return;               // cell too small to draw cleanly
  if (pattern & (1 << 0)) r.fillRect(x + t, y, w - 2 * t, t);                 // a top
  if (pattern & (1 << 6)) r.fillRect(x + t, y + half - t / 2, w - 2 * t, t);  // g middle
  if (pattern & (1 << 3)) r.fillRect(x + t, y + h - t, w - 2 * t, t);         // d bottom
  if (pattern & (1 << 5)) r.fillRect(x, y + t, t, vLen);                      // f top-left
  if (pattern & (1 << 1)) r.fillRect(x + w - t, y + t, t, vLen);              // b top-right
  if (pattern & (1 << 4)) r.fillRect(x, y + half + t / 2, t, vLen);           // e bottom-left
  if (pattern & (1 << 2)) r.fillRect(x + w - t, y + half + t / 2, t, vLen);   // c bottom-right
}

// Draw a two-digit value (0..99) centred horizontally, using cells of height ch.
// Returns the y just below the digits.
int drawBigMinutes(const GfxRenderer& r, int sw, int centerY, int value, int ch) {
  const int w = ch * 3 / 5;
  int t = ch / 10;
  if (t < 6) t = 6;
  const int gap = w / 3;
  const int span = 2 * w + gap;
  const int y = centerY - ch / 2;
  int x = (sw - span) / 2;
  const int tens = (value / 10) % 10;
  const int ones = value % 10;
  drawSegDigit(r, x, y, w, ch, t, kSegDigit[tens]);
  x += w + gap;
  drawSegDigit(r, x, y, w, ch, t, kSegDigit[ones]);
  return y + ch;
}
}  // namespace

unsigned long PomodoroActivity::totalMs() const { return static_cast<unsigned long>(durationMin) * 60000UL; }

unsigned long PomodoroActivity::elapsedMs() const {
  if (state == State::Running) return accumulatedMs + (millis() - runAnchorMs);
  return accumulatedMs;
}

unsigned long PomodoroActivity::remainingMs() const {
  const unsigned long total = totalMs();
  const unsigned long elapsed = elapsedMs();
  return total > elapsed ? total - elapsed : 0;
}

int PomodoroActivity::minutesToDisplay() const {
  switch (state) {
    case State::Idle:
      return durationMin;
    case State::Done:
      return 0;
    default: {
      const unsigned long rem = remainingMs();
      const int minutes = static_cast<int>((rem + 59999UL) / 60000UL);  // ceil, so "25" holds until 24:00
      return std::clamp(minutes, 0, MAX_MINUTES);
    }
  }
}

void PomodoroActivity::startCountdown() {
  accumulatedMs = 0;
  runAnchorMs = millis();
  state = State::Running;
  lastShownMinute = -1;
  requestUpdate(true);
}

void PomodoroActivity::pauseCountdown() {
  accumulatedMs = elapsedMs();
  state = State::Paused;
  requestUpdate(true);
}

void PomodoroActivity::resumeCountdown() {
  runAnchorMs = millis();
  state = State::Running;
  lastShownMinute = -1;
  requestUpdate(true);
}

void PomodoroActivity::resetToConfig() {
  accumulatedMs = 0;
  state = State::Idle;
  lastShownMinute = -1;
  requestUpdate(true);
}

void PomodoroActivity::onEnter() {
  Activity::onEnter();
  state = State::Idle;
  accumulatedMs = 0;
  lastShownMinute = -1;
  requestUpdate(true);
}

void PomodoroActivity::loop() {
  const unsigned long now = millis();

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    switch (state) {
      case State::Idle:
        startCountdown();
        break;
      case State::Running:
        pauseCountdown();
        break;
      case State::Paused:
        resumeCountdown();
        break;
      case State::Done:
        resetToConfig();
        break;
    }
    return;
  }

  // Duration is only editable while stopped or paused; the countdown itself must
  // stay locked so the remaining time can't jump under the user.
  if (state == State::Idle || state == State::Paused) {
    bool changed = false;
    if (mappedInput.wasReleased(MappedInputManager::Button::Up)) {
      durationMin = std::min(durationMin + 1, MAX_MINUTES);
      changed = true;
    }
    if (mappedInput.wasReleased(MappedInputManager::Button::Down)) {
      durationMin = std::max(durationMin - 1, MIN_MINUTES);
      changed = true;
    }
    if (changed) {
      lastShownMinute = -1;
      requestUpdate();
      return;
    }
  }

  if (state != State::Running) return;

  // Throttle sampling; repaint only when the shown minute rolls over or we finish.
  if (now - lastPollMs < POLL_INTERVAL_MS) return;
  lastPollMs = now;

  const unsigned long rem = remainingMs();
  if (rem == 0) {
    state = State::Done;
    lastShownMinute = 0;
    requestUpdate(false);
    return;
  }
  const int minutes = static_cast<int>((rem + 59999UL) / 60000UL);
  if (minutes != lastShownMinute) {
    lastShownMinute = minutes;
    requestUpdate(false);
  }
}

void PomodoroActivity::render(RenderLock&& /*lock*/) {
  const int sw = renderer.getScreenWidth();
  const int sh = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();
  renderer.clearScreen();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, sw, metrics.headerHeight}, tr(STR_POMODORO));

  const int availTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int availBottom = sh - metrics.buttonHintsHeight - metrics.verticalSpacing;
  const int availH = std::max(1, availBottom - availTop);

  // Status line (what the timer is doing right now).
  const char* status = nullptr;
  switch (state) {
    case State::Idle:
      status = tr(STR_POMODORO_SET);
      break;
    case State::Running:
      status = tr(STR_FOCUSING);
      break;
    case State::Paused:
      status = tr(STR_PAUSED);
      break;
    case State::Done:
      status = tr(STR_TIME_UP);
      break;
  }
  const int statusLineH = renderer.getLineHeight(UI_10_FONT_ID);
  const int statusY = availTop + statusLineH;  // drawCenteredText uses the baseline-ish top
  renderer.drawCenteredText(UI_10_FONT_ID, availTop, status, true, EpdFontFamily::BOLD);

  // Oversized minutes: cap the cell to what's left after the status/unit lines.
  int ch = availH / 2;
  if (ch > 200) ch = 200;
  if (ch < 80) ch = 80;
  const int digitsCenter = statusY + 12 + ch / 2;
  const int belowDigits = drawBigMinutes(renderer, sw, digitsCenter, minutesToDisplay(), ch);

  // Unit label under the big number.
  const int unitY = belowDigits + 8;
  renderer.drawCenteredText(UI_10_FONT_ID, unitY, tr(STR_MINUTES));

  // Progress bar once a countdown has started (shows elapsed fraction).
  if (state != State::Idle) {
    const int barY = unitY + statusLineH + 12;
    const int barH = metrics.progressBarHeight > 0 ? metrics.progressBarHeight : 12;
    const int barW = sw * 4 / 5;
    const int barX = (sw - barW) / 2;
    renderer.drawRect(barX, barY, barW, barH, true);
    const unsigned long total = totalMs() > 0 ? totalMs() : 1;
    int filled = static_cast<int>(static_cast<unsigned long>(barW - 4) * std::min(elapsedMs(), total) / total);
    if (filled > 0) renderer.fillRect(barX + 2, barY + 2, filled, barH - 4, true);
  }

  // Button hints by state.
  const char* upLabel = (state == State::Idle || state == State::Paused) ? tr(STR_MINUTES) : "";
  const char* downLabel = upLabel;
  const char* confirmLabel = nullptr;
  switch (state) {
    case State::Idle:
      confirmLabel = tr(STR_START);
      break;
    case State::Running:
      confirmLabel = tr(STR_PAUSE);
      break;
    case State::Paused:
      confirmLabel = tr(STR_RESUME);
      break;
    case State::Done:
      confirmLabel = tr(STR_RESTART);
      break;
  }
  const auto labels = mappedInput.mapLabels(tr(STR_HOME), confirmLabel, upLabel, downLabel);
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  renderer.displayBuffer(HalDisplay::HALF_REFRESH);
}
