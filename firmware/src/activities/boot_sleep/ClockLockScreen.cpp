#include "ClockLockScreen.h"

#include <Arduino.h>
#include <GfxRenderer.h>
#include <HalDisplay.h>
#include <HalTime.h>
#include <I18n.h>

#include <cstdio>

#include "CrossPointSettings.h"
#include "fontIds.h"

namespace {
// Ignore button releases for this long after entering, so the power-button
// release that launched the clock doesn't instantly pop back off the stack.
constexpr unsigned long EXIT_GRACE_MS = 700;
// Sample the wall clock a few times a minute; only a real minute change redraws.
constexpr unsigned long POLL_INTERVAL_MS = 500;

// Seven-segment on/off patterns. Bits: a=0 b=1 c=2 d=3 e=4 f=5 g=6.
//      aaa
//     f   b
//      ggg
//     e   c
//      ddd
constexpr uint8_t kSegDigit[10] = {0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
                                   0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111};

// Draw one seven-segment digit from solid rectangles. (x,y) is the top-left of
// the w*h cell; t is the bar thickness. 1-bit e-ink reads solid bars cleanly.
void drawSegDigit(const GfxRenderer& r, int x, int y, int w, int h, int t, uint8_t pattern) {
  const int half = h / 2;
  const int vLen = half - t * 3 / 2;  // vertical bar length between horizontal bars
  if (vLen < t) return;                // cell too small to draw cleanly
  if (pattern & (1 << 0)) r.fillRect(x + t, y, w - 2 * t, t);                 // a top
  if (pattern & (1 << 6)) r.fillRect(x + t, y + half - t / 2, w - 2 * t, t);  // g middle
  if (pattern & (1 << 3)) r.fillRect(x + t, y + h - t, w - 2 * t, t);         // d bottom
  if (pattern & (1 << 5)) r.fillRect(x, y + t, t, vLen);                      // f top-left
  if (pattern & (1 << 1)) r.fillRect(x + w - t, y + t, t, vLen);              // b top-right
  if (pattern & (1 << 4)) r.fillRect(x, y + half + t / 2, t, vLen);           // e bottom-left
  if (pattern & (1 << 2)) r.fillRect(x + w - t, y + half + t / 2, t, vLen);   // c bottom-right
}

// The ':' separator: two squares stacked around the vertical centre.
void drawSegColon(const GfxRenderer& r, int x, int y, int h, int t) {
  r.fillRect(x, y + h * 30 / 100, t, t);
  r.fillRect(x, y + h * 58 / 100, t, t);
}

constexpr StrId kWEEKDAY[7] = {StrId::STR_WEEKDAY_SUN, StrId::STR_WEEKDAY_MON, StrId::STR_WEEKDAY_TUE,
                               StrId::STR_WEEKDAY_WED, StrId::STR_WEEKDAY_THU, StrId::STR_WEEKDAY_FRI,
                               StrId::STR_WEEKDAY_SAT};
}  // namespace

void ClockLockScreen::onEnter() {
  Activity::onEnter();
  enteredAtMs = millis();
  lastPollMs = enteredAtMs;
  lastShownMinute = -1;
  lastShownValid = false;
  requestUpdate(true);  // immediate first paint so the clock appears right away
}

void ClockLockScreen::loop() {
  const unsigned long now = millis();

  // Exit on any button release once the launch-grace window has elapsed.
  if (now - enteredAtMs >= EXIT_GRACE_MS && mappedInput.wasAnyReleased()) {
    finish();
    return;
  }

  // Throttle time sampling; only redraw when the minute actually rolls over.
  if (now - lastPollMs < POLL_INTERVAL_MS) return;
  lastPollMs = now;

  HalTime::DateTime dt{};
  const bool valid = HalTime::getLocalDateTime(dt, SETTINGS.clockTzOffsetMin);
  if (valid != lastShownValid || (valid && dt.minute != lastShownMinute)) {
    lastShownValid = valid;
    lastShownMinute = valid ? dt.minute : -1;
    requestUpdate(false);  // deferred render happens in ActivityManager::loop()
  }
}

