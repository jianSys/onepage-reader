#pragma once

#include <GfxRenderer.h>
#include <Utf8.h>
#include <cstdint>
#include <string>

// Shared rendering helpers for the CrossMux-style tool activities:
// letter-spaced editorial "eyebrow" labels, rounded cards, and bilingual
// eyebrow strings ("中文 · ENGLISH"), matching the CrossMux AirPage cards.
namespace ToolsUi {

// Draw text with manual letter-spacing so Latin and CJK glyphs both track evenly.
inline int drawTracked(GfxRenderer& r, int fontId, const char* text, int x, int y, int tracking, bool colored) {
  std::string s(text);
  size_t i = 0;
  int cx = x;
  while (i < s.size()) {
    const unsigned char c = static_cast<unsigned char>(s[i]);
    const int n = (c < 0x80) ? 1 : ((c >> 5) == 0x6) ? 2 : ((c >> 4) == 0xE) ? 3 : ((c >> 3) == 0x1E) ? 4 : 1;
    const std::string g = s.substr(i, n);
    r.drawText(fontId, cx, y, g.c_str(), colored);
    cx += r.getTextWidth(fontId, g.c_str()) + tracking;
    i += n;
  }
  return cx - x - tracking;
}

// Rounded card: border by default, or filled (inverted) when `filled` is true.
inline void drawCard(GfxRenderer& r, int x, int y, int w, int h, int radius = 10, bool filled = false) {
  if (filled) {
    r.fillRoundedRect(x, y, w, h, radius, Color::Black);
  } else {
    r.drawRoundedRect(x, y, w, h, 1, radius, true);
  }
}

// Bilingual eyebrow string, e.g. "词典 · DICTIONARY".
inline std::string eyebrow(const char* zh, const char* en) { return std::string(zh) + " · " + en; }

// Draw `text` wrapped to `maxW`, stopping at `maxBottom` (card edge). Walks the
// string by Unicode codepoint so CJK glyph widths are measured correctly.
// Returns the y just past the last drawn line.
inline int drawWrappedText(GfxRenderer& r, int fontId, const std::string& text, int x, int y, int maxW,
                           int maxBottom, int lineH) {
  const unsigned char* p = reinterpret_cast<const unsigned char*>(text.c_str());
  std::string lineStr;
  int lineW = 0;
  while (*p && y <= maxBottom) {
    const unsigned char* cur = p;
    const uint32_t cp = utf8NextCodepoint(&p);
    if (cp == 0) break;
    std::string ch(reinterpret_cast<const char*>(cur), static_cast<size_t>(p - cur));
    if (cp == '\n') {
      if (!lineStr.empty()) {
        r.drawText(fontId, x, y, lineStr.c_str(), true);
        y += lineH;
        lineStr.clear();
        lineW = 0;
      }
      y += lineH;  // paragraph gap
      continue;
    }
    const int cw = r.getTextWidth(fontId, ch.c_str());
    if (!lineStr.empty() && (lineW + cw > maxW)) {
      r.drawText(fontId, x, y, lineStr.c_str(), true);
      y += lineH;
      lineStr.clear();
      lineW = 0;
      if (y > maxBottom) break;
    }
    lineStr += ch;
    lineW += cw;
  }
  if (!lineStr.empty() && y <= maxBottom) {
    r.drawText(fontId, x, y, lineStr.c_str(), true);
  }
  return y;
}

}  // namespace ToolsUi
