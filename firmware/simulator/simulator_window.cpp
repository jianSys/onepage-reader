#include "simulator_window.h"

#include <HalDisplay.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace simulator {

SimulatorWindow& SimulatorWindow::instance() {
  static SimulatorWindow w;
  return w;
}

bool SimulatorWindow::open(const char* title, int scale, bool showShell) {
  if (window_) return true;
  if (scale <= 0) scale = 1;
  layout_ = computeShellLayout(showShell, scale);
  if (SDL_InitSubSystem(SDL_INIT_VIDEO) != 0) {
    std::fprintf(stderr, "SDL_InitSubSystem failed: %s\n", SDL_GetError());
    return false;
  }
  // The framebuffer is logically 800×480 landscape (matches hardware), but the X4
  // device is held in portrait orientation. The window presents portrait, and the
  // shell (if enabled) adds bezel margins around the eink area.
  //
  // Place it explicitly instead of SDL_WINDOWPOS_CENTERED: with a display that is
  // reported but not part of the visible desktop (disconnected monitor, Sidecar,
  // screen-sharing ghost), centering lands the window at negative coordinates and
  // the user sees nothing. Center on the display under the cursor, else primary.
  const int displayCount = SDL_GetNumVideoDisplays();
  int targetDisplay = 0;
  int mouseX = 0;
  int mouseY = 0;
  SDL_GetGlobalMouseState(&mouseX, &mouseY);
  for (int i = 0; i < displayCount; i++) {
    SDL_Rect b{};
    if (SDL_GetDisplayBounds(i, &b) != 0) continue;
    if (mouseX >= b.x && mouseX < b.x + b.w && mouseY >= b.y && mouseY < b.y + b.h) {
      targetDisplay = i;
      break;
    }
  }
  SDL_Rect usable{};
  if (SDL_GetDisplayUsableBounds(targetDisplay, &usable) != 0) {
    usable = SDL_Rect{0, 0, layout_.windowW, layout_.windowH};
  }
  const int winX = usable.x + (usable.w - layout_.windowW) / 2;
  const int winY = usable.y + (usable.h - layout_.windowH) / 2;
  window_ = SDL_CreateWindow(title, winX, winY, layout_.windowW, layout_.windowH, SDL_WINDOW_SHOWN);
  if (!window_) {
    std::fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
    return false;
  }
  SDL_RaiseWindow(window_);
  std::fprintf(stderr, "[SIM] %d SDL display(s); window %dx%d at %d,%d (display %d)\n", displayCount, layout_.windowW,
               layout_.windowH, winX, winY, targetDisplay);

  // Accelerated (Metal) is the norm. CPSIM_RENDERER=software forces SDL's software
  // backend for the rare host where the GPU path presents a black window; if the
  // accelerated renderer cannot be created at all, fall back instead of aborting.
  const char* rendererPref = std::getenv("CPSIM_RENDERER");
  const bool forceSoftware = rendererPref && std::strcmp(rendererPref, "software") == 0;
  renderer_ = SDL_CreateRenderer(
      window_, -1, SDL_RENDERER_PRESENTVSYNC | (forceSoftware ? SDL_RENDERER_SOFTWARE : SDL_RENDERER_ACCELERATED));
  if (!renderer_ && !forceSoftware) {
    std::fprintf(stderr, "[SIM] accelerated renderer failed (%s); falling back to software\n", SDL_GetError());
    renderer_ = SDL_CreateRenderer(window_, -1, SDL_RENDERER_SOFTWARE);
  }
  if (!renderer_) {
    std::fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
    return false;
  }
  SDL_RendererInfo info{};
  if (SDL_GetRendererInfo(renderer_, &info) == 0) {
    std::fprintf(stderr, "[SIM] renderer: %s\n", info.name);
  }
  // Texture stored already rotated — width/height swapped — so it can be
  // stretched directly into the (sub-)rectangle within the window. ARGB8888 is the
  // one format every SDL renderer backend (Metal/OpenGL/D3D) maps natively; RGB24 is
  // not universally supported and silently yields an empty texture on some drivers.
  texture_ = SDL_CreateTexture(renderer_, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING,
                               HalDisplay::DISPLAY_HEIGHT, HalDisplay::DISPLAY_WIDTH);
  if (!texture_) {
    std::fprintf(stderr, "SDL_CreateTexture failed: %s\n", SDL_GetError());
    return false;
  }
  pending_.resize(HalDisplay::BUFFER_SIZE);
  // Initial paint: all white.
  std::memset(pending_.data(), 0xFF, pending_.size());
  pendingDirty_ = true;
  present(true);
  return true;
}

void SimulatorWindow::pushFramebuffer(const uint8_t* bw1bpp) {
  if (!bw1bpp || pending_.empty()) return;
  std::lock_guard<std::mutex> lock(pendingMutex_);
  std::memcpy(pending_.data(), bw1bpp, pending_.size());
  pendingDirty_ = true;
}

void SimulatorWindow::presentIfDirty() { present(false); }

