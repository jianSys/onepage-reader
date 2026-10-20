#pragma once

#include "components/themes/lyra/LyraTheme.h"

// Inx theme — ported from CrossMux (the upstream default).
//
// The look is deliberately flat and rule-based: no cards or pills, a single
// hairline under the header, dotted separators between rows, a full-width
// inverted band for the selection, and bottom hints that are plain white boxes
// with a dithered bar under the label.
//
// Scope note: this is a visual port only. CrossMux's Inx build also drives a
// main tab bar (Recent/Library/Settings/...) that lives in its 1.6.x core and is
// absent from this fork's activity layer, so Home keeps the shared cover + menu
// shape. The option popup below is the one CrossMux component this fork can
// carry over as-is.
namespace InxMetrics {
constexpr ThemeMetrics values = [] {
  ThemeMetrics v = LyraMetrics::values;
  v.topPadding = 0;
  v.batteryBarHeight = 24;
  v.headerHeight = 66;
  v.verticalSpacing = 0;
  v.contentSidePadding = 20;
  v.listRowHeight = 66;
  v.listWithSubtitleRowHeight = 66;
  v.menuRowHeight = 66;
  v.menuSpacing = 0;
  v.tabBarHeight = 40;
  v.tabSpacing = 8;
  v.scrollBarWidth = 6;
  v.scrollBarRightOffset = 2;
  v.keyboardKeyHeight = 56;
  v.keyboardWidthPercent = 94;
  v.keyboardTextFieldWidthPercent = 85;
  v.keyboardVerticalOffset = -7;
  return v;
}();
}  // namespace InxMetrics

class InxTheme final : public LyraTheme {
 public:
  void drawHeader(const GfxRenderer& renderer, Rect rect, const char* title,
                  const char* subtitle = nullptr) const override;
  void drawSubHeader(const GfxRenderer& renderer, Rect rect, const char* label,
                     const char* rightLabel = nullptr) const override;
  void drawTabBar(const GfxRenderer& renderer, Rect rect, const std::vector<TabInfo>& tabs,
                  bool selected) const override;
  void drawButtonHints(GfxRenderer& renderer, const char* btn1, const char* btn2, const char* btn3,
                       const char* btn4) const override;
  void drawSideButtonHints(const GfxRenderer& renderer, const char* topBtn, const char* bottomBtn) const override;
  int getListPageItems(int contentHeight, bool hasSubtitle) const override;
  void drawList(const GfxRenderer& renderer, Rect rect, int itemCount, int selectedIndex,
                const std::function<std::string(int index)>& rowTitle,
                const std::function<std::string(int index)>& rowSubtitle,
                const std::function<UIIcon(int index)>& rowIcon, const std::function<std::string(int index)>& rowValue,
                bool highlightValue, const std::function<bool(int index)>& rowDimmed) const override;
  void drawButtonMenu(GfxRenderer& renderer, Rect rect, int buttonCount, int selectedIndex,
                      const std::function<std::string(int index)>& buttonLabel,
                      const std::function<UIIcon(int index)>& rowIcon) const override;
  void drawOptionPopup(const GfxRenderer& renderer, const char* title, const std::vector<std::string>& options,
                       int selectedIndex, int firstVisible = -1) const override;
  bool usesOptionPopup() const override { return true; }
};
