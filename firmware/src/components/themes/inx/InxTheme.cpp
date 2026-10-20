#include "InxTheme.h"

#include <GfxRenderer.h>
#include <HalGPIO.h>

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

#include "CrossPointSettings.h"
#include "I18n.h"
#include "fontIds.h"

namespace {
constexpr int kRowPadding = 20;
constexpr int kListIconSize = 24;
constexpr int kMenuIconSize = 32;
constexpr int kIconGap = 10;
constexpr int kMaxValueWidth = 200;
constexpr int kSideHintY = 345;
constexpr int kX3SideHintY = 155;
constexpr int kHintWidth = 80;
constexpr int kHintBarWidth = kHintWidth * 4 / 5;
constexpr int kHintBarInset = (kHintWidth - kHintBarWidth) / 2;
constexpr int kHintBarHeight = 5;
constexpr int kHintGap = 4;

// Dotted rule used between rows: one ink pixel every three, so the separator
// reads as a texture instead of a hard line.
void drawDottedSeparator(const GfxRenderer& renderer, const int x, const int y, const int width) {
  for (int px = x; px < x + width; px += 3) renderer.drawPixel(px, y, true);
}

// Checkerboard grey-out for rows that are present but not usable right now.
void drawDitherMask(const GfxRenderer& renderer, const int x, const int y, const int width, const int height) {
  for (int py = y; py < y + height; ++py) {
    for (int px = x; px < x + width; ++px) {
      if ((px + py) % 2 == 0) renderer.drawPixel(px, py, false);
    }
  }
}

// Hairline track plus thumb: the rule marks the whole list and the bar shows
// which page of it is on screen.
void drawScrollBar(const GfxRenderer& renderer, const Rect rect, const int itemCount, const int pageStart,
                   const int pageItems) {
  if (itemCount <= pageItems || pageItems <= 0 || rect.height <= 0) return;
  const auto& metrics = InxMetrics::values;
  const int totalPages = 1 + (itemCount - 1) / pageItems;
  const int currentPage = std::clamp(pageStart / pageItems, 0, totalPages - 1);
  const int thumbHeight = std::max(1, static_cast<int>((static_cast<int64_t>(rect.height) * pageItems) / itemCount));
  const int thumbY =
      rect.y + static_cast<int>((static_cast<int64_t>(rect.height - thumbHeight) * currentPage) / (totalPages - 1));
  const int barX = rect.x + rect.width - metrics.scrollBarRightOffset;
  renderer.drawLine(barX, rect.y, barX, rect.y + rect.height, true);
  renderer.fillRect(barX - metrics.scrollBarWidth, thumbY, metrics.scrollBarWidth, thumbHeight, true);
}

// Labels centred in the hint box, clipped to the space above the dithered bar so
// a long translation cannot spill over the rule.
void drawHintText(const GfxRenderer& renderer, const char* label, const int x, const int contentY,
                  const int contentBottom) {
  const int textWidth = renderer.getTextWidth(SMALL_FONT_ID, label);
  const int textY = std::max(contentY, contentBottom - renderer.getLineHeight(SMALL_FONT_ID) + 1);
  const GfxRenderer::ClipScope clip(renderer, x + 1, contentY, kHintWidth - 2, contentBottom - contentY + 1);
  renderer.drawText(SMALL_FONT_ID, x + std::max(1, (kHintWidth - textWidth) / 2), textY, label);
}

const char* hintLabel(const char* label) {
  if (std::strcmp(label, tr(STR_DIR_LEFT)) == 0) return "<";
  if (std::strcmp(label, tr(STR_DIR_RIGHT)) == 0) return ">";
  return label;
}
}  // namespace