void SimulatorWindow::forceRedraw() { present(true); }

void SimulatorWindow::setShellVisible(bool v) {
  if (!window_) return;
  if (v == layout_.showShell) return;
  layout_ = computeShellLayout(v, layout_.scale);
  SDL_SetWindowSize(window_, layout_.windowW, layout_.windowH);
  // No re-centering here: SDL_WINDOWPOS_CENTERED can land the window on a display
  // that is not part of the visible desktop (see open()).
  present(true);
}

void SimulatorWindow::present(bool force) {
  if (!texture_ || !renderer_) return;

  bool haveNewFrame = false;
  std::vector<uint8_t> local;
  {
    std::lock_guard<std::mutex> lock(pendingMutex_);
    if (pendingDirty_) {
      local = pending_;
      pendingDirty_ = false;
      haveNewFrame = true;
    }
  }

  // Unpack 1-bpp MSB-first → ARGB8888, rotating 90° clockwise so the X4's natural
  // portrait orientation is what the simulator window shows.
  //
  // CW 90° mapping: source pixel (x, y) on the 800×480 framebuffer goes to
  // destination (dst_x, dst_y) = (SRC_H - 1 - y, x) on a 480×800 buffer.
  // bit=0 means black (ink on), bit=1 means white.
  constexpr uint16_t SRC_W = HalDisplay::DISPLAY_WIDTH;
  constexpr uint16_t SRC_H = HalDisplay::DISPLAY_HEIGHT;
  constexpr uint16_t DST_W = SRC_H;  // 480
  constexpr uint16_t DST_H = SRC_W;  // 800
  constexpr size_t DST_BYTES = static_cast<size_t>(DST_W) * DST_H * 4;

  if (haveNewFrame) {
    if (lastRgb_.size() != DST_BYTES) lastRgb_.resize(DST_BYTES);
    const uint16_t widthBytes = SRC_W / 8;
    for (uint16_t y = 0; y < SRC_H; y++) {
      for (uint16_t x = 0; x < SRC_W; x++) {
        uint8_t byte = local[y * widthBytes + (x >> 3)];
        bool white = (byte >> (7 - (x & 7))) & 0x1;
        uint8_t v = white ? 0xF0 : 0x10;
        const uint16_t dst_x = SRC_H - 1 - y;
        const uint16_t dst_y = x;
        size_t idx = (static_cast<size_t>(dst_y) * DST_W + dst_x) * 4;
        lastRgb_[idx + 0] = v;     // B
        lastRgb_[idx + 1] = v;     // G
        lastRgb_[idx + 2] = v;     // R
        lastRgb_[idx + 3] = 0xFF;  // A
      }
    }
    if (SDL_UpdateTexture(texture_, nullptr, lastRgb_.data(), DST_W * 4) != 0) {
      std::fprintf(stderr, "[SIM] SDL_UpdateTexture failed: %s\n", SDL_GetError());
    }
  } else if (!force) {
    return;  // Nothing new and no caller-forced redraw — skip.
  }

  // Clear behind the eink area. With shell on, the shell draw fills the rest;
  // with shell off, this clears the whole window to a neutral grey.
  SDL_SetRenderDrawColor(renderer_, 0x20, 0x20, 0x20, 0xFF);
  SDL_RenderClear(renderer_);

  if (layout_.showShell) {
    drawShell(renderer_, layout_);
  }

  SDL_Rect dst{layout_.einkX, layout_.einkY, layout_.einkW, layout_.einkH};
  if (SDL_RenderCopy(renderer_, texture_, nullptr, &dst) != 0) {
    std::fprintf(stderr, "[SIM] SDL_RenderCopy failed: %s\n", SDL_GetError());
  }

  if (overlay_.isVisible()) {
    overlay_.draw(renderer_, layout_.windowW, layout_.windowH);
  }

  SDL_RenderPresent(renderer_);

  // Optional frame dump for visual checks when the host refuses screen capture
  // (macOS TCC screen-recording permission): CPSIM_DUMP_BMP=/tmp/frame.bmp.
  // Off by default, so the unset path costs one getenv per present.
  static const char* dumpPath = std::getenv("CPSIM_DUMP_BMP");
  if (dumpPath && *dumpPath) {
    SDL_Surface* shot =
        SDL_CreateRGBSurfaceWithFormat(0, layout_.windowW, layout_.windowH, 32, SDL_PIXELFORMAT_ARGB8888);
    if (shot) {
      if (SDL_RenderReadPixels(renderer_, nullptr, SDL_PIXELFORMAT_ARGB8888, shot->pixels, shot->pitch) == 0) {
        SDL_SaveBMP(shot, dumpPath);
      }
      SDL_FreeSurface(shot);
    }
  }
}

void SimulatorWindow::close() {
  if (texture_) SDL_DestroyTexture(texture_);
  if (renderer_) SDL_DestroyRenderer(renderer_);
  if (window_) SDL_DestroyWindow(window_);
  texture_ = nullptr;
  renderer_ = nullptr;
  window_ = nullptr;
}

}  // namespace simulator
