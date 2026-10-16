#include "CalendarActivity.h"

#include <GfxRenderer.h>
#include <HalTime.h>
#include <I18n.h>

#include <algorithm>
#include <cstdio>

#include "CrossPointSettings.h"
#include "MappedInputManager.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
constexpr int COLS = 7;

// Tomohiko Sakamoto's algorithm: day of week for y-m-d, 0 = Sunday .. 6 = Saturday.
int dayOfWeek(int y, int m, int d) {
  static const int t[12] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) y -= 1;
  return static_cast<int>((y + y / 4 - y / 100 + y / 400 + t[m - 1] + d) % 7);
}

bool isLeap(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }

int daysInMonth(int y, int m) {
  static const int dim[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  if (m == 2 && isLeap(y)) return 29;
  return dim[m - 1];
}

// Which weekday sits in column 0. Chinese locales conventionally start the week on
// Monday; English (US) on Sunday. dayOfWeek()/struct tm use 0 = Sunday .. 6 = Saturday.
int weekStartColumn() {
  const Language lang = I18N.getLanguage();
  return (lang == Language::ZH_HANS || lang == Language::ZH_HANT) ? 1 : 0;
}

// Short weekday labels, Sunday-first to match dayOfWeek()/tm_wday. Drawn as the
// grid's header row; reuse of the lock-screen weekday strings keeps the wording
// consistent and needs no new art.
constexpr StrId kWEEKDAY[7] = {StrId::STR_WEEKDAY_SUN, StrId::STR_WEEKDAY_MON, StrId::STR_WEEKDAY_TUE,
                               StrId::STR_WEEKDAY_WED, StrId::STR_WEEKDAY_THU, StrId::STR_WEEKDAY_FRI,
                               StrId::STR_WEEKDAY_SAT};

// Horizontally centre `text` within a column of width colW starting at x0.
void drawInColumn(const GfxRenderer& r, int fontId, int x0, int colW, int y, const char* text, bool black) {
  const int w = r.getTextWidth(fontId, text);
  r.drawText(fontId, x0 + (colW - w) / 2, y, text, black);
}
}  // namespace

void CalendarActivity::onEnter() {
  Activity::onEnter();
  HalTime::DateTime dt{};
  haveToday = HalTime::getLocalDateTime(dt, SETTINGS.clockTzOffsetMin);
  if (haveToday) {
    todayYear = dt.year;
    todayMonth = dt.month;
    todayDay = dt.day;
    viewYear = todayYear;
    viewMonth = todayMonth;
  }
  requestUpdate(true);
}

void CalendarActivity::goToToday() {
  if (!haveToday) return;
  viewYear = todayYear;
  viewMonth = todayMonth;
  requestUpdate();
}

void CalendarActivity::shiftMonth(int delta) {
  int idx = viewYear * 12 + (viewMonth - 1) + delta;
  if (idx < 0) return;  // no years below 0 AD
  viewYear = idx / 12;
  viewMonth = idx % 12 + 1;
  requestUpdate();
}

void CalendarActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    goToToday();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Up)) {
    shiftMonth(1);
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Down)) {
    shiftMonth(-1);
    return;
  }
}

void CalendarActivity::render(RenderLock&& /*lock*/) {
  const int sw = renderer.getScreenWidth();
  const int sh = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();
  renderer.clearScreen();

  char period[32] = "";
  if (haveToday) {
    std::snprintf(period, sizeof(period), tr(STR_CALENDAR_TITLE_FMT), viewYear, viewMonth);
  }
  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, sw, metrics.headerHeight}, tr(STR_CALENDAR),
                 haveToday ? period : nullptr);

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = sh - metrics.buttonHintsHeight - metrics.verticalSpacing;
  const Rect content{0, contentTop, sw, std::max(1, contentBottom - contentTop)};

  const auto labels = haveToday ? mappedInput.mapLabels(tr(STR_HOME), tr(STR_TODAY), tr(STR_DIR_UP), tr(STR_DIR_DOWN))
                                : mappedInput.mapLabels(tr(STR_HOME), "", "", "");
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  if (!haveToday) {
    GUI.drawEmptyState(renderer, content, UIIcon::None, tr(STR_CLOCK_NEED_SYNC));
    renderer.displayBuffer(HalDisplay::HALF_REFRESH);
    return;
  }

  const int fontId = UI_10_FONT_ID;
  const int lineH = renderer.getLineHeight(fontId);
  const int weekStart = weekStartColumn();  // 0 = Sunday-first (EN), 1 = Monday-first (zh)

  // Weekday header row, ordered from the locale's first weekday.
  const int gridW = (sw / COLS) * COLS;
  const int gridX0 = (sw - gridW) / 2;
  const int colW = gridW / COLS;
  const int headerY = content.y;
  for (int slot = 0; slot < COLS; ++slot) {
    const int dow = (weekStart + slot) % COLS;
    drawInColumn(renderer, fontId, gridX0 + slot * colW, colW, headerY, I18N.get(kWEEKDAY[dow]), true);
  }

  // Day grid: up to 6 rows below the header.
  const int gridTop = headerY + lineH + metrics.verticalSpacing;
  const int rowH = std::max(lineH + 4, (content.y + content.height - gridTop) / 6);
  const int firstCol = (dayOfWeek(viewYear, viewMonth, 1) - weekStart + COLS) % COLS;
  const int dim = daysInMonth(viewYear, viewMonth);
  const bool viewingToday = (viewYear == todayYear && viewMonth == todayMonth);

  char numBuf[4];
  for (int d = 1; d <= dim; ++d) {
    const int cell = firstCol + (d - 1);
    const int row = cell / COLS;
    const int col = cell % COLS;
    const int cx = gridX0 + col * colW;
    const int cy = gridTop + row * rowH;

    const bool isToday = viewingToday && (d == todayDay);
    if (isToday) {
      const int pad = 3;
      renderer.fillRect(cx + pad, cy + 2, colW - 2 * pad, rowH - 4, true);
    }
    std::snprintf(numBuf, sizeof(numBuf), "%d", d);
    drawInColumn(renderer, fontId, cx, colW, cy + (rowH - lineH) / 2, numBuf, !isToday);
  }

  renderer.displayBuffer(HalDisplay::HALF_REFRESH);
}