void InxTheme::drawHeader(const GfxRenderer& renderer, Rect rect, const char* title, const char* subtitle) const {
  renderer.fillRect(rect.x, rect.y, rect.width, rect.height, false);

  const bool showBatteryPercentage =
      SETTINGS.hideBatteryPercentage != CrossPointSettings::HIDE_BATTERY_PERCENTAGE::HIDE_ALWAYS;
  const int batteryX = rect.x + rect.width - 12 - InxMetrics::values.batteryWidth;
  drawBatteryRight(renderer,
                   Rect{batteryX, rect.y + 5, InxMetrics::values.batteryWidth, InxMetrics::values.batteryHeight},
                   showBatteryPercentage);

  const int titleTop = rect.y + InxMetrics::values.batteryBarHeight;
  int titleRight = rect.x + rect.width - kRowPadding;
  if (subtitle != nullptr && *subtitle != '\0') {
    const int subtitleWidth =
        std::min(renderer.getTextWidth(SMALL_FONT_ID, subtitle), std::max(0, rect.width / 2 - kRowPadding));
    if (subtitleWidth > 0) {
      const std::string shown = renderer.truncatedText(SMALL_FONT_ID, subtitle, subtitleWidth);
      titleRight -= subtitleWidth + kIconGap;
      const int subtitleY =
          titleTop + std::max(0, (renderer.getLineHeight(UI_12_FONT_ID) - renderer.getLineHeight(SMALL_FONT_ID)) / 2);
      const GfxRenderer::ClipScope clip(renderer, titleRight + kIconGap, subtitleY, subtitleWidth,
                                        renderer.getLineHeight(SMALL_FONT_ID));
      renderer.drawText(SMALL_FONT_ID, titleRight + kIconGap, subtitleY, shown.c_str());
    }
  }

  if (title != nullptr && *title != '\0' && titleRight > rect.x + kRowPadding) {
    const std::string shown =
        renderer.truncatedText(UI_12_FONT_ID, title, titleRight - rect.x - kRowPadding, EpdFontFamily::BOLD);
    const GfxRenderer::ClipScope clip(renderer, rect.x + kRowPadding, titleTop, titleRight - rect.x - kRowPadding,
                                      renderer.getLineHeight(UI_12_FONT_ID));
    renderer.drawText(UI_12_FONT_ID, rect.x + kRowPadding, titleTop, shown.c_str(), true, EpdFontFamily::BOLD);
  }
  renderer.drawLine(rect.x, rect.y + rect.height - 1, rect.x + rect.width - 1, rect.y + rect.height - 1, true);
}

void InxTheme::drawSubHeader(const GfxRenderer& renderer, Rect rect, const char* label, const char* rightLabel) const {
  int labelRight = rect.x + rect.width - kRowPadding;
  if (rightLabel != nullptr && *rightLabel != '\0') {
    const int rightWidth =
        std::min(renderer.getTextWidth(UI_10_FONT_ID, rightLabel), std::max(0, rect.width / 2 - kRowPadding));
    if (rightWidth > 0) {
      labelRight -= rightWidth + kIconGap;
      const std::string shown = renderer.truncatedText(UI_10_FONT_ID, rightLabel, rightWidth);
      const int rightY = rect.y + std::max(0, (rect.height - renderer.getLineHeight(UI_10_FONT_ID)) / 2);
      const GfxRenderer::ClipScope clip(renderer, labelRight + kIconGap, rect.y, rightWidth, rect.height - 1);
      renderer.drawText(UI_10_FONT_ID, rect.x + rect.width - kRowPadding - rightWidth, rightY, shown.c_str());
    }
  }
  if (label != nullptr && *label != '\0' && labelRight > rect.x + kRowPadding) {
    const std::string shown =
        renderer.truncatedText(UI_10_FONT_ID, label, labelRight - rect.x - kRowPadding, EpdFontFamily::BOLD);
    const int labelY = rect.y + std::max(0, (rect.height - renderer.getLineHeight(UI_10_FONT_ID)) / 2);
    const GfxRenderer::ClipScope clip(renderer, rect.x + kRowPadding, rect.y, labelRight - rect.x - kRowPadding,
                                      rect.height - 1);
    renderer.drawText(UI_10_FONT_ID, rect.x + kRowPadding, labelY, shown.c_str(), true, EpdFontFamily::BOLD);
  }
  drawDottedSeparator(renderer, rect.x, rect.y + rect.height - 1, rect.width);
}

void InxTheme::drawTabBar(const GfxRenderer& renderer, Rect rect, const std::vector<TabInfo>& tabs, bool) const {
  if (tabs.empty()) return;
  const int count = static_cast<int>(tabs.size());
  for (int index = 0; index < count; ++index) {
    const int left = rect.x + rect.width * index / count;
    const int right = rect.x + rect.width * (index + 1) / count;
    const bool active = tabs[index].selected;
    // The active tab is a solid band; its label is knocked out of the ink.
    if (active) renderer.fillRect(left, rect.y, right - left, rect.height - 1, true);
    const auto style = active ? EpdFontFamily::BOLD : EpdFontFamily::REGULAR;
    const int textWidth = renderer.getTextWidth(UI_10_FONT_ID, tabs[index].label, style);
    const int textX = left + std::max(0, (right - left - textWidth) / 2);
    const int textY = rect.y + std::max(0, (rect.height - renderer.getLineHeight(UI_10_FONT_ID)) / 2);
    const GfxRenderer::ClipScope clip(renderer, left, rect.y, right - left, rect.height - 1);
    renderer.drawText(UI_10_FONT_ID, textX, textY, tabs[index].label, !active, style);
  }
  renderer.drawLine(rect.x, rect.y + rect.height - 1, rect.x + rect.width - 1, rect.y + rect.height - 1, true);
}

