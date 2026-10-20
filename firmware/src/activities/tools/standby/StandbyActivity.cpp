#include "StandbyActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>
#include <Memory.h>

#include <algorithm>
#include <memory>

#include "MappedInputManager.h"
#include "ChineseCalendarFace.h"
#include "SloppyClockFace.h"
#include "components/UITheme.h"
#include "components/themes/BaseTheme.h"
#include "fontIds.h"
#include "util/TimeUtils.h"

namespace {

// Face factory table. Add new faces by appending a row here and including the
// corresponding header above. Each entry declares an isAvailable() predicate so
// a face can be hidden under runtime conditions (e.g. portrait-only); when a
// face is unavailable it is skipped during cycling and the pager dots collapse.
struct FaceEntry {
  std::unique_ptr<StandbyFace> (*create)();
  bool (*isAvailable)(int sw, int sh);
};

constexpr FaceEntry kFaces[] = {
    {[]() -> std::unique_ptr<StandbyFace> { return makeUniqueNoThrow<SloppyClockFace>(); },
     [](int, int) { return true; }},
    // Chinese almanac (老黄历): portrait-only (needs the tall layout).
    {[]() -> std::unique_ptr<StandbyFace> { return makeUniqueNoThrow<ChineseCalendarFace>(); },
     [](int sw, int sh) { return sh > sw; }},
};

constexpr uint8_t kFaceCount = static_cast<uint8_t>(sizeof(kFaces) / sizeof(kFaces[0]));

uint8_t countAvailableFaces(int sw, int sh) {
  uint8_t n = 0;
  for (uint8_t i = 0; i < kFaceCount; ++i) {
    if (kFaces[i].isAvailable(sw, sh)) ++n;
  }
  return n;
}

// Map a "rank among available faces" (0-based) back to a kFaces[] index.
uint8_t availableFaceIndexFromRank(int sw, int sh, uint8_t rank) {
  uint8_t seen = 0;
  for (uint8_t i = 0; i < kFaceCount; ++i) {
    if (!kFaces[i].isAvailable(sw, sh)) continue;
    if (seen == rank) return i;
    ++seen;
  }
  return kFaceCount;
}

// Rank of an installed face index, counting only available faces.
uint8_t rankOfAvailableFace(int sw, int sh, uint8_t faceIdx) {
  uint8_t seen = 0;
  for (uint8_t i = 0; i < kFaceCount; ++i) {
    if (!kFaces[i].isAvailable(sw, sh)) continue;
    if (i == faceIdx) return seen;
    ++seen;
  }
  return 0;
}

// Bottom-center pager dots: one per available face, filled for the current one.
void drawFaceDots(const GfxRenderer& renderer, int sw, int sh, uint8_t total, uint8_t current) {
  if (total <= 1) return;
  constexpr int kDot = 4;
  constexpr int kGap = 8;
  constexpr int kBottomInset = 24;
  const int blockW = total * kDot + (total - 1) * kGap;
  int x = (sw - blockW) / 2;
  const int y = sh - kBottomInset - kDot;
  for (uint8_t i = 0; i < total; ++i) {
    if (i == current) {
      renderer.fillRect(x, y, kDot, kDot, true);
    } else {
      renderer.drawRect(x, y, kDot, kDot, 1, true);
    }
    x += kDot + kGap;
  }
}

}  // namespace

void StandbyActivity::onEnter() {
  Activity::onEnter();
  faceIndex_ = 0;
  if (!kFaces[0].isAvailable(renderer.getScreenWidth(), renderer.getScreenHeight())) {
    const uint8_t idx = availableFaceIndexFromRank(renderer.getScreenWidth(), renderer.getScreenHeight(), 0);
    if (idx < kFaceCount) faceIndex_ = idx;
  }
  inverseMode_ = false;
  currentFace_ = kFaces[faceIndex_].create();
  if (!currentFace_) {
    finish();  // OOM: nothing to show, pop back to the Tools menu
    return;
  }
  currentFace_->onEnter();
  requestUpdate();
}

