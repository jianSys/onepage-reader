#include "CardTheme.h"

#include <GfxRenderer.h>
#include <HalGPIO.h>
#include <I18n.h>

#include <cstdint>
#include <string>
#include <vector>

#include "CrossPointSettings.h"
#include "RecentBooksStore.h"
#include "components/UITheme.h"
#include "components/icons/book.h"
#include "components/icons/book24.h"
#include "components/icons/bookmark.h"
#include "components/icons/cover.h"
#include "components/icons/file24.h"
#include "components/icons/folder.h"
#include "components/icons/folder24.h"
#include "components/icons/hotspot.h"
#include "components/icons/image24.h"
#include "components/icons/library.h"
#include "components/icons/recent.h"
#include "components/icons/settings2.h"
#include "components/icons/text24.h"
#include "components/icons/transfer.h"
#include "components/icons/wifi.h"
#include "fontIds.h"

namespace {
// Card geometry shared by every draw* override.
constexpr int cardCornerRadius = 6;
constexpr int accentBarWidth = 3;   // left emphasis bar shown on the selected card
constexpr int hPaddingInSelection = 8;
constexpr int maxListValueWidth = 200;
constexpr int mainMenuIconSize = 32;
constexpr int listIconSize = 24;
constexpr int topHintButtonY = 345;

// A card is a single-pixel rounded stroke. The selected card gets a 2px stroke
// plus a short vertical accent bar near the left edge — deliberately NOT a
// filled/inverted block, because on the 4-gray panel dark fills collapse to the
// darkest level and thin light strokes disappear, making inversion invisible.
void drawCardFrame(const GfxRenderer& renderer, int x, int y, int w, int h, bool selected) {
  renderer.drawRoundedRect(x, y, w, h, selected ? 2 : 1, cardCornerRadius, true);
  if (selected) {
    renderer.fillRect(x + 3, y + 8, accentBarWidth, h - 16, true);
  }
}

// Icons are resolved locally (Lyra's helper has internal linkage).
const uint8_t* cardIconForName(UIIcon icon, int size) {
  if (size == 24) {
    switch (icon) {
      case UIIcon::Folder:
        return Folder24Icon;
      case UIIcon::Text:
        return Text24Icon;
      case UIIcon::Image:
        return Image24Icon;
      case UIIcon::Book:
        return Book24Icon;
      case UIIcon::File:
        return File24Icon;
      default:
        return nullptr;
    }
  } else if (size == 32) {
    switch (icon) {
      case UIIcon::Folder:
        return FolderIcon;
      case UIIcon::Book:
        return BookIcon;
      case UIIcon::Recent:
        return RecentIcon;
      case UIIcon::Settings:
        return Settings2Icon;
      case UIIcon::Transfer:
        return TransferIcon;
      case UIIcon::Library:
        return LibraryIcon;
      case UIIcon::Wifi:
        return WifiIcon;
      case UIIcon::Hotspot:
        return HotspotIcon;
      case UIIcon::Bookmark:
        return BookmarkIcon;
      default:
        return nullptr;
    }
  }
  return nullptr;
}
}  // namespace

int CardTheme::getListPageItems(int contentHeight, bool hasSubtitle) const {
  const int rowHeight =
      (hasSubtitle) ? CardMetrics::values.listWithSubtitleRowHeight : CardMetrics::values.listRowHeight;
  return contentHeight / rowHeight;
}

