#include "AirPageActivity.h"

#include <GfxRenderer.h>
#include <HalStorage.h>
#include <I18n.h>
#include <WiFi.h>

#include <algorithm>
#include <cctype>
#include <memory>

#include "FsHelpers.h"
#include "activities/util/BmpViewerActivity.h"
#include "components/UITheme.h"
#include "fontIds.h"
#include "util/QrUtils.h"

namespace {
bool hasBmpSuffix(const std::string& name) {
  if (name.size() < 4) return false;
  std::string ext = name.substr(name.size() - 4);
  for (char& c : ext) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return ext == ".bmp";
}
}  // namespace

void AirPageActivity::onEnter() {
  Activity::onEnter();
  renderer.setOrientation(GfxRenderer::Orientation::Portrait);
  // Make sure the gallery dir exists so /airpage?path=/AirPage pushes can land.
  if (!Storage.exists(kGalleryDir)) Storage.mkdir(kGalleryDir);
  rescan();
  screen = images.empty() ? Screen::Connect : Screen::Gallery;
  requestUpdate();
}

void AirPageActivity::rescan() {
  images.clear();
  selectorIndex = 0;

  auto dir = Storage.open(kGalleryDir);
  if (!dir || !dir.isDirectory()) {
    if (dir) dir.close();
    return;
  }
  char name[256];
  for (auto file = dir.openNextFile(); file; file = dir.openNextFile()) {
    if (!file.isDirectory()) {
      file.getName(name, sizeof(name));
      if (name[0] != '.') {
        std::string fname(name);
        if (hasBmpSuffix(fname)) images.push_back(fname);
      }
    }
    file.close();
  }
  dir.close();

  FsHelpers::sortFileList(images);          // alphabetical (oldest first for typical naming)
  std::reverse(images.begin(), images.end());  // newest first
}

std::string AirPageActivity::fullPath(size_t idx) const {
  std::string p = kGalleryDir;
  p += "/";
  p += images[idx];
  return p;
}

std::string AirPageActivity::pushUrl() const {
  String ip;
  if (WiFi.status() == WL_CONNECTED) {
    ip = WiFi.localIP().toString();
  } else {
    const String apIp = WiFi.softAPIP().toString();
    if (apIp != "0.0.0.0") ip = apIp;
  }
  const std::string host = ip.isEmpty() ? std::string("crosspoint.local") : std::string(ip.c_str());
  return "http://" + host + "/airpage?path=/AirPage";
}

void AirPageActivity::openSelected() {
  if (images.empty() || selectorIndex < 0 || selectorIndex >= static_cast<int>(images.size())) return;
  const std::string path = fullPath(static_cast<size_t>(selectorIndex));
  auto handler = [this](const ActivityResult&) {
    rescan();
    requestUpdate();
  };
  startActivityForResult(std::make_unique<BmpViewerActivity>(renderer, mappedInput, path), std::move(handler));
}

void AirPageActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();  // pop back to the apps hub
    return;
  }

  if (screen == Screen::Connect) {
    if (mappedInput.wasReleased(MappedInputManager::Button::Confirm) ||
        mappedInput.wasReleased(MappedInputManager::Button::Down) ||
        mappedInput.wasReleased(MappedInputManager::Button::Right)) {
      rescan();
      screen = Screen::Gallery;
      requestUpdate();
    }
    return;
  }

  // Gallery
  const int rows = static_cast<int>(images.size());
  if (mappedInput.wasReleased(MappedInputManager::Button::Confirm)) {
    openSelected();
    return;
  }
  if (mappedInput.wasReleased(MappedInputManager::Button::Power)) {
    screen = Screen::Connect;  // re-show the pairing QR / push URL
    requestUpdate();
    return;
  }
  if (rows > 0) {
    buttonNavigator.onNextRelease([this, rows] {
      selectorIndex = ButtonNavigator::nextIndex(selectorIndex, rows);
      requestUpdate();
    });
    buttonNavigator.onPreviousRelease([this, rows] {
      selectorIndex = ButtonNavigator::previousIndex(selectorIndex, rows);
      requestUpdate();
    });
  }
}

void AirPageActivity::render(RenderLock&&) {
  renderer.clearScreen();
  if (screen == Screen::Connect) {
    renderConnect();
  } else {
    renderGallery();
  }
  displayUiBuffer();
}

void AirPageActivity::renderGallery() {
  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_AIRPAGE_GALLERY));

  const int listTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentHeight = pageHeight - listTop - metrics.buttonHintsHeight - metrics.verticalSpacing;
  const int rows = static_cast<int>(images.size());

  if (rows == 0) {
    renderer.drawCenteredText(UI_12_FONT_ID, listTop + contentHeight / 2, tr(STR_AIRPAGE_EMPTY));
  } else {
    GUI.drawList(renderer, Rect{0, listTop, pageWidth, contentHeight}, rows, selectorIndex,
                 [this](int i) -> std::string { return images[i]; }, nullptr,
                 [](int) -> UIIcon { return UIIcon::Image; }, nullptr);
  }

  const auto labels =
      mappedInput.mapLabels(tr(STR_BACK), rows == 0 ? "" : tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
}

void AirPageActivity::renderConnect() {
  const int pageWidth = renderer.getScreenWidth();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_AIRPAGE_CONNECT));

  const int y0 = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int labelH = renderer.getLineHeight(UI_12_FONT_ID);
  renderer.drawCenteredText(UI_12_FONT_ID, y0, tr(STR_AIRPAGE_PUSH_TARGET));

  const std::string url = pushUrl();
  const int qrSize = std::min(pageWidth - 2 * metrics.contentSidePadding, 220);
  const int qrX = (pageWidth - qrSize) / 2;
  const int qrY = y0 + labelH + metrics.verticalSpacing;
  QrUtils::drawQrCode(renderer, Rect{qrX, qrY, qrSize, qrSize}, url);

  const int smallH = renderer.getLineHeight(SMALL_FONT_ID);
  const int urlY = qrY + qrSize + metrics.verticalSpacing;
  renderer.drawCenteredText(SMALL_FONT_ID, urlY, url.c_str());
  renderer.drawCenteredText(SMALL_FONT_ID, urlY + smallH + 4, tr(STR_AIRPAGE_NEED_SERVER));

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), tr(STR_SELECT), "", "");
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
}
