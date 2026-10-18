#include "ReadingStatsActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <algorithm>
#include <cstdio>
#include <string>
#include <time.h>
#include <vector>

#include "CrossPointState.h"
#include "MappedInputManager.h"
#include "ToolsUi.h"
#include "components/UITheme.h"
#include "fontIds.h"

ReadingStatsActivity::ReadingStatsActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
    : Activity("ReadingStatsActivity", renderer, mappedInput) {}

void ReadingStatsActivity::onEnter() {
  Activity::onEnter();
  requestUpdate();
}

void ReadingStatsActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();
    return;
  }
  // Read-only view: no other interactions required.
}

std::string ReadingStatsActivity::formatDuration(uint32_t seconds) {
  const uint32_t h = seconds / 3600;
  const uint32_t m = (seconds % 3600) / 60;
  const uint32_t s = seconds % 60;
  if (h > 0) {
    return std::to_string(h) + tr(STR_HOUR) + std::to_string(m) + tr(STR_MINUTE);
  }
  if (m > 0) {
    return std::to_string(m) + tr(STR_MINUTE) + std::to_string(s) + tr(STR_SECOND);
  }
  return std::to_string(s) + tr(STR_SECOND);
}

void ReadingStatsActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_READING_STATS));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = pageHeight - (metrics.buttonHintsHeight + metrics.verticalSpacing);

  const auto& state = APP_STATE;
  const uint32_t totalSeconds = state.totalReadingSeconds;
  const uint32_t totalTurns = state.totalPagesTurns;
  const uint32_t sessions = state.readingSessions;

  // Live session duration, shown only when a reading session is currently active.
  std::string currentSession;
  if (state.sessionActive) {
    const uint32_t elapsed = (static_cast<uint32_t>(millis()) - state.sessionStartMillis) / 1000;
    currentSession = formatDuration(elapsed);
  } else {
    currentSession = "—";
  }

  const uint32_t today = CrossPointState::currentDayOrdinal();
  const int cardX = 14;
  const int cardW = pageWidth - cardX * 2;
  const int pad = 14;
  const int eyebrowFont = SMALL_FONT_ID;

  // ---------------- hero card: lifetime reading time ----------------
  const int heroTop = contentTop;
  const int heroH = 132;
  const int heroBottom = heroTop + heroH;
  renderer.drawRoundedRect(cardX, heroTop, cardW, heroH, 1, 10, true);

  const int eyebrowY = heroTop + 16;
  ToolsUi::drawTracked(renderer, eyebrowFont, tr(STR_READING_STATS_TOTAL), cardX + pad, eyebrowY, 2, true);

  const int valueFont = NOTOSERIF_18_FONT_ID;
  const std::string totalStr = formatDuration(totalSeconds);
  const int totalW = renderer.getTextWidth(valueFont, totalStr.c_str());
  const int valueY = heroTop + 64;
  renderer.drawText(valueFont, cardX + (cardW - totalW) / 2, valueY, totalStr.c_str(), true, EpdFontFamily::BOLD);

  const uint32_t days = totalSeconds / 86400;
  if (days > 0) {
    char sub[32];
    snprintf(sub, sizeof(sub), "%u %s", days, tr(STR_DAYS));
    const int subW = renderer.getTextWidth(UI_10_FONT_ID, sub);
    renderer.drawText(UI_10_FONT_ID, cardX + (cardW - subW) / 2, valueY + 28, sub, true);
  }

  // ---------------- 7-day chart card ----------------
  const int chartTop = heroBottom + 16;
  const int chartH = 272;
  const int chartBottom = chartTop + chartH;
  renderer.drawRoundedRect(cardX, chartTop, cardW, chartH, 1, 10, true);

  const int titleY = chartTop + pad + 2;
  ToolsUi::drawTracked(renderer, eyebrowFont, tr(STR_READING_STATS_WEEK), cardX + pad, titleY, 2, true);

  std::vector<uint32_t> dayTotals(7, 0);
  for (int i = 0; i < 7; i++) {
    const uint32_t d = (today >= static_cast<uint32_t>(i)) ? (today - i) : 0;
    dayTotals[6 - i] = state.readingSecondsForDay(d);  // index 6 = today (rightmost)
  }
  uint32_t maxSec = 0, weekTotal = 0;
  for (uint32_t v : dayTotals) {
    maxSec = std::max(maxSec, v);
    weekTotal += v;
  }

  const std::string weekLabel = formatDuration(weekTotal);
  const int weekW = renderer.getTextWidth(NOTOSERIF_14_FONT_ID, weekLabel.c_str());
  renderer.drawText(NOTOSERIF_14_FONT_ID, cardX + cardW - pad - weekW, titleY + 2, weekLabel.c_str(), true);

  const int ruleY = titleY + renderer.getLineHeight(eyebrowFont) + 8;
  renderer.drawLine(cardX + pad, ruleY, cardX + cardW - pad, ruleY, 2, Color::Black);

  const int labelFont = SMALL_FONT_ID;
  const int labelH = renderer.getLineHeight(labelFont);
  const int innerLeft = cardX + pad;
  const int innerRight = cardX + cardW - pad;
  const int gap = 10;
  const int barW = (innerRight - innerLeft - gap * 6) / 7;
  const int baselineY = chartBottom - pad - labelH - 2;
  const int barAreaTop = ruleY + 14;
  const int barAreaH = baselineY - barAreaTop;

  renderer.drawLine(innerLeft, baselineY, innerRight, baselineY, 1, Color::Black);

  auto dayOfMonth = [](uint32_t dayOrdinal) -> int {
    if (dayOrdinal == 0) return -1;
    const time_t epoch = static_cast<time_t>(dayOrdinal) * 86400 + 43200;
    struct tm t;
    gmtime_r(&epoch, &t);
    return t.tm_mday;
  };

  for (int i = 0; i < 7; i++) {
    const int x = innerLeft + i * (barW + gap);
    const int cx = x + barW / 2;
    const int h = maxSec > 0 ? static_cast<int>(static_cast<uint64_t>(dayTotals[i]) * barAreaH / maxSec) : 0;
    if (h > 1) {
      renderer.fillRoundedRect(x, baselineY - h, barW, h, 4, true, true, false, false, Color::Black);
    }

    const uint32_t d = (today >= static_cast<uint32_t>(6 - i)) ? (today - (6 - i)) : 0;
    const std::string lbl = (d == 0) ? "-" : std::to_string(dayOfMonth(d));
    const int lw = renderer.getTextWidth(labelFont, lbl.c_str());
    const int lx = cx - lw / 2;
    const int ly = baselineY + 3;
    if (d == today) {
      const int pillW = lw + 8;
      const int pillH = labelH + 4;
      renderer.fillRoundedRect(cx - pillW / 2, ly - 2, pillW, pillH, 4, Color::Black);
      renderer.drawText(labelFont, lx, ly, lbl.c_str(), false);
    } else {
      renderer.drawText(labelFont, lx, ly, lbl.c_str(), true);
    }
  }

  // ---------------- overview card: 3 stat tiles ----------------
  const int sumTop = chartBottom + 16;
  const int sumH = contentBottom - sumTop;
  renderer.drawRoundedRect(cardX, sumTop, cardW, sumH, 1, 10, true);

  const int sTitleY = sumTop + pad;
  ToolsUi::drawTracked(renderer, eyebrowFont, tr(STR_READING_STATS_HINT), cardX + pad, sTitleY, 2, true);

  const int tileGap = 12;
  const int innerW = cardW - pad * 2;
  const int tileW = (innerW - tileGap * 2) / 3;
  const int tilesTop = sumTop + 40;
  const int tilesBottom = sumTop + sumH - pad;
  const int tileH = tilesBottom - tilesTop;

  struct Tile {
    const char* label;
    std::string value;
    bool active;
  };
  Tile tiles[3] = {
      {tr(STR_READING_STATS_TURNS), std::to_string(totalTurns), false},
      {tr(STR_READING_STATS_SESSIONS), std::to_string(sessions), false},
      {tr(STR_READING_STATS_SESSION), currentSession, state.sessionActive},
  };

  const int labelFont2 = UI_10_FONT_ID;
  for (int i = 0; i < 3; i++) {
    const int tx = cardX + pad + i * (tileW + tileGap);
    const int ty = tilesTop;
    const bool invert = tiles[i].active;

    if (invert) {
      renderer.fillRoundedRect(tx, ty, tileW, tileH, 8, Color::Black);
    } else {
      renderer.drawRoundedRect(tx, ty, tileW, tileH, 1, 8, true);
    }

    const int lh = renderer.getLineHeight(labelFont2);
    const int labelW = renderer.getTextWidth(labelFont2, tiles[i].label);
    const int labelX = tx + (tileW - labelW) / 2;
    renderer.drawText(labelFont2, labelX, ty + 12, tiles[i].label, !invert);

    const std::string& val = tiles[i].value;
    const int vw = renderer.getTextWidth(valueFont, val.c_str());
    const int vh = renderer.getLineHeight(valueFont);
    const int vx = tx + (tileW - vw) / 2;
    const int vy = ty + tileH - vh - 16;
    renderer.drawText(valueFont, vx, vy, val.c_str(), !invert, EpdFontFamily::BOLD);
  }

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
