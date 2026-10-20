#include "BootActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include "fontIds.h"
#include "images/Logo120.h"

bool BootActivity::uiFontsReady_ = false;

namespace {
// ASCII-only text can be drawn with the flash-resident UI font, so the splash
// may show it before the SD card is touched at all.
bool isAsciiOnly(const char* text) {
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(text); *p != '\0'; ++p) {
    if (*p >= 0x80) return false;
  }
  return true;
}
}  // namespace

void BootActivity::onEnter() {
  Activity::onEnter();
  paint();
}

void BootActivity::render(RenderLock&&) { paint(); }

void BootActivity::paint() const {
  const auto pageWidth = renderer.getScreenWidth();
  const auto pageHeight = renderer.getScreenHeight();

  renderer.clearScreen();
  renderer.drawImage(Logo120, (pageWidth - 120) / 2, (pageHeight - 120) / 2, 120, 120);
  renderer.drawCenteredText(UI_10_FONT_ID, pageHeight / 2 + 70, tr(STR_CROSSPOINT), true, EpdFontFamily::BOLD);
  const char* booting = tr(STR_BOOTING);
  if (uiFontsReady_ || isAsciiOnly(booting)) {
    // A little clear of the wordmark above: the two lines share the centre band.
    renderer.drawCenteredText(SMALL_FONT_ID, pageHeight / 2 + 103, booting);
  }
  renderer.drawCenteredText(SMALL_FONT_ID, pageHeight - 30, CROSSPOINT_VERSION);
  renderer.displayBuffer();
}