void StandbyActivity::switchFace(int8_t delta) {
  const int sw = renderer.getScreenWidth();
  const int sh = renderer.getScreenHeight();
  const uint8_t avail = countAvailableFaces(sw, sh);
  if (avail <= 1) return;

  const uint8_t curRank = rankOfAvailableFace(sw, sh, faceIndex_);
  const uint8_t newRank = static_cast<uint8_t>((curRank + avail + delta) % avail);
  const uint8_t newIdx = availableFaceIndexFromRank(sw, sh, newRank);
  if (newIdx >= kFaceCount || newIdx == faceIndex_) return;

  if (currentFace_) currentFace_->onExit();
  currentFace_.reset();
  faceIndex_ = newIdx;
  currentFace_ = kFaces[faceIndex_].create();
  if (!currentFace_) {
    finish();  // OOM fallback
    return;
  }
  currentFace_->onEnter();
  requestUpdate();
}

void StandbyActivity::processFaceTick() {
  if (!currentFace_) return;
  switch (currentFace_->tick()) {
    case StandbyFace::TickResult::None:
      return;
    case StandbyFace::TickResult::Redraw:
    case StandbyFace::TickResult::RedrawWithGhostCleanup:
      break;
  }
  requestUpdate();
}

void StandbyActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();  // pop back to the Tools menu
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    inverseMode_ = !inverseMode_;
    requestUpdate();
    return;
  }
  // Up/Down: per-face page gesture (Sloppy clock rerolls its style; almanac flips day).
  const bool upPressed = mappedInput.wasReleased(MappedInputManager::Button::Up);
  const bool downPressed = mappedInput.wasReleased(MappedInputManager::Button::Down);
  if (upPressed || downPressed) {
    if (currentFace_) {
      if (upPressed) {
        currentFace_->onPagePrev();
      } else {
        currentFace_->onPageNext();
      }
      requestUpdate();
    }
    return;
  }
  // Left/Right: cycle faces (silent no-op with a single face installed).
  if (mappedInput.wasReleased(MappedInputManager::Button::Left) ||
      mappedInput.wasReleased(MappedInputManager::Button::Right)) {
    const int8_t delta = mappedInput.wasReleased(MappedInputManager::Button::Right) ? 1 : -1;
    switchFace(delta);
    return;
  }
  processFaceTick();
}

void StandbyActivity::render(RenderLock&&) {
  if (!currentFace_) return;

  const auto& metrics = UITheme::getInstance().getMetrics();
  const int sw = renderer.getScreenWidth();
  const int sh = renderer.getScreenHeight();
  int viewTop = 0;
  int viewRight = 0;
  int viewBottom = 0;
  int viewLeft = 0;
  renderer.getOrientedViewableTRBL(&viewTop, &viewRight, &viewBottom, &viewLeft);
  const Rect faceViewport{viewLeft, viewTop, sw - viewLeft - viewRight, sh - viewTop - viewBottom};
  const int overlayTop = std::max(metrics.topPadding, viewTop);

  renderer.clearScreen();

  const bool clockValid = TimeUtils::isClockValid();
  if (!clockValid) {
    // No trustworthy wall clock yet (C61 has no hardware RTC). Show an explicit
    // "sync first" placeholder instead of a misleading fallback time.
    UITheme::drawCenteredText(renderer, faceViewport, SMALL_FONT_ID, overlayTop, tr(STR_STANDBY_NEED_SYNC));
  } else {
    {
      const GfxRenderer::ClipScope clip(renderer, faceViewport.x, faceViewport.y, faceViewport.width,
                                        faceViewport.height);
      currentFace_->render(renderer, faceViewport);
    }
    // Top-center face title (small, minimal chrome).
    UITheme::drawCenteredText(renderer, faceViewport, SMALL_FONT_ID, overlayTop, I18N[currentFace_->titleId()]);

    // Top-right battery icon (no percentage text).
    constexpr int kBatW = 16;
    constexpr int kBatH = 12;
    GUI.drawBatteryRight(renderer, Rect{sw - viewRight - kBatW - metrics.contentSidePadding, overlayTop, kBatW, kBatH},
                         /*showPercentage=*/false);

    const uint8_t availFaces = countAvailableFaces(sw, sh);
    const uint8_t curRank = rankOfAvailableFace(sw, sh, faceIndex_);
    drawFaceDots(renderer, sw, sh, availFaces, curRank);
  }

  if (inverseMode_) renderer.invertScreen();
  renderer.displayBuffer();

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
}
