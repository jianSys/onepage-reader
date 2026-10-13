#include "NoSdCardActivity.h"

#include <Arduino.h>
#include <GfxRenderer.h>
#include <HalDisplay.h>
#include <HalStorage.h>
#include <I18n.h>

#include <cstdio>
#include <string>

#include "activities/ActivityManager.h"
#include "fontIds.h"
#include "images/Logo120.h"

namespace {

// SD card detect cadence. SDCardManager::begin() on C61 already retries 5×100ms
// internally (see open-onepage-sdk/.../SDCardManager.cpp), so a failed probe is
// bounded to ~500ms; 2000ms total cycle keeps the e-ink refresh rate at a
// tolerable 0.5Hz while still feeling instant when a card is dropped in.
constexpr unsigned long POLL_INTERVAL_MS = 2000;

// Layout anchors (800×480 landscape). Y positions are text/rect tops.
constexpr int LOGO_TOP = 20;
constexpr int TITLE_Y = 172;
constexpr int HINT_Y = 208;
constexpr int CARD_CY = 302;
constexpr int STATUS_Y = 388;
constexpr int FOOTER_OFFSET = 28;

// Minimal SD-card silhouette drawn with primitives — no bitmap asset to
// bundle, and 1-bit e-ink doesn't need one. Rounded body, four top-edge
// metal contacts, and a diagonal cut at the bottom-right.
void drawSdCardIcon(const GfxRenderer& r, int cx, int cy, bool active) {
  constexpr int w = 72;
  constexpr int h = 88;
  const int x = cx - w / 2;
  const int y = cy - h / 2;
  r.drawRoundedRect(x, y, w, h, 2, 6, /*state=*/true);

  // Top metal contacts (four short vertical bars).
  const int pinTop = y + 12;
  const int pinBot = pinTop + 14;
  for (int i = 0; i < 4; ++i) {
    const int px = x + 12 + i * 14;
    r.drawLine(px, pinTop, px, pinBot, 2, true);
  }

  // Bottom-right corner cutout: mask the corner then draw the diagonal.
  constexpr int notch = 14;
  r.fillRect(x + w - notch, y + h - notch, notch, notch, /*state=*/false);
  r.drawLine(x + w - notch, y + h - 1, x + w - 1, y + h - notch, 2, true);

  // "SD" letter — pixel state flips with the heartbeat cursor so the icon
  // itself visibly pulses without needing a second refresh policy.
  r.drawCenteredText(UI_10_FONT_ID, cy + 12, "SD", active, EpdFontFamily::BOLD);
}

// 6-byte eFuse MAC as "AA:BB:CC:DD:EE:FF". Works without touching WiFi.begin()
// — ESP.getEfuseMac() reads from the same efuse block on every boot.
std::string readEfuseMacString() {
  const uint64_t raw = ESP.getEfuseMac();
  uint8_t mac[6];
  for (int i = 0; i < 6; ++i) {
    mac[i] = static_cast<uint8_t>((raw >> (8 * i)) & 0xFF);
  }
  char buf[18];
  std::snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return std::string(buf);
}

// Swap to a "detected" frame and hand off to the bootloader. Cold restart is
// preferred over silentRestart(): we want the normal splash + full setup() so
// SETTINGS/APP_STATE/RECENT_BOOKS/BLE all initialise against the fresh SD.
// ESP.restart() does not return.
void rebootAfterSdDetected(GfxRenderer& renderer) {
  renderer.clearScreen();
  renderer.drawCenteredText(UI_12_FONT_ID, 200, "SD OK", true, EpdFontFamily::BOLD);
  renderer.drawCenteredText(UI_10_FONT_ID, 240, "Rebooting...");
  renderer.displayBuffer(HalDisplay::FAST_REFRESH);
  delay(800);
  ESP.restart();
}

}  // namespace

void NoSdCardActivity::onEnter() {
  Activity::onEnter();
  lastPollAt = millis();
  requestUpdate(true);  // immediate first paint so the user sees us right away
}

void NoSdCardActivity::loop() {
  const unsigned long now = millis();
  if (now - lastPollAt < POLL_INTERVAL_MS) return;
  lastPollAt = now;
  cursorFrame = static_cast<uint8_t>((cursorFrame + 1) & 0x3);

  if (Storage.begin()) {
    rebootAfterSdDetected(renderer);  // noreturn
    return;
  }
  requestUpdate(false);  // deferred: render happens in ActivityManager::loop()
}

void NoSdCardActivity::render(RenderLock&& /*lock*/) {
  const int w = renderer.getScreenWidth();
  const int h = renderer.getScreenHeight();
  renderer.clearScreen();

  // Product logo, centered horizontally near the top.
  renderer.drawImage(Logo120, (w - 120) / 2, LOGO_TOP, 120, 120);

  // Title + hint. Language defaults to EN when no SD is present (SETTINGS
  // hasn't been loaded), so CJK glyphs would render as tofu boxes anyway —
  // the strings stay legible across the fallback path.
  renderer.drawCenteredText(UI_12_FONT_ID, TITLE_Y, tr(STR_NO_SD_TITLE), true, EpdFontFamily::BOLD);
  renderer.drawCenteredText(UI_10_FONT_ID, HINT_Y, tr(STR_NO_SD_HINT));

  // Card-slot illustration in the middle third. Pulse the "SD" text (bold vs
  // regular) once per full 4-frame spinner cycle so it stays legible on e-ink.
  drawSdCardIcon(renderer, w / 2, CARD_CY, (cursorFrame & 1) == 0);

  // Status line: ASCII spinner | / - \ + localised label + uptime seconds.
  // Uses only glyphs guaranteed present in the Ubuntu/NotoSans built-in fonts.
  static constexpr char kSpinner[] = {'|', '/', '-', '\\'};
  char status[64];
  const unsigned long uptimeSec = millis() / 1000UL;
  std::snprintf(status, sizeof(status), "%c  %s  -  %lu s", kSpinner[cursorFrame], tr(STR_NO_SD_POLLING), uptimeSec);
  renderer.drawCenteredText(SMALL_FONT_ID, STATUS_Y, status);

  // Footer: firmware version + MAC — handy on a demo bench.
  const std::string mac = readEfuseMacString();
  char footer[96];
  std::snprintf(footer, sizeof(footer), "%s  -  %s", CROSSPOINT_VERSION, mac.c_str());
  renderer.drawCenteredText(SMALL_FONT_ID, h - FOOTER_OFFSET, footer);

  renderer.displayBuffer(HalDisplay::FAST_REFRESH);
}