void CardTheme::drawHeader(const GfxRenderer& renderer, Rect rect, const char* title, const char* subtitle) const {
  const auto& m = CardMetrics::values;
  renderer.fillRect(rect.x, rect.y, rect.width, rect.height, false);

  const bool showBatteryPercentage =
      SETTINGS.hideBatteryPercentage != CrossPointSettings::HIDE_BATTERY_PERCENTAGE::HIDE_ALWAYS;
  const int batteryX = rect.x + rect.width - 12 - m.batteryWidth;
  drawBatteryRight(renderer, Rect{batteryX, rect.y + 5, m.batteryWidth, m.batteryHeight}, showBatteryPercentage);

  // The title lives inside its own card, below the battery row.
  const int cardX = rect.x + m.contentSidePadding;
  const int cardY = rect.y + m.batteryBarHeight - 4;
  const int cardW = rect.width - m.contentSidePadding * 2;
  const int cardH = m.headerHeight - (m.batteryBarHeight - 4) - m.verticalSpacing;
  drawCardFrame(renderer, cardX, cardY, cardW, cardH, false);

  const int availTextWidth = cardW - hPaddingInSelection * 2 - accentBarWidth;
  const int textStartX = cardX + hPaddingInSelection + accentBarWidth;

  if (title != nullptr && subtitle != nullptr) {
    auto t = renderer.truncatedText(UI_12_FONT_ID, title, availTextWidth, EpdFontFamily::BOLD);
    renderer.drawText(UI_12_FONT_ID, textStartX, cardY + 4, t.c_str(), true, EpdFontFamily::BOLD);
    auto s = renderer.truncatedText(SMALL_FONT_ID, subtitle, availTextWidth, EpdFontFamily::REGULAR);
    renderer.drawText(SMALL_FONT_ID, textStartX, cardY + cardH - renderer.getLineHeight(SMALL_FONT_ID) - 4, s.c_str());
  } else if (title != nullptr) {
    auto t = renderer.truncatedText(UI_12_FONT_ID, title, availTextWidth, EpdFontFamily::BOLD);
    const int lineH = renderer.getLineHeight(UI_12_FONT_ID);
    renderer.drawText(UI_12_FONT_ID, textStartX, cardY + (cardH - lineH) / 2, t.c_str(), true, EpdFontFamily::BOLD);
  } else if (subtitle != nullptr) {
    auto s = renderer.truncatedText(UI_10_FONT_ID, subtitle, availTextWidth, EpdFontFamily::REGULAR);
    const int lineH = renderer.getLineHeight(UI_10_FONT_ID);
    renderer.drawText(UI_10_FONT_ID, textStartX, cardY + (cardH - lineH) / 2, s.c_str());
  }
}

void CardTheme::drawSubHeader(const GfxRenderer& renderer, Rect rect, const char* label,
                              const char* rightLabel) const {
  const auto& m = CardMetrics::values;
  const int cardX = rect.x + m.contentSidePadding;
  const int cardW = rect.width - m.contentSidePadding * 2;
  const int cardH = 32;
  const int cardY = rect.y + (rect.height - cardH) / 2;
  drawCardFrame(renderer, cardX, cardY, cardW, cardH, false);

  int rightSpace = 0;
  if (rightLabel != nullptr) {
    auto tr = renderer.truncatedText(SMALL_FONT_ID, rightLabel, maxListValueWidth, EpdFontFamily::REGULAR);
    const int w = renderer.getTextWidth(SMALL_FONT_ID, tr.c_str());
    renderer.drawText(SMALL_FONT_ID, cardX + cardW - hPaddingInSelection - w, cardY + 9, tr.c_str());
    rightSpace += w + hPaddingInSelection * 2;
  }

  const int labelMax = cardW - hPaddingInSelection * 2 - accentBarWidth - rightSpace;
  auto lbl = renderer.truncatedText(UI_10_FONT_ID, label, labelMax, EpdFontFamily::REGULAR);
  renderer.drawText(UI_10_FONT_ID, cardX + hPaddingInSelection + accentBarWidth, cardY + 9, lbl.c_str(), true,
                    EpdFontFamily::REGULAR);
}

void CardTheme::drawTabBar(const GfxRenderer& renderer, Rect rect, const std::vector<TabInfo>& tabs,
                           bool selected) const {
  (void)selected;  // selection is expressed per-tab via the card frame, not a bar-wide fill
  const auto& m = CardMetrics::values;
  int currentX = rect.x + m.contentSidePadding;
  const int cardH = m.tabBarHeight - 12;
  const int cardY = rect.y + 6;
  const int lineH = renderer.getLineHeight(UI_10_FONT_ID);

  for (const auto& tab : tabs) {
    const int textWidth = renderer.getTextWidth(UI_10_FONT_ID, tab.label, EpdFontFamily::REGULAR);
    const int tabCardW = textWidth + hPaddingInSelection * 2 + (tab.selected ? accentBarWidth : 0);
    drawCardFrame(renderer, currentX, cardY, tabCardW, cardH, tab.selected);
    const int textX = currentX + hPaddingInSelection + (tab.selected ? accentBarWidth : 0);
    const int textY = cardY + (cardH - lineH) / 2;
    renderer.drawText(UI_10_FONT_ID, textX, textY, tab.label, true, EpdFontFamily::REGULAR);
    currentX += tabCardW + m.tabSpacing;
  }
}

