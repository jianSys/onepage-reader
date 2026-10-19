#pragma once

#include <string>
#include <vector>

#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// AirPage (P6, LAN-only MVP). A small front-end over the device web server's existing
// `POST /airpage` push endpoint. It browses pushed card images stored on the SD card under
// /AirPage, opens them full-screen via BmpViewerActivity (which also offers "set as sleep
// cover"), and shows a pairing screen with a QR + URL so a phone can push a rendered card to
// the device. CrossMux's cloud MQTT realtime is intentionally NOT ported (proprietary
// broker/backend); receiving happens while the device's Web Server (Transfer page) is running.
class AirPageActivity final : public Activity {
 public:
  explicit AirPageActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("AirPage", renderer, mappedInput) {}
  ~AirPageActivity() override = default;

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  enum class Screen : uint8_t { Gallery, Connect };

  static constexpr const char* kGalleryDir = "/AirPage";

  Screen screen = Screen::Gallery;
  std::vector<std::string> images;  // file names under kGalleryDir, newest first
  int selectorIndex = 0;
  ButtonNavigator buttonNavigator;

  void rescan();
  std::string fullPath(size_t idx) const;
  std::string pushUrl() const;
  void openSelected();
  void renderGallery();
  void renderConnect();
};
