#include "EpubReaderClippingListActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <algorithm>
#include <array>
#include <cstdio>

#include "ClippingStore.h"
#include "MappedInputManager.h"
#include "ProgressMapper.h"
#include "clippings/ClippingPreview.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
constexpr int ENTER_DELETE_MODE_MS = 700;
constexpr int DELETE_MODE_OFF = 0;
constexpr int DELETE_MODE_DISPLAY = 1;
constexpr int DELETE_MODE_CONFIRM = 2;

constexpr int LINE_HEIGHT = 60;
constexpr uint16_t kInvalidSpine = 0xFFFF;
}  // namespace

void EpubReaderClippingListActivity::onEnter() {
  Activity::onEnter();
  // Snap the selector onto the first clipping (if any); the store is already
  // loaded by the reader before we get here.
  selectorIndex = CLIPPINGS.clippingCount() > 0 ? 0 : -1;
  requestUpdate();
}

void EpubReaderClippingListActivity::onExit() { Activity::onExit(); }

int EpubReaderClippingListActivity::getGutterBottom(const GfxRenderer& r) {
  const auto orientation = r.getOrientation();
  const bool isPortrait = orientation == GfxRenderer::Orientation::Portrait;
  return isPortrait ? 75 : 40;
}

int EpubReaderClippingListActivity::getListHeight(const GfxRenderer& r) {
  return r.getScreenHeight() - getGutterBottom(r) - LINE_HEIGHT;
}

void EpubReaderClippingListActivity::renderPreviewRow(int /*index*/, int /*x*/, int /*y*/, int /*width*/,
                                                      int /*height*/) {
  // Previews are surfaced via the drawList subtitle callback; the helper is
  // kept for symmetry with future row-windowing if SD reads need batching.
}

void EpubReaderClippingListActivity::loop() {
  const size_t count = CLIPPINGS.clippingCount();

  // Delete confirmation flow mirrors EpubReaderBookmarksActivity.
  if (confirmingDelete >= DELETE_MODE_DISPLAY) {
    if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
      if (confirmingDelete == DELETE_MODE_DISPLAY) {
        confirmingDelete = DELETE_MODE_CONFIRM;
        requestUpdate();
        return;
      }
      if (selectorIndex >= 0 && static_cast<size_t>(selectorIndex) < count) {
        if (!CLIPPINGS.removeClippingAt(static_cast<size_t>(selectorIndex))) {
          LOG_ERR("CLIP", "Failed to remove clipping at %d", selectorIndex);
        }
        CLIPPINGS.saveToFile();
      }
      const size_t newCount = CLIPPINGS.clippingCount();
      if (newCount == 0) {
        ActivityResult result;
        result.isCancelled = true;
        setResult(std::move(result));
        finish();
        return;
      }
      if (selectorIndex >= static_cast<int>(newCount)) selectorIndex = static_cast<int>(newCount) - 1;
      confirmingDelete = DELETE_MODE_OFF;
      requestUpdate();
      return;
    }
    if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
      confirmingDelete = DELETE_MODE_OFF;
      requestUpdate();
      return;
    }
    return;
  }

  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    if (selectorIndex < 0 || static_cast<size_t>(selectorIndex) >= count) return;
    const Clipping* c = CLIPPINGS.clippingAt(static_cast<size_t>(selectorIndex));
    if (!c) return;
    // Bounce back into the reader at the stored page. spineIndex is chapter-stable;
    // page is chapter-relative — the reader will re-anchor by layoutSignature.
    const int spine = c->spineIndex == kInvalidSpine ? 0 : static_cast<int>(c->spineIndex);
    const int page = static_cast<int>(c->startPage);
    setResult(ProgressChangeResult{spine, page});
    finish();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    ActivityResult result;
    result.isCancelled = true;
    setResult(std::move(result));
    finish();
    return;
  }

  if (mappedInput.isPressed(MappedInputManager::Button::Confirm) && mappedInput.getHeldTime() > ENTER_DELETE_MODE_MS &&
      count > 0 && selectorIndex >= 0) {
    confirmingDelete = DELETE_MODE_DISPLAY;
    requestUpdate();
    return;
  }

  buttonNavigator.onNextRelease([this, count] {
    selectorIndex = ButtonNavigator::nextIndex(selectorIndex, static_cast<int>(count));
    requestUpdate();
  });
  buttonNavigator.onPreviousRelease([this, count] {
    selectorIndex = ButtonNavigator::previousIndex(selectorIndex, static_cast<int>(count));
    requestUpdate();
  });
  const int pageItems = GUI.getListPageItems(getListHeight(renderer), true);
  buttonNavigator.onNextContinuous([this, count, pageItems] {
    selectorIndex = ButtonNavigator::nextPageIndex(selectorIndex, static_cast<int>(count), pageItems);
    requestUpdate();
  });
  buttonNavigator.onPreviousContinuous([this, count, pageItems] {
    selectorIndex = ButtonNavigator::previousPageIndex(selectorIndex, static_cast<int>(count), pageItems);
    requestUpdate();
  });
}

void EpubReaderClippingListActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();
  const auto orientation = renderer.getOrientation();
  const bool isLandscapeCw = orientation == GfxRenderer::Orientation::LandscapeClockwise;
  const bool isLandscapeCcw = orientation == GfxRenderer::Orientation::LandscapeCounterClockwise;
  const bool isPortraitInverted = orientation == GfxRenderer::Orientation::PortraitInverted;
  const bool isPortrait = orientation == GfxRenderer::Orientation::Portrait;
  const int hintGutterWidth = (isLandscapeCw || isLandscapeCcw) ? 40 : 0;
  const int contentX = isLandscapeCw ? hintGutterWidth : 0;
  const int contentWidth = pageWidth - hintGutterWidth;
  const int hintGutterHeight = isPortraitInverted ? 50 : 0;
  const int hintGutterBottom = getGutterBottom(renderer);
  const int contentY = hintGutterHeight;
  const int listY = contentY + LINE_HEIGHT;
  const int listHeight = getListHeight(renderer);

  const size_t count = CLIPPINGS.clippingCount();

  const int titleX =
      contentX + (contentWidth - renderer.getTextWidth(UI_12_FONT_ID, tr(STR_CLIPPING_LIST), EpdFontFamily::BOLD)) / 2;
  renderer.drawText(UI_12_FONT_ID, titleX, 15 + contentY, tr(STR_CLIPPING_LIST), true, EpdFontFamily::BOLD);

  if (count == 0) {
    GUI.drawEmptyState(renderer, Rect{contentX, listY, contentWidth, listHeight}, UIIcon::None,
                       tr(STR_CLIPPING_EMPTY));
  } else {
    const int displayIndex = confirmingDelete >= DELETE_MODE_DISPLAY ? selectorIndex : -1;
    auto rowTitle = [displayIndex](int index) -> std::string {
      const size_t i = static_cast<size_t>(displayIndex >= 0 ? displayIndex : index);
      const Clipping* c = CLIPPINGS.clippingAt(i);
      if (!c) return "";
      return std::string(tr(STR_CLIPPING_PAGE)) + " " + std::to_string(static_cast<int>(c->startPage) + 1);
    };
    auto rowSubtitle = [displayIndex](int index) -> std::string {
      const size_t i = static_cast<size_t>(displayIndex >= 0 ? displayIndex : index);
      std::array<char, clippingPreview::BUFFER_BYTES> buf{};
      size_t len = 0;
      if (!CLIPPINGS.readClippingPreview(i, buf.data(), buf.size(), len)) return "";
      return std::string(buf.data(), len);
    };
    auto rowIcon = [isPortrait](int) -> UIIcon { return isPortrait ? UIIcon::Bookmark : UIIcon::None; };

    if (confirmingDelete >= DELETE_MODE_DISPLAY) {
      GUI.drawHelpText(renderer, Rect{0, pageHeight / 2 - LINE_HEIGHT * 2, contentWidth, LINE_HEIGHT},
                        tr(STR_CONFIRM_DELETE_CLIPPING));
      GUI.drawList(renderer, Rect{contentX, pageHeight / 2, contentWidth, LINE_HEIGHT}, 1, 0, rowTitle, rowSubtitle,
                   rowIcon);
    } else {
      GUI.drawList(renderer, Rect{contentX, listY, contentWidth, listHeight}, static_cast<int>(count), selectorIndex,
                   rowTitle, rowSubtitle, rowIcon);
      GUI.drawHelpText(renderer, Rect{contentX, pageHeight - hintGutterBottom, contentWidth, LINE_HEIGHT},
                        tr(STR_CLIPPING_HOLD_TO_DELETE));
    }
  }

  const auto backLabel = confirmingDelete >= DELETE_MODE_DISPLAY ? tr(STR_CANCEL) : tr(STR_BACK);
  const auto confirmLabel =
      count > 0 ? (confirmingDelete >= DELETE_MODE_DISPLAY ? tr(STR_DELETE) : tr(STR_SELECT)) : "";
  const auto labels = mappedInput.mapLabels(backLabel, confirmLabel, tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  renderer.displayBuffer();
}