void CardTheme::drawList(const GfxRenderer& renderer, Rect rect, int itemCount, int selectedIndex,
                         const std::function<std::string(int index)>& rowTitle,
                         const std::function<std::string(int index)>& rowSubtitle,
                         const std::function<UIIcon(int index)>& rowIcon,
                         const std::function<std::string(int index)>& rowValue, bool highlightValue,
                         const std::function<bool(int index)>& rowDimmed) const {
  (void)highlightValue;  // values are never inverted in the card style
  const auto& m = CardMetrics::values;
  const int rowHeight = (rowSubtitle != nullptr) ? m.listWithSubtitleRowHeight : m.listRowHeight;
  int pageItems = rect.height / rowHeight;
  if (pageItems < 1) pageItems = 1;

  const int totalPages = (itemCount + pageItems - 1) / pageItems;
  if (totalPages > 1) {
    const int scrollAreaHeight = rect.height;
    const int scrollBarHeight = (scrollAreaHeight * pageItems) / itemCount;
    const int currentPage = selectedIndex / pageItems;
    const int scrollBarY = rect.y + ((scrollAreaHeight - scrollBarHeight) * currentPage) / (totalPages - 1);
    const int scrollBarX = rect.x + rect.width - m.scrollBarRightOffset;
    renderer.drawLine(scrollBarX, rect.y, scrollBarX, rect.y + scrollAreaHeight, true);
    renderer.fillRect(scrollBarX - m.scrollBarWidth, scrollBarY, m.scrollBarWidth, scrollBarHeight, true);
  }

  const int contentWidth =
      rect.width - (totalPages > 1 ? (m.scrollBarWidth + m.scrollBarRightOffset) : 1);
  const int cardX = rect.x + m.contentSidePadding;
  const int cardW = contentWidth - m.contentSidePadding * 2;
  const int cardH = rowHeight - 6;  // leaves a vertical gap between stacked cards

  // The accent bar gutter is reserved on every row (selected or not) so text
  // stays aligned regardless of which card is highlighted.
  const int accentGap = accentBarWidth;
  int textX = cardX + hPaddingInSelection + accentGap;
  int textWidth = cardW - hPaddingInSelection * 2 - accentGap;
  const int iconStartX = textX;
  int iconSize = 0;
  if (rowIcon != nullptr) {
    iconSize = (rowSubtitle != nullptr) ? mainMenuIconSize : listIconSize;
    textX += iconSize + hPaddingInSelection;
    textWidth -= iconSize + hPaddingInSelection;
  }

  const int pageStartIndex = (selectedIndex >= 0 ? selectedIndex / pageItems : 0) * pageItems;
  const int iconY = (rowSubtitle != nullptr) ? 16 : 10;
  const int titleLineH = renderer.getLineHeight(UI_10_FONT_ID);

  for (int i = pageStartIndex; i < itemCount && i < pageStartIndex + pageItems; i++) {
    const int itemY = rect.y + (i % pageItems) * rowHeight;
    const int cardY = itemY + 3;
    const bool selected = (i == selectedIndex);
    drawCardFrame(renderer, cardX, cardY, cardW, cardH, selected);

    int rowTextWidth = textWidth;
    std::string valueText = "";
    int valueWidth = 0;
    if (rowValue != nullptr) {
      valueText = rowValue(i);
      valueText = renderer.truncatedText(UI_10_FONT_ID, valueText.c_str(), maxListValueWidth);
      valueWidth = renderer.getTextWidth(UI_10_FONT_ID, valueText.c_str()) + hPaddingInSelection;
      rowTextWidth -= valueWidth;
    }

    auto itemName = rowTitle(i);
    auto item = renderer.truncatedText(UI_10_FONT_ID, itemName.c_str(), rowTextWidth);
    const int titleY =
        (rowSubtitle != nullptr) ? cardY + 7 : cardY + (cardH - titleLineH) / 2;
    renderer.drawText(UI_10_FONT_ID, textX, titleY, item.c_str(), true);

    if (rowDimmed && rowDimmed(i) && !selected) {
      const int titleWidth = renderer.getTextWidth(UI_10_FONT_ID, item.c_str());
      for (int py = titleY; py < titleY + titleLineH; py++)
        for (int px = textX; px < textX + titleWidth; px++)
          if ((px + py) % 2 == 0) renderer.drawPixel(px, py, false);
    }

    if (rowIcon != nullptr) {
      const uint8_t* iconBitmap = cardIconForName(rowIcon(i), iconSize);
      if (iconBitmap != nullptr) {
        renderer.drawIcon(iconBitmap, iconStartX, cardY + iconY, iconSize, iconSize);
      }
    }

    if (rowSubtitle != nullptr) {
      std::string subtitleText = rowSubtitle(i);
      auto subtitle = renderer.truncatedText(SMALL_FONT_ID, subtitleText.c_str(), rowTextWidth);
      renderer.drawText(SMALL_FONT_ID, textX, cardY + 34, subtitle.c_str(), true);
    }

    if (!valueText.empty()) {
      const int valueY = (rowSubtitle != nullptr) ? cardY + 16 : titleY;
      renderer.drawText(UI_10_FONT_ID, cardX + cardW - hPaddingInSelection - valueWidth, valueY, valueText.c_str(),
                        true);
    }
  }
}

