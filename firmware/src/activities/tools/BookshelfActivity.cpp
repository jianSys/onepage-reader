#include "BookshelfActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <memory>

#include <algorithm>

#include "BookshelfStore.h"
#include "MappedInputManager.h"
#include "RecentBooksStore.h"
#include "ToolsUi.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
constexpr unsigned long LONG_PRESS_MS = 1000;

// Compact, localized "last read" label: today / yesterday / N days ago.
std::string formatRelativeTime(time_t when) {
  if (when <= 0) return "—";
  const time_t now = time(nullptr);
  const int days = static_cast<int>((now - when) / 86400);
  if (days <= 0) return tr(STR_TODAY);
  if (days == 1) return tr(STR_YESTERDAY);
  return std::to_string(days) + tr(STR_DAYS_AGO);
}
}  // namespace

BookshelfActivity::BookshelfActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
    : Activity("Bookshelf", renderer, mappedInput) {}

void BookshelfActivity::loadBooks() { books_ = RECENT_BOOKS.getBooks(); }

int BookshelfActivity::computePageItems() const {
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();
  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = pageHeight - (metrics.buttonHintsHeight + metrics.verticalSpacing);
  const int listTop = contentTop + 24;
  const int listHeight = contentBottom - listTop;

  const int cols = 4;
  const int gapY = 14;
  const int cellH = 170;  // target card height; rows adapt to the viewable area
  const int rows = std::max(1, (listHeight + gapY) / (cellH + gapY));
  return rows * cols;
}

void BookshelfActivity::onEnter() {
  Activity::onEnter();
  if (RECENT_BOOKS.pruneMissing()) RECENT_BOOKS.saveToFile();
  loadBooks();
  selectorIndex = 0;
  requestUpdate();
}

void BookshelfActivity::loop() {
  const int pageItems = computePageItems();

  if (longPressFired) {
    if (!mappedInput.isPressed(MappedInputManager::Button::Confirm)) longPressFired = false;
    return;
  }

  // Long-press Confirm: toggle favorite for the selected book.
  if (!books_.empty() && selectorIndex < books_.size() &&
      mappedInput.isPressed(MappedInputManager::Button::Confirm) && mappedInput.getHeldTime() >= LONG_PRESS_MS) {
    longPressFired = true;
    BOOKSHELF.toggle(books_[selectorIndex].path);
    requestUpdate(true);
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    if (!books_.empty() && selectorIndex < static_cast<int>(books_.size())) {
      onSelectBook(books_[selectorIndex].path);
      return;
    }
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    onGoHome();
    return;
  }

  const int listSize = static_cast<int>(books_.size());
  buttonNavigator.onNextRelease([this, listSize] {
    selectorIndex = ButtonNavigator::nextIndex(static_cast<int>(selectorIndex), listSize);
    requestUpdate();
  });
  buttonNavigator.onPreviousRelease([this, listSize] {
    selectorIndex = ButtonNavigator::previousIndex(static_cast<int>(selectorIndex), listSize);
    requestUpdate();
  });
  buttonNavigator.onNextContinuous([this, listSize, pageItems] {
    selectorIndex = ButtonNavigator::nextPageIndex(static_cast<int>(selectorIndex), listSize, pageItems);
    requestUpdate();
  });
  buttonNavigator.onPreviousContinuous([this, listSize, pageItems] {
    selectorIndex = ButtonNavigator::previousPageIndex(static_cast<int>(selectorIndex), listSize, pageItems);
    requestUpdate();
  });
}

void BookshelfActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_BOOKSHELF));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = pageHeight - (metrics.buttonHintsHeight + metrics.verticalSpacing);
  ToolsUi::drawTracked(renderer, SMALL_FONT_ID, ToolsUi::eyebrow(tr(STR_BOOKSHELF), "BOOKSHELF").c_str(),
                       metrics.contentSidePadding, contentTop, 2, true);

  const int listTop = contentTop + 24;
  const int listHeight = contentBottom - listTop;

  if (books_.empty()) {
    GUI.drawEmptyState(renderer, Rect{0, listTop, pageWidth, listHeight}, UIIcon::Book, tr(STR_NO_RECENT_BOOKS));
    return;
  }

  // 4-column book-card grid (CrossMux-style), page-scrolled like the list.
  const int cols = 4;
  const int gapX = 10;
  const int gapY = 14;
  const int margin = 14;
  const int gridX = margin;
  const int gridW = pageWidth - margin * 2;
  const int cellW = (gridW - (cols - 1) * gapX) / cols;

  const int pageItems = computePageItems();
  const int rows = std::max(1, pageItems / cols);
  const int cellH = (listHeight - gapY * (rows - 1)) / rows;

  const int pageStart = (selectorIndex / pageItems) * pageItems;
  const int last = std::min(static_cast<int>(books_.size()), pageStart + pageItems);

  // Small UTF-8-aware wrap helper so CJK titles never overflow the narrow cards.
  auto drawTitle = [&](const std::string& text, int x, int y, int maxW, bool black) {
    size_t i = 0;
    int line = 0;
    const int lineH = 14;
    while (i < text.size() && line < 2) {
      std::string cur;
      size_t j = i;
      while (j < text.size()) {
        const unsigned char c = static_cast<unsigned char>(text[j]);
        const int n = (c < 0x80) ? 1 : ((c & 0xE0) == 0xC0) ? 2 : ((c & 0xF0) == 0xE0) ? 3 : 4;
        const std::string cand = cur + text.substr(j, n);
        if (!cur.empty() && renderer.getTextWidth(UI_12_FONT_ID, cand.c_str()) > maxW) break;
        cur = cand;
        j += n;
      }
      if (cur.empty()) {
        const unsigned char c = static_cast<unsigned char>(text[i]);
        const int n = (c < 0x80) ? 1 : ((c & 0xE0) == 0xC0) ? 2 : ((c & 0xF0) == 0xE0) ? 3 : 4;
        cur = text.substr(i, n);
        j = i + n;
      }
      ++line;
      if (line == 2 && j < text.size()) {
        std::string ell = cur + "…";
        while (!cur.empty() && renderer.getTextWidth(UI_12_FONT_ID, ell.c_str()) > maxW) {
          size_t k = cur.size();
          while (k > 0 && (static_cast<unsigned char>(cur[k - 1]) & 0xC0) == 0x80) --k;
          cur.erase(k);
          ell = cur + "…";
        }
        cur = ell;
      }
      renderer.drawText(UI_12_FONT_ID, x, y, cur.c_str(), black);
      y += lineH;
      i = j;
    }
  };

  for (int i = pageStart; i < last; i++) {
    const int col = (i - pageStart) % cols;
    const int row = (i - pageStart) / cols;
    const int cellX = gridX + col * (cellW + gapX);
    const int cellY = listTop + row * (cellH + gapY);
    const bool selected = (i == selectorIndex);
    const bool fav = BOOKSHELF.isFavorite(books_[i].path);
    const bool black = !selected;  // inverted card => white text

    // Card background (inverted when selected).
    if (selected) {
      renderer.fillRoundedRect(cellX, cellY, cellW, cellH, 8, Color::Black);
    } else {
      ToolsUi::drawCard(renderer, cellX, cellY, cellW, cellH, 8);
    }

    // Book cover thumbnail.
    const int coverPad = 8;
    const int coverX = cellX + coverPad;
    const int coverY = cellY + coverPad;
    const int coverW = cellW - coverPad * 2;
    const int coverH = cellH - 56;  // leave room for the 2-line title + meta
    if (selected) {
      renderer.fillRoundedRect(coverX, coverY, coverW, coverH, 4, Color::White);
      renderer.drawRoundedRect(coverX, coverY, coverW, coverH, 1, 4, false);
    } else {
      renderer.drawRoundedRect(coverX, coverY, coverW, coverH, 1, 4, true);
    }
    // Spine.
    renderer.drawLine(coverX + 8, coverY + 5, coverX + 8, coverY + coverH - 5, true);
    // Favorite marker (top-right of the cover).
    if (fav) {
      const int dot = 5;
      renderer.fillRoundedRect(coverX + coverW - dot - 3, coverY + 3, dot, dot, dot / 2,
                               selected ? Color::White : Color::Black);
    }

    // Title (CJK-safe, up to two lines) under the cover.
    const int titleX = cellX + 6;
    const int titleMaxW = cellW - 12;
    const int titleY = coverY + coverH + 5;
    drawTitle(books_[i].title, titleX, titleY, titleMaxW, black);

    // Meta: relative "last read" + progress percentage.
    char pctBuf[16];
    snprintf(pctBuf, sizeof(pctBuf), "%d%%", books_[i].progressPercent);
    std::string meta = formatRelativeTime(books_[i].lastRead);
    if (books_[i].progressPercent > 0) {
      meta += " · ";
      meta += pctBuf;
    }
    renderer.drawText(SMALL_FONT_ID, titleX, cellY + cellH - 14, meta.c_str(), black);
  }

  // Scrollbar (matches the list theme) when content overflows.
  const int totalPages = (static_cast<int>(books_.size()) + pageItems - 1) / pageItems;
  if (totalPages > 1) {
    const int barX = pageWidth - 8;
    const int barH = (listHeight * pageItems) / static_cast<int>(books_.size());
    const int barY = listTop + ((listHeight - barH) * (pageStart / pageItems)) / (totalPages - 1);
    renderer.drawLine(barX, listTop, barX, listTop + listHeight, 1, true);
    renderer.fillRect(barX - 2, barY, 4, barH, true);
  }

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_OPEN), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
