#pragma once

#include "components/themes/lyra/LyraTheme.h"

class GfxRenderer;

// Card theme metrics: Lyra layout tuned for a "restrained, all-cards" look.
// Every interactive block (header / tab / list row / menu button / hints / cover)
// is wrapped in a rounded card frame; the wider spacing leaves room for the
// 1px strokes so cards never touch each other.
namespace CardMetrics {
constexpr ThemeMetrics values = [] {
  ThemeMetrics v = LyraMetrics::values;
  v.verticalSpacing = 20;              // more breathing room between cards
  v.listRowHeight = 48;                // roomier single-line card
  v.listWithSubtitleRowHeight = 72;     // roomier subtitle card
  v.menuRowHeight = 72;                // menu button card
  v.menuSpacing = 10;                  // gap between button cards
  v.tabBarHeight = 44;
  v.tabSpacing = 12;                   // gap between tab cards
  v.headerHeight = 96;                 // tall enough to enclose the header card
  v.contentSidePadding = 24;           // cards inset further from the screen edge
  v.popupCornerRadius = 8;             // popups read as cards too
  return v;
}();
}  // namespace CardMetrics

// "Card" theme — inherits Lyra (cover rendering, buffer management, paging
// helpers) and overrides only the visually-card-ified draw methods.
class CardTheme : public LyraTheme {
 public:
  int getListPageItems(int contentHeight, bool hasSubtitle) const override;
  void drawHeader(const GfxRenderer& renderer, Rect rect, const char* title, const char* subtitle) const override;
  void drawSubHeader(const GfxRenderer& renderer, Rect rect, const char* label,
                     const char* rightLabel = nullptr) const override;
  void drawTabBar(const GfxRenderer& renderer, Rect rect, const std::vector<TabInfo>& tabs,
                  bool selected) const override;
  void drawList(const GfxRenderer& renderer, Rect rect, int itemCount, int selectedIndex,
                const std::function<std::string(int index)>& rowTitle,
                const std::function<std::string(int index)>& rowSubtitle,
                const std::function<UIIcon(int index)>& rowIcon, const std::function<std::string(int index)>& rowValue,
                bool highlightValue, const std::function<bool(int index)>& rowDimmed = nullptr) const override;
  void drawButtonHints(GfxRenderer& renderer, const char* btn1, const char* btn2, const char* btn3,
                       const char* btn4) const override;
  void drawButtonMenu(GfxRenderer& renderer, Rect rect, int buttonCount, int selectedIndex,
                      const std::function<std::string(int index)>& buttonLabel,
                      const std::function<UIIcon(int index)>& rowIcon) const override;
  void drawRecentBookCover(GfxRenderer& renderer, Rect rect, const std::vector<RecentBook>& recentBooks,
                           const int selectorIndex, bool& coverRendered, bool& coverBufferStored, bool& bufferRestored,
                           std::function<bool()> storeCoverBuffer) const override;
};
