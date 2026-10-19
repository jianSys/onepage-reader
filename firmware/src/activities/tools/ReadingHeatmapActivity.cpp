#include "ReadingHeatmapActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <algorithm>
#include <string>

#include "MappedInputManager.h"
#include "ReadingStatsStore.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
// 4 visual tiers: blank (no data), then three solid grayscale fills. Using the named
// grays (not low-alpha / thin lines) keeps every tier distinct under the 4-level panel.
enum Tier : uint8_t { kEmpty = 0, kLow, kMid, kHigh };

Tier tierFor(uint64_t readingMs, uint64_t goalMs) {
  if (readingMs == 0) return kEmpty;
  if (goalMs == 0) return kLow;
  if (readingMs >= goalMs) return kHigh;
  if (readingMs * 3 >= goalMs * 2) return kMid;
  return kLow;
}
}  // namespace

void ReadingHeatmapActivity::onEnter() {
  Activity::onEnter();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);
  byDay.clear();
  for (const auto& d : READING_STATS.getReadingDays()) {
    byDay[d.dayOrdinal] = d.readingMs;
  }
  weeksBack = 0;
  requestUpdate();
}

void ReadingHeatmapActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();  // pop back to the reading-analytics hub
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Left)) {
    ++weeksBack;  // page to older weeks
    requestUpdate();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Right)) {
    if (weeksBack > 0) --weeksBack;  // page back toward the current week
    requestUpdate();
    return;
  }
}

void ReadingHeatmapActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_RS_HEATMAP));

  const int top = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int bottom = pageHeight - metrics.buttonHintsHeight - metrics.verticalSpacing;

  if (byDay.empty()) {
    renderer.drawCenteredText(UI_12_FONT_ID, top + (bottom - top) / 2, tr(STR_RS_HEATMAP_EMPTY));
    const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", "", "");
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
    displayUiBuffer();
    return;
  }

  const int left = metrics.contentSidePadding;
  const int usableW = pageWidth - 2 * left;
  const int legendH = 26;
  const int gridBottom = bottom - legendH;

  const int gap = 3;
  int cell = (gridBottom - top - 6 * gap) / 7;  // fit 7 weekday rows
  cell = std::max(6, std::min(cell, (usableW - gap) / 2));
  const int stride = cell + gap;
  const int weeksVisible = std::max(1, usableW / stride);

  const uint32_t today = READING_STATS.getTodayDayOrdinal();
  const uint32_t todayWeek = today / 7;
  const uint32_t lastWeek = (todayWeek >= static_cast<uint32_t>(weeksBack)) ? (todayWeek - weeksBack) : 0;
  const uint64_t goalMs = getDailyReadingGoalMs();

  for (int c = 0; c < weeksVisible; ++c) {
    if (lastWeek < static_cast<uint32_t>(weeksVisible - 1 - c)) continue;
    const uint32_t week = lastWeek - (weeksVisible - 1 - c);
    const int x = left + c * stride;
    for (int r = 0; r < 7; ++r) {
      const uint32_t dayOrdinal = week * 7 + r;
      if (dayOrdinal > today) continue;  // future: leave blank
      const int y = top + r * stride;
      uint64_t readingMs = 0;
      auto it = byDay.find(dayOrdinal);
      if (it != byDay.end()) readingMs = it->second;
      const Tier t = tierFor(readingMs, goalMs);
      switch (t) {
        case kEmpty:
          renderer.drawRect(x, y, cell, cell, 1, true);
          break;
        case kLow:
          renderer.fillRectDither(x, y, cell, cell, Color::LightGray);
          break;
        case kMid:
          renderer.fillRectDither(x, y, cell, cell, Color::DarkGray);
          break;
        case kHigh:
          renderer.fillRect(x, y, cell, cell, true);
          break;
      }
    }
  }

  // Legend: LESS [blank][low][mid][high] MORE
  const int legendY = gridBottom + 6;
  const int swatch = cell;
  const int smallH = renderer.getLineHeight(SMALL_FONT_ID);
  const char* lessText = tr(STR_RS_HEATMAP_LESS);
  const char* moreText = tr(STR_RS_HEATMAP_MORE);
  const int lessW = renderer.getTextWidth(SMALL_FONT_ID, lessText);
  const int moreW = renderer.getTextWidth(SMALL_FONT_ID, moreText);
  const int blockW = swatch * 4 + 3 * gap;
  const int totalW = lessW + 6 + blockW + 6 + moreW;
  int bx = left + (usableW - totalW) / 2;
  const int by = legendY + (smallH - swatch) / 2;
  renderer.drawText(SMALL_FONT_ID, bx, legendY, lessText, true);
  bx += lessW + 6;
  renderer.drawRect(bx, by, swatch, swatch, 1, true);
  bx += swatch + gap;
  renderer.fillRectDither(bx, by, swatch, swatch, Color::LightGray);
  bx += swatch + gap;
  renderer.fillRectDither(bx, by, swatch, swatch, Color::DarkGray);
  bx += swatch + gap;
  renderer.fillRect(bx, by, swatch, swatch, true);
  bx += swatch + 6;
  renderer.drawText(SMALL_FONT_ID, bx, legendY, moreText, true);

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", tr(STR_DIR_LEFT), tr(STR_DIR_RIGHT));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
