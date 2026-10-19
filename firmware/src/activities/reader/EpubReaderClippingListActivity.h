#pragma once

#include <Epub.h>

#include <memory>
#include <string>
#include <vector>

#include "ClippingStore.h"
#include "../Activity.h"
#include "util/ButtonNavigator.h"

// Button-driven browser for the current book's ClippingStore contents.
// C61 port of CrossMux's EpubReaderClippingListActivity: the upstream class
// derived from UiListActivity (freeink-sdk); this replacement derives from our
// plain Activity and mirrors the EpubReaderBookmarksActivity layout instead.
class EpubReaderClippingListActivity final : public Activity {
  std::shared_ptr<Epub> epub;
  std::string epubPath;
  ButtonNavigator buttonNavigator;
  int selectorIndex = 0;
  int confirmingDelete = 0;  // 0=off, 1=display prompt, 2=awaiting second Confirm

 public:
  explicit EpubReaderClippingListActivity(GfxRenderer& renderer, MappedInputManager& mappedInput,
                                          const std::shared_ptr<Epub>& epub, const std::string& epubPath)
      : Activity("EpubReaderClippingList", renderer, mappedInput), epub(epub), epubPath(epubPath) {}

  void onEnter() override;
  void onExit() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  static constexpr int PREVIEW_ROW_LINES = 2;
  int getGutterBottom(const GfxRenderer& renderer);
  int getListHeight(const GfxRenderer& renderer);
  void renderPreviewRow(int index, int x, int y, int width, int height);
};