void CardTheme::drawButtonHints(GfxRenderer& renderer, const char* btn1, const char* btn2, const char* btn3,
                                const char* btn4) const {
  const GfxRenderer::Orientation orig_orientation = renderer.getOrientation();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);

  const int pageHeight = renderer.getScreenHeight();
  constexpr int buttonWidth = 80;
  constexpr int smallButtonHeight = 15;
  const int buttonHeight = CardMetrics::values.buttonHintsHeight;
  const int buttonY = CardMetrics::values.buttonHintsHeight;  // distance from bottom
  constexpr int textYOffset = 7;
#ifdef ONEPAGE_C61
  constexpr int onepageButtonPositions[] = {20, 150, 250, 380};
  const int* buttonPositions = onepageButtonPositions;
#else
  constexpr int x4ButtonPositions[] = {58, 146, 254, 342};
  constexpr int x3ButtonPositions[] = {65, 157, 291, 383};
  const int* buttonPositions = gpio.deviceIsX3() ? x3ButtonPositions : x4ButtonPositions;
#endif
  const char* labels[] = {btn1, btn2, btn3, btn4};

  for (int i = 0; i < 4; i++) {
    const int x = buttonPositions[i];
    if (labels[i] != nullptr && labels[i][0] != '\0') {
      drawCardFrame(renderer, x, pageHeight - buttonY, buttonWidth, buttonHeight, false);
      const int textWidth = renderer.getTextWidth(SMALL_FONT_ID, labels[i]);
      const int textX = x + (buttonWidth - 1 - textWidth) / 2;
      renderer.drawText(SMALL_FONT_ID, textX, pageHeight - buttonY + textYOffset, labels[i]);
    } else {
      drawCardFrame(renderer, x, pageHeight - smallButtonHeight, buttonWidth, smallButtonHeight, false);
    }
  }

  renderer.setOrientation(orig_orientation);
}

void CardTheme::drawButtonMenu(GfxRenderer& renderer, Rect rect, int buttonCount, int selectedIndex,
                               const std::function<std::string(int index)>& buttonLabel,
                               const std::function<UIIcon(int index)>& rowIcon) const {
  const auto& m = CardMetrics::values;
  const int tileWidth = rect.width - m.contentSidePadding * 2;
  const int tileX = rect.x + m.contentSidePadding;

  for (int i = 0; i < buttonCount; ++i) {
    const int tileY = rect.y + i * (m.menuRowHeight + m.menuSpacing);
    const bool selected = selectedIndex == i;
    drawCardFrame(renderer, tileX, tileY, tileWidth, m.menuRowHeight, selected);

    std::string labelStr = buttonLabel(i);
    int textX = tileX + hPaddingInSelection + accentBarWidth;
    const int lineHeight = renderer.getLineHeight(UI_12_FONT_ID);
    const int textY = tileY + (m.menuRowHeight - lineHeight) / 2;

    if (rowIcon != nullptr) {
      const uint8_t* iconBitmap = cardIconForName(rowIcon(i), mainMenuIconSize);
      if (iconBitmap != nullptr) {
        renderer.drawIcon(iconBitmap, textX, textY + 3, mainMenuIconSize, mainMenuIconSize);
        textX += mainMenuIconSize + hPaddingInSelection + 2;
      }
    }

    renderer.drawText(UI_12_FONT_ID, textX, textY, labelStr.c_str(), true);
  }
}

void CardTheme::drawRecentBookCover(GfxRenderer& renderer, Rect rect, const std::vector<RecentBook>& recentBooks,
                                    const int selectorIndex, bool& coverRendered, bool& coverBufferStored,
                                    bool& bufferRestored, std::function<bool()> storeCoverBuffer) const {
  // Reuse Lyra's cover rendering (bitmap loading, empty-cover placeholder,
  // buffer store/restore, title/author block) verbatim...
  LyraTheme::drawRecentBookCover(renderer, rect, recentBooks, selectorIndex, coverRendered, coverBufferStored,
                                 bufferRestored, storeCoverBuffer);

  // ...then overlay a purely decorative card frame on the same rect, drawn
  // after the cover so it isn't captured by the buffer.
  const auto& m = CardMetrics::values;
  const int cardX = rect.x + m.contentSidePadding;
  const int cardW = rect.width - 2 * m.contentSidePadding;
  drawCardFrame(renderer, cardX, rect.y, cardW, rect.height - 4, false);
}
