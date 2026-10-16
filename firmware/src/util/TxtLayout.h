#pragma once

#include <GfxRenderer.h>

#include <algorithm>
#include <cstdint>

#include "CrossPointSettings.h"
#include "components/UITheme.h"

// Authoritative TXT reading-layout geometry. Single source of truth shared by
// TxtReaderActivity (page-index build + rendering) and the web TXT index
// generator (/api/txt-layout), so a browser-built index.bin can never disagree
// with the values loadPageIndexCache() validates against. Keep every formula
// here in lockstep with the reader; do not duplicate any of it elsewhere.
namespace TxtLayout {

// The reader lays out one page per CHUNK_SIZE byte window (fresh window at each
// page start). A source line whose newline falls outside the window ends the
// page early — web simulations must replicate this to land on identical offsets.
constexpr uint32_t CHUNK_SIZE = 8 * 1024;

struct Metrics {
  int fontId = 0;
  int viewportWidth = 0;
  int linesPerPage = 0;
  int lineHeight = 0;       // renderer.getLineHeight(fontId)
  int orientedMarginTop = 0;    // VIEWABLE_MARGIN_TOP + screenMargin (render y origin)
  int orientedMarginLeft = 0;   // VIEWABLE_MARGIN_LEFT + screenMargin (render x origin)
  uint8_t screenMargin = 0;
  uint8_t paragraphAlignment = 0;
};

inline Metrics compute(const GfxRenderer& renderer) {
  Metrics m;
  m.fontId = SETTINGS.getReaderFontId();
  m.screenMargin = SETTINGS.screenMargin;
  m.paragraphAlignment = SETTINGS.paragraphAlignment;

  int orientedTop = 0, orientedRight = 0, orientedBottom = 0, orientedLeft = 0;
  renderer.getOrientedViewableTRBL(&orientedTop, &orientedRight, &orientedBottom, &orientedLeft);
  orientedTop += m.screenMargin;
  orientedLeft += m.screenMargin;
  orientedRight += m.screenMargin;
  orientedBottom += std::max(static_cast<int>(m.screenMargin), UITheme::getInstance().getStatusBarHeight());

  m.viewportWidth = renderer.getScreenWidth() - orientedLeft - orientedRight;
  const int viewportHeight = renderer.getScreenHeight() - orientedTop - orientedBottom;
  m.lineHeight = renderer.getLineHeight(m.fontId);

  m.linesPerPage = viewportHeight / m.lineHeight;
  if (m.linesPerPage < 1) m.linesPerPage = 1;

  m.orientedMarginTop = orientedTop;
  m.orientedMarginLeft = orientedLeft;
  return m;
}

}  // namespace TxtLayout