void InxTheme::drawButtonHints(GfxRenderer& renderer, const char* btn1, const char* btn2, const char* btn3,
                               const char* btn4) const {
  const GfxRenderer::Orientation original = renderer.getOrientation();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);

  const int pageHeight = renderer.getScreenHeight();
  const int pageWidth = renderer.getScreenWidth();
  constexpr int buttonHeight = InxMetrics::values.buttonHintsHeight;
  // Front keys cluster as [Back] [Left Right] [Confirm]: the outer two hug the
  // edges and the inner pair sits next to the gap in the middle.
  const int margin = gpio.deviceIsX3() ? 65 : 58;
  const int gap = gpio.deviceIsX3() ? 12 : 8;
  const int positions[] = {margin, margin + kHintWidth + gap, pageWidth - margin - kHintWidth * 2 - gap,
                           pageWidth - margin - kHintWidth};
  const char* labels[] = {btn1, btn2, btn3, btn4};
  const int hintY = pageHeight - buttonHeight;
  const int barY = pageHeight - kHintBarHeight;
  const int contentBottom = barY - kHintGap - 1;

  for (int i = 0; i < 4; ++i) {
    renderer.fillRect(positions[i], hintY, kHintWidth, buttonHeight, false);
    if (labels[i] == nullptr || labels[i][0] == '\0') continue;
    renderer.fillRectDither(positions[i] + kHintBarInset, barY, kHintBarWidth, kHintBarHeight, Color::DarkGray);
    drawHintText(renderer, hintLabel(labels[i]), positions[i], hintY, contentBottom);
  }
  renderer.setOrientation(original);
}

void InxTheme::drawSideButtonHints(const GfxRenderer& renderer, const char* topBtn, const char* bottomBtn) const {
  constexpr int width = InxMetrics::values.sideButtonHintsWidth;
  constexpr int height = 78;
  const int screenWidth = renderer.getScreenWidth();
  const char* labels[] = {topBtn, bottomBtn};
  const int xs[] = {gpio.deviceIsX3() ? 0 : screenWidth - width, screenWidth - width};
  const int firstY = gpio.deviceIsX3() ? kX3SideHintY : kSideHintY;
  const int ys[] = {firstY, gpio.deviceIsX3() ? firstY : firstY + height + 5};

  for (int i = 0; i < 2; ++i) {
    if (labels[i] == nullptr || labels[i][0] == '\0') continue;
    renderer.fillRect(xs[i], ys[i], width, height, false);
    renderer.drawRect(xs[i], ys[i], width, height, true);
    const int textWidth = renderer.getTextWidth(SMALL_FONT_ID, labels[i]);
    renderer.drawTextRotated90CW(SMALL_FONT_ID, xs[i], ys[i] + (height + textWidth) / 2, labels[i]);
  }
}

int InxTheme::getListPageItems(int contentHeight, bool hasSubtitle) const {
  const int rowHeight = hasSubtitle ? InxMetrics::values.listWithSubtitleRowHeight : InxMetrics::values.listRowHeight;
  return std::max(1, contentHeight / rowHeight);
}

