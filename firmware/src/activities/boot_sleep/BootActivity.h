#pragma once
#include "activities/Activity.h"

class BootActivity final : public Activity {
 public:
  explicit BootActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("Boot", renderer, mappedInput) {}
  void onEnter() override;
  void render(RenderLock&&) override;

  // The localized status line needs glyphs from the SD-resident CJK UI font,
  // which is only loaded after the splash is already on screen. Until that
  // lands the line is skipped (it would otherwise paint replacement boxes);
  // main.cpp flips this and requests one repaint once the font is in.
  static void setUiFontsReady() { uiFontsReady_ = true; }

 private:
  void paint() const;

  static bool uiFontsReady_;
};