bool ClockLockScreen::shouldIdleSleep() const {
  const unsigned long idleMs = SETTINGS.getLockScreenIdleMs();
  if (idleMs == 0) return false;  // "Never" — keep the clock alive indefinitely
  return millis() - enteredAtMs >= idleMs;
}

void ClockLockScreen::render(RenderLock&& /*lock*/) {
  const int sw = renderer.getScreenWidth();
  const int sh = renderer.getScreenHeight();
  renderer.clearScreen();

  HalTime::DateTime dt{};
  const bool valid = HalTime::getLocalDateTime(dt, SETTINGS.clockTzOffsetMin);
  const uint8_t style = SETTINGS.lockScreenStyle;

  // Localized "date + weekday" line, shared by the clock+date and dashboard styles.
  char dateBuf[32] = "";
  if (valid) {
    std::snprintf(dateBuf, sizeof(dateBuf), tr(STR_LOCK_DATE_FORMAT), dt.month, dt.day,
                  I18N.get(kWEEKDAY[dt.weekday % 7]));
  }

  if (style == CrossPointSettings::LSK_DASHBOARD && valid) {
    // Oversized seven-segment clock — the only way to get large digits here,
    // since the biggest built-in font is 18pt. Size the digit cell to the screen,
    // shrinking until "88:88" fits within ~90% of the width.
    int ch = sh / 4;
    if (ch > 170) ch = 170;
    if (ch < 60) ch = 60;
    int w = ch, t = 6, gap = 8, colonW = 6, colonGap = 4, span = 0;
    for (int i = 0; i < 8; ++i) {
      w = ch * 3 / 5;
      t = ch / 10;
      if (t < 5) t = 5;
      gap = w / 3;
      colonW = t;
      colonGap = gap / 2;
      span = 4 * w + 2 * gap + 2 * colonGap + colonW;
      if (span <= sw * 9 / 10) break;
      ch = ch * 9 / 10;
    }
    const int clockY = sh / 2 - ch / 2 - sh / 12;
    int x = (sw - span) / 2;
    const int d[4] = {dt.hour / 10, dt.hour % 10, dt.minute / 10, dt.minute % 10};
    drawSegDigit(renderer, x, clockY, w, ch, t, kSegDigit[d[0]]);
    x += w + gap;
    drawSegDigit(renderer, x, clockY, w, ch, t, kSegDigit[d[1]]);
    x += w + colonGap;
    drawSegColon(renderer, x, clockY, ch, t);
    x += colonW + colonGap;
    drawSegDigit(renderer, x, clockY, w, ch, t, kSegDigit[d[2]]);
    x += w + gap;
    drawSegDigit(renderer, x, clockY, w, ch, t, kSegDigit[d[3]]);
    renderer.drawCenteredText(NOTOSANS_18_FONT_ID, clockY + ch + 16, dateBuf, true, EpdFontFamily::BOLD);
  } else {
    // Compact styles: a single centred HH:MM line.
    char buf[8];
    if (valid) {
      std::snprintf(buf, sizeof(buf), "%02d:%02d", dt.hour, dt.minute);
    } else {
      std::snprintf(buf, sizeof(buf), "--:--");
    }
    renderer.drawCenteredText(NOTOSANS_18_FONT_ID, sh / 2 - 18, buf, true, EpdFontFamily::BOLD);

    if (!valid) {
      renderer.drawCenteredText(UI_10_FONT_ID, sh / 2 + 24, tr(STR_CLOCK_NEED_SYNC));
    } else if (style == CrossPointSettings::LSK_CLOCK_DATE) {
      renderer.drawCenteredText(UI_10_FONT_ID, sh / 2 + 24, dateBuf);
    }
  }

  renderer.drawCenteredText(SMALL_FONT_ID, sh - 40, tr(STR_PRESS_ANY_KEY));
  renderer.displayBuffer(HalDisplay::HALF_REFRESH);
}