void InxTheme::drawList(const GfxRenderer& renderer, Rect rect, int itemCount, int selectedIndex,
                        const std::function<std::string(int index)>& rowTitle,
                        const std::function<std::string(int index)>& rowSubtitle,
                        const std::function<UIIcon(int index)>& rowIcon,
                        const std::function<std::string(int index)>& rowValue, bool,
                        const std::function<bool(int index)>& rowDimmed) const {
  if (itemCount <= 0 || rect.height <= 0) return;

  const bool hasSubtitle = rowSubtitle != nullptr;
  const int rowHeight = hasSubtitle ? InxMetrics::values.listWithSubtitleRowHeight : InxMetrics::values.listRowHeight;
  const int pageItems = getListPageItems(rect.height, hasSubtitle);
  // Pages flip wholesale; activities page their selection by the same count, so
  // the two views have to agree on where a page starts.
  const int pageStart = selectedIndex >= 0 ? selectedIndex / pageItems * pageItems : 0;
  const int pageEnd = std::min(itemCount, pageStart + pageItems);
  const bool hasScrollBar = itemCount > pageItems;
  const int contentRight = rect.x + rect.width - (hasScrollBar ? 10 : 0);
  const int iconSize = hasSubtitle ? kMenuIconSize : kListIconSize;

  for (int index = pageStart; index < pageEnd; ++index) {
    const int rowY = rect.y + (index - pageStart) * rowHeight;
    const bool selected = index == selectedIndex;
    if (selected) renderer.fillRect(rect.x, rowY, rect.width, rowHeight, true);

    int textX = rect.x + kRowPadding;
    if (rowIcon != nullptr) {
      if (const uint8_t* bitmap = iconForName(rowIcon(index), iconSize)) {
        const int iconY = rowY + (rowHeight - iconSize) / 2;
        if (selected) {
          renderer.drawIconInverted(bitmap, textX, iconY, iconSize);
        } else {
          renderer.drawIcon(bitmap, textX, iconY, iconSize);
        }
        textX += iconSize + kIconGap;
      }
    }

    std::string value;
    int valueWidth = 0;
    if (rowValue != nullptr) {
      value = renderer.truncatedText(UI_10_FONT_ID, rowValue(index).c_str(), kMaxValueWidth);
      if (!value.empty()) valueWidth = renderer.getTextWidth(UI_10_FONT_ID, value.c_str()) + kIconGap;
    }

    const int textWidth = std::max(1, contentRight - kRowPadding - textX - valueWidth);
    const std::string title = renderer.truncatedText(UI_10_FONT_ID, rowTitle(index).c_str(), textWidth);
    const int titleLineHeight = renderer.getLineHeight(UI_10_FONT_ID);
    // Stack the two lines with a small gap and centre the pair in the row. The old
    // fixed offsets assumed the flash font's line heights; with the CJK UI fallback
    // both lines are ~22px, so they printed on top of each other.
    constexpr int kSubtitleLineGap = 6;
    const int subtitleLineHeight = hasSubtitle ? renderer.getLineHeight(SMALL_FONT_ID) + kSubtitleLineGap : 0;
    const int blockTop = rowY + std::max(0, (rowHeight - titleLineHeight - subtitleLineHeight) / 2);
    const int titleY = hasSubtitle ? blockTop : rowY + (rowHeight - titleLineHeight) / 2;
    renderer.drawText(UI_10_FONT_ID, textX, titleY, title.c_str(), !selected);

    if (hasSubtitle) {
      const std::string subtitle = renderer.truncatedText(SMALL_FONT_ID, rowSubtitle(index).c_str(), textWidth);
      renderer.drawText(SMALL_FONT_ID, textX, blockTop + titleLineHeight + kSubtitleLineGap, subtitle.c_str(),
                        !selected);
    }
    if (!value.empty()) {
      const int valueX = contentRight - kRowPadding - renderer.getTextWidth(UI_10_FONT_ID, value.c_str());
      const int valueY = rowY + (rowHeight - renderer.getLineHeight(UI_10_FONT_ID)) / 2;
      renderer.drawText(UI_10_FONT_ID, valueX, valueY, value.c_str(), !selected);
    }
    if (rowDimmed && rowDimmed(index) && !selected) {
      drawDitherMask(renderer, textX, rowY, std::max(0, contentRight - textX), rowHeight - 1);
    }
    drawDottedSeparator(renderer, rect.x, rowY + rowHeight - 1, rect.width);
  }

  drawScrollBar(renderer, rect, itemCount, pageStart, pageItems);
}

