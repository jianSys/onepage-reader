#include "SdLog.h"

#include <Logging.h>

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>

#include "HalStorage.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

// The ring + scratch live in PSRAM on-device. Guard the IDF heap-caps API so the
// file still builds on the desktop simulator (no esp_heap_caps.h), where we fall
// back to plain malloc; on ESP targets without PSRAM (e.g. the `default` env)
// heap_caps_malloc(SPIRAM) returns null and init() stays inert (serial-only).
#if defined(__has_include)
#  if __has_include(<esp_heap_caps.h>)
#    include <esp_heap_caps.h>
#    define SDLOG_HAS_HEAP_CAPS 1
#  endif
#endif

namespace SdLog {
namespace {
constexpr size_t kRingSize = 16 * 1024;      // buffered log bytes (PSRAM)
constexpr size_t kScratchSize = 16 * 1024;   // linearized drain buffer (PSRAM)
constexpr size_t kRotateAt = 128 * 1024;     // rotate /logs.txt past this size
constexpr const char* kLogPath = "/logs.txt";
constexpr const char* kLogPathPrev = "/logs.txt.1";

char* g_ring = nullptr;
char* g_scratch = nullptr;
size_t g_head = 0;   // next write offset into ring
size_t g_tail = 0;   // next read offset from ring
size_t g_count = 0;  // valid bytes currently in ring
SemaphoreHandle_t g_mutex = nullptr;
bool g_ready = false;    // PSRAM + mutex allocated
bool g_enabled = false;  // sink active

void* allocBuf(size_t bytes) {
#ifdef SDLOG_HAS_HEAP_CAPS
  return heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM);
#else
  return std::malloc(bytes);
#endif
}

void freeBuf(void* p) {
#ifdef SDLOG_HAS_HEAP_CAPS
  heap_caps_free(p);
#else
  std::free(p);
#endif
}
}  // namespace

void init() {
  if (g_ready) {
    return;
  }
  g_ring = static_cast<char*>(allocBuf(kRingSize));
  g_scratch = static_cast<char*>(allocBuf(kScratchSize));
  g_mutex = xSemaphoreCreateMutex();
  if (g_ring && g_scratch && g_mutex) {
    g_head = g_tail = g_count = 0;
    g_ready = true;
  } else {
    // No PSRAM (e.g. the `default` env): stay inert so LOG_* output is serial-only.
    if (g_ring) freeBuf(g_ring);
    if (g_scratch) freeBuf(g_scratch);
    g_ring = g_scratch = nullptr;
    g_ready = false;
  }
}

void sdLogAppend(const char* line, size_t len) {
  if (!g_ready || !g_enabled || len == 0 || len > kRingSize) {
    return;
  }
  xSemaphoreTake(g_mutex, portMAX_DELAY);
  const size_t freeSpace = kRingSize - g_count;
  if (freeSpace < len) {
    // Drop oldest bytes to make room (never block the logging hot path).
    const size_t drop = len - freeSpace;
    g_tail = (g_tail + drop) % kRingSize;
    g_count -= drop;
  }
  const size_t first = std::min(len, kRingSize - g_head);
  memcpy(g_ring + g_head, line, first);
  if (len > first) {
    memcpy(g_ring, line + first, len - first);
  }
  g_head = (g_head + len) % kRingSize;
  g_count += len;
  xSemaphoreGive(g_mutex);
}

void flushToSd() {
  if (!g_ready) {
    return;
  }
  // Drain the whole ring in <= kScratchSize chunks so a pre-sleep flush loses
  // nothing. The lock is only held to linearize bytes into scratch; SD I/O runs
  // outside the lock so concurrent logging never blocks on the card.
  for (;;) {
    size_t n = 0;
    xSemaphoreTake(g_mutex, portMAX_DELAY);
    if (g_count == 0) {
      xSemaphoreGive(g_mutex);
      break;
    }
    n = std::min(g_count, kScratchSize);
    const size_t first = std::min(n, kRingSize - g_tail);
    memcpy(g_scratch, g_ring + g_tail, first);
    if (n > first) {
      memcpy(g_scratch + first, g_ring, n - first);
    }
    g_tail = (g_tail + n) % kRingSize;
    g_count -= n;
    xSemaphoreGive(g_mutex);

    HalFile file = Storage.open(kLogPath, O_WRITE | O_CREAT | O_APPEND);
    if (!file) {
      return;  // SD busy/unmounted: drop this chunk rather than spin
    }
    if (file.fileSize() > kRotateAt) {
      file.close();
      Storage.remove(kLogPathPrev);
      Storage.rename(kLogPath, kLogPathPrev);
      file = Storage.open(kLogPath, O_WRITE | O_CREAT | O_APPEND);
      if (!file) {
        return;
      }
    }
    file.write(g_scratch, n);
    file.flush();
    file.close();
  }
}

void setEnabled(bool on) {
  if (!g_ready || on == g_enabled) {
    return;
  }
  g_enabled = on;
  if (on) {
    setLogSink(&sdLogAppend);
  } else {
    setLogSink(nullptr);
    flushToSd();  // persist the tail before going quiet
  }
}

bool isEnabled() { return g_enabled; }

}  // namespace SdLog
