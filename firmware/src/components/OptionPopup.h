#pragma once

#include <I18n.h>
#include <fontIds.h>

#include <algorithm>
#include <array>
#include <functional>
#include <string>

#include "GfxRenderer.h"
#include "MappedInputManager.h"
#include "components/UITheme.h"
#include "components/themes/BaseTheme.h"

// Header-only minimal option picker for button-only devices (ESP32-C61).
// Mirrors the small subset of the CrossMux OptionPopup API that vendor ported
// activities rely on (show / handleButtons / isActive / processRender / dismiss).
// Touch code paths in the upstream class were removed because our MappedInput
// surface has no screen-tap or swipe events.
class OptionPopup {
 public:
  static constexpr int MAX_OPTIONS = 8;

  void show(StrId titleId, const StrId* optionIds, int optionCount, int currentIndex,
            std::function<void(int)> onSelect) {
    titleText = I18N.get(titleId);
    count = std::clamp(optionCount, 0, MAX_OPTIONS);
    for (int i = 0; i < count; ++i) {
      options[i] = I18N.get(optionIds[i]);
    }
    selected = std::clamp(currentIndex, 0, std::max(0, count - 1));
    callback = std::move(onSelect);
    active = count > 0;
  }

  void show(const char* titleStr, const char* const* optionStrs, int optionCount, int currentIndex,
            std::function<void(int)> onSelect) {
    titleText = titleStr ? titleStr : "";
    count = std::clamp(optionCount, 0, MAX_OPTIONS);
    for (int i = 0; i < count; ++i) {
      options[i] = optionStrs && optionStrs[i] ? optionStrs[i] : "";
    }
    selected = std::clamp(currentIndex, 0, std::max(0, count - 1));
    callback = std::move(onSelect);
    active = count > 0;
  }

  bool isActive() const { return active; }

  // Consume PREVIOUS/NEXT to move the highlight, CONFIRM to fire the callback,
  // BACK to dismiss silently. Returns true when the popup is active (owns the
  // input); callers should skip their own button handling in that case.
  bool handleButtons(bool prev, bool next, bool confirm, bool back, std::function<void()> requestUpdate) {
    if (!active) return false;
    if (prev || next) {
      if (count > 1) {
        const int delta = next ? 1 : -1;
        selected = (selected + delta + count) % count;
      }
      if (requestUpdate) requestUpdate();
      return true;
    }
    if (confirm) {
      auto cb = callback;
      int index = selected;
      active = false;
      callback = nullptr;
      if (cb) cb(index);
      if (requestUpdate) requestUpdate();
      return true;
    }
    if (back) {
      active = false;
      callback = nullptr;
      if (requestUpdate) requestUpdate();
      return true;
    }
    // Active popup swallows any other button so stray inputs don't reach the host.
    return true;
  }

  // Same as handleButtons() but decodes a packed buttonEdges bitfield.
  bool handleButtons(uint8_t buttonsPacked, uint8_t maskPrev, uint8_t maskNext, uint8_t maskConfirm, uint8_t maskBack,
                     std::function<void()> requestUpdate) {
    return handleButtons((buttonsPacked & maskPrev) != 0, (buttonsPacked & maskNext) != 0,
                         (buttonsPacked & maskConfirm) != 0, (buttonsPacked & maskBack) != 0, std::move(requestUpdate));
  }

  void dismiss() {
    active = false;
    callback = nullptr;
  }

  // Draws the popup over the current framebuffer. Returns true if the popup
  // was active and rendered (callers skip their own render work in that case).
  bool processRender(GfxRenderer& renderer, MappedInputManager& /*mappedInput*/) const {
    if (!active) return false;
    auto& gui = UITheme::getInstance().getTheme();
    const int screenW = renderer.getScreenWidth();
    const int screenH = renderer.getScreenHeight();
    const int lineHeight = renderer.getLineHeight(UI_12_FONT_ID);
    const int padding = 12;
    const int boxH = padding * 2 + lineHeight * (count + 1) + lineHeight / 2;
    const int boxW = std::min(screenW - 24, 320);
    const int boxX = (screenW - boxW) / 2;
    const int boxY = (screenH - boxH) / 2;
    const Rect popupRect = gui.drawPopup(renderer, titleText.c_str());
    // drawPopup centres by message width; overlay option list below it.
    (void)popupRect;
    int y = boxY + padding + lineHeight;
    for (int i = 0; i < count; ++i) {
      const bool isSel = i == selected;
      if (isSel) {
        renderer.fillRect(boxX + 4, y - 2, boxW - 8, lineHeight + 4, false);
      }
      const int textW = renderer.getTextWidth(UI_12_FONT_ID, options[i].c_str());
      renderer.drawText(UI_12_FONT_ID, boxX + (boxW - textW) / 2, y, options[i].c_str(), !isSel);
      y += lineHeight;
    }
    renderer.displayBuffer();
    return true;
  }

 private:
  bool active = false;
  std::string titleText;
  std::array<std::string, MAX_OPTIONS> options{};
  int count = 0;
  int selected = 0;
  std::function<void(int)> callback;
};