void InxTheme::drawButtonMenu(GfxRenderer& renderer, Rect rect, int buttonCount, int selectedIndex,
                              const std::function<std::string(int index)>& buttonLabel,
                              const std::function<UIIcon(int index)>& rowIcon) const {
  const int rowHeight = InxMetrics::values.menuRowHeight;
  const int rowStep = rowHeight + InxMetrics::values.menuSpacing;
  // Long menus must stop above the hint row, so draw only the rows that fit and
  // scroll the window to keep the selection visible.
  const int visibleRows = std::max(1, rect.height / rowStep);
  const int safeSelectedIndex = std::max(0, selectedIndex);
  const int firstRow = std::clamp(safeSelectedIndex - visibleRows + 1, 0, std::max(0, buttonCount - visibleRows));

  for (int index = firstRow; index < buttonCount && index < firstRow + visibleRows; ++index) {
    const int rowY = rect.y + (index - firstRow) * rowStep;
    const bool selected = index == selectedIndex;
    if (selected) renderer.fillRect(rect.x, rowY, rect.width, rowHeight, true);

    int textX = rect.x + kRowPadding;
    if (rowIcon != nullptr) {
      if (const uint8_t* bitmap = iconForName(rowIcon(index), kMenuIconSize)) {
        const int iconY = rowY + (rowHeight - kMenuIconSize) / 2;
        if (selected) {
          renderer.drawIconInverted(bitmap, textX, iconY, kMenuIconSize);
        } else {
          renderer.drawIcon(bitmap, textX, iconY, kMenuIconSize);
        }
        textX += kMenuIconSize + kIconGap;
      }
    }

    const std::string label = renderer.truncatedText(UI_12_FONT_ID, buttonLabel(index).c_str(),
                                                     std::max(1, rect.x + rect.width - kRowPadding - textX));
    const int textY = rowY + (rowHeight - renderer.getLineHeight(UI_12_FONT_ID)) / 2;
    renderer.drawText(UI_12_FONT_ID, textX, textY, label.c_str(), !selected);
    drawDottedSeparator(renderer, rect.x, rowY + rowHeight - 1, rect.width);
  }

  drawScrollBar(renderer, rect, buttonCount, firstRow, visibleRows);
}

void InxTheme::drawOptionPopup(const GfxRenderer& renderer, const char* title, const std::vector<std::string>& options,
                               const int selectedIndex, const int firstVisible) const {
  if (options.empty()) return;

  const int optionCount = static_cast<int>(options.size());
  const auto layout = layoutOptionPopup(renderer, optionCount, selectedIndex, firstVisible);
  const Rect& panel = layout.panel;
  const bool scrolls = optionCount > layout.visibleRows;
  // The scrollbar owns the right edge, so labels stop short of it.
  const int textRight = panel.x + panel.width - (scrolls ? 30 : 18);

  renderer.fillRect(panel.x, panel.y, panel.width, panel.height, false);

  const std::string shownTitle = renderer.truncatedText(UI_10_FONT_ID, title, panel.width - 32, EpdFontFamily::BOLD);
  const int titleY = panel.y + (layout.headerHeight - renderer.getLineHeight(UI_10_FONT_ID)) / 2;
  renderer.drawText(UI_10_FONT_ID, panel.x + 16, titleY, shownTitle.c_str(), true, EpdFontFamily::BOLD);
  renderer.drawLine(panel.x, panel.y + layout.headerHeight - 1, panel.x + panel.width - 1,
                    panel.y + layout.headerHeight - 1, true);

  for (int slot = 0; slot < layout.visibleRows; ++slot) {
    const int optionIndex = layout.firstVisible + slot;
    if (optionIndex >= optionCount) break;

    const Rect row = layout.optionRect(slot);
    const bool selected = optionIndex == selectedIndex;
    // Inset the band so it never eats the panel's double rule.
    if (selected) renderer.fillRect(row.x + 2, row.y + 1, row.width - 4, row.height - 2, true);

    const std::string label =
        renderer.truncatedText(UI_10_FONT_ID, options[optionIndex].c_str(), textRight - row.x - 18);
    const int textY = row.y + (row.height - renderer.getLineHeight(UI_10_FONT_ID)) / 2;
    renderer.drawText(UI_10_FONT_ID, row.x + 18, textY, label.c_str(), !selected,
                      selected ? EpdFontFamily::BOLD : EpdFontFamily::REGULAR);
    if (slot + 1 < layout.visibleRows && optionIndex + 1 < optionCount) {
      drawDottedSeparator(renderer, panel.x + 2, row.y + row.height - 1, panel.width - 4);
    }
  }

  if (scrolls) {
    const int trackX = panel.x + panel.width - 10;
    const int trackY = panel.y + layout.headerHeight;
    const int trackHeight = layout.visibleRows * layout.rowHeight;
    const int maxStart = std::max(1, optionCount - layout.visibleRows);
    const int thumbHeight = std::max(8, trackHeight * layout.visibleRows / optionCount);
    const int thumbY = trackY + layout.firstVisible * (trackHeight - thumbHeight) / maxStart;
    renderer.fillRect(trackX, trackY, 2, trackHeight, true);
    renderer.fillRect(trackX - 2, thumbY, 6, thumbHeight, true);
  }

  // Double rule around the panel: the outer edge stops the list behind it, the
  // inner one is the frame the content sits in.
  renderer.drawRect(panel.x, panel.y, panel.width, panel.height, true);
  renderer.drawRect(panel.x + 1, panel.y + 1, panel.width - 2, panel.height - 2, true);
}
