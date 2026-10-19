#include "ReadingProfileActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <algorithm>
#include <string>
#include <vector>

#include "MappedInputManager.h"
#include "ReadingStatsStore.h"
#include "ToolsUi.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {

std::string formatDuration(uint32_t seconds) {
  const uint32_t h = seconds / 3600;
  const uint32_t m = (seconds % 3600) / 60;
  if (h > 0) return std::to_string(h) + tr(STR_HOUR) + std::to_string(m) + tr(STR_MINUTE);
  if (m > 0) return std::to_string(m) + tr(STR_MINUTE);
  return std::to_string(seconds) + tr(STR_SECOND);
}

// Trim a UTF-8-ish title to fit maxW pixels, appending an ellipsis when cut.
std::string fitToWidth(const GfxRenderer& renderer, int fontId, const std::string& text, int maxW) {
  if (renderer.getTextWidth(fontId, text.c_str()) <= maxW) return text;
  std::string out;
  size_t i = 0;
  while (i < text.size()) {
    const unsigned char c = static_cast<unsigned char>(text[i]);
    size_t len = 1;
    if (c >= 0xF0) len = 4;
    else if (c >= 0xE0) len = 3;
    else if (c >= 0xC0) len = 2;
    if (i + len > text.size()) break;
    const std::string next = text.substr(i, len);
    if (renderer.getTextWidth(fontId, (out + next + "...").c_str()) > maxW) break;
    out += next;
    i += len;
  }
  if (out.empty()) out = text.substr(0, std::min<size_t>(text.size(), 1));
  return out + "...";
}

}  // namespace

void ReadingProfileActivity::onEnter() {
  Activity::onEnter();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);
  requestUpdate();
}

void ReadingProfileActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();  // pop back to the reading-analytics hub
  }
}

void ReadingProfileActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_RS_PROFILE));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int cardX = 14;
  const int cardW = pageWidth - cardX * 2;
  const int pad = 14;
  const int eyebrowFont = SMALL_FONT_ID;
  const int valueFont = NOTOSERIF_18_FONT_ID;
  const int labelFont = UI_10_FONT_ID;

  // ---- live figures from our store ----
  const uint32_t totalSeconds = static_cast<uint32_t>(READING_STATS.getTotalReadingMs() / 1000ULL);
  const uint64_t goalMs = getDailyReadingGoalMs();
  uint32_t goalDays = 0;
  if (goalMs > 0) {
    for (const auto& d : READING_STATS.getReadingDays()) {
      if (d.readingMs >= goalMs) ++goalDays;
    }
  }
  uint32_t longestMs = 0;
  for (const auto& s : READING_STATS.getSessionLog()) longestMs = std::max(longestMs, s.sessionMs);
  const uint32_t sessions = static_cast<uint32_t>(READING_STATS.getSessionLog().size());
  const uint32_t started = READING_STATS.getBooksStartedCount();
  const uint32_t finished = READING_STATS.getBooksFinishedCount();
  const uint32_t streak = READING_STATS.getCurrentStreakDays();
  const uint32_t maxStreak = READING_STATS.getMaxStreakDays();

  // ---- hero: lifetime reading time ----
  int y = contentTop;
  const int heroH = 92;
  renderer.drawRoundedRect(cardX, y, cardW, heroH, 1, 10, true);
  ToolsUi::drawTracked(renderer, eyebrowFont, tr(STR_READING_STATS_TOTAL), cardX + pad, y + 14, 2, true);
  const std::string totalStr = formatDuration(totalSeconds);
  const int tw = renderer.getTextWidth(valueFont, totalStr.c_str());
  renderer.drawText(valueFont, cardX + (cardW - tw) / 2, y + 46, totalStr.c_str(), true, EpdFontFamily::BOLD);
  y += heroH + 12;

  // ---- stat tiles: 3 cols x 2 rows ----
  const int tileGap = 10;
  const int tileW = (cardW - tileGap * 2) / 3;
  const int tileH = 68;
  struct Tile {
    const char* label;
    std::string value;
  };
  Tile tiles[6] = {
      {tr(STR_RS_BOOKS_STARTED), std::to_string(started)},
      {tr(STR_RS_BOOKS_FINISHED), std::to_string(finished)},
      {tr(STR_READING_STATS_SESSIONS), std::to_string(sessions)},
      {tr(STR_RS_GOAL_DAYS), std::to_string(goalDays)},
      {tr(STR_READING_STATS_STREAK), std::to_string(streak)},
      {tr(STR_RS_MAX_STREAK), std::to_string(maxStreak)},
  };
  for (int i = 0; i < 6; ++i) {
    const int col = i % 3;
    const int row = i / 3;
    const int tx = cardX + col * (tileW + tileGap);
    const int ty = y + row * (tileH + tileGap);
    renderer.drawRoundedRect(tx, ty, tileW, tileH, 1, 8, true);
    const int lw = renderer.getTextWidth(labelFont, tiles[i].label);
    renderer.drawText(labelFont, tx + (tileW - lw) / 2, ty + 10, tiles[i].label, true);
    const int vw = renderer.getTextWidth(NOTOSERIF_16_FONT_ID, tiles[i].value.c_str());
    renderer.drawText(NOTOSERIF_16_FONT_ID, tx + (tileW - vw) / 2, ty + 34, tiles[i].value.c_str(), true,
                      EpdFontFamily::BOLD);
  }
  y += tileH * 2 + tileGap + 12;

  // ---- longest single session ----
  {
    const int rowH = 40;
    renderer.drawRoundedRect(cardX, y, cardW, rowH, 1, 8, true);
    renderer.drawText(labelFont, cardX + pad, y + (rowH - renderer.getLineHeight(labelFont)) / 2,
                      tr(STR_RS_LONGEST_SESSION), true);
    const std::string v = formatDuration(longestMs / 1000);
    const int vw = renderer.getTextWidth(NOTOSERIF_14_FONT_ID, v.c_str());
    renderer.drawText(NOTOSERIF_14_FONT_ID, cardX + cardW - pad - vw, y + (rowH - renderer.getLineHeight(NOTOSERIF_14_FONT_ID)) / 2,
                      v.c_str(), true);
    y += rowH + 12;
  }

  // ---- top books by reading time ----
  {
    ToolsUi::drawTracked(renderer, eyebrowFont, tr(STR_RS_TOP_BOOKS), cardX + pad, y, 2, true);
    y += renderer.getLineHeight(eyebrowFont) + 6;
    std::vector<const ReadingBookStats*> books;
    for (const auto& b : READING_STATS.getBooks()) books.push_back(&b);
    std::sort(books.begin(), books.end(), [](const ReadingBookStats* a, const ReadingBookStats* b) {
      return a->totalReadingMs > b->totalReadingMs;
    });
    const int rowH = renderer.getLineHeight(NOTOSERIF_14_FONT_ID) + 8;
    const int maxRows = 3;
    for (int i = 0; i < maxRows && i < static_cast<int>(books.size()); ++i) {
      const std::string dur = formatDuration(static_cast<uint32_t>(books[i]->totalReadingMs / 1000ULL));
      const int durW = renderer.getTextWidth(NOTOSERIF_14_FONT_ID, dur.c_str());
      const std::string title = fitToWidth(renderer, NOTOSERIF_14_FONT_ID, books[i]->title, cardW - pad * 2 - durW - 12);
      renderer.drawText(NOTOSERIF_14_FONT_ID, cardX + pad, y, title.c_str(), true);
      renderer.drawText(NOTOSERIF_14_FONT_ID, cardX + cardW - pad - durW, y, dur.c_str(), true);
      y += rowH;
    }
    if (books.empty()) {
      renderer.drawText(NOTOSERIF_14_FONT_ID, cardX + pad, y, tr(STR_RS_NO_BOOKS_YET), true);
    }
  }

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", "", "");
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
