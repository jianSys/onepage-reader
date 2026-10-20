#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdlib>

// ESP-IDF multi-heap capability surface. On device these calls pick between internal
// SRAM (320 KB on the C61) and the external 2 MB PSRAM; the host has a single anonymous
// heap, so every request lands in malloc()/calloc()/realloc().
//
// The OnePage C61 build enables PSRAM (CONFIG_SPIRAM=y, 2 MB @40 MHz quad — see
// platformio.ini's env:onepage), so the reported footprint mirrors that board: callers
// that gate optional caches on PSRAM headroom (SdLog's ring buffer, SdCardFont's glyph
// cache) take the same branch they take on hardware. Host allocations are not tracked
// per capability, so the queries return the board's nominal capacity rather than a live
// figure — treat them as "advertised size", not as accounting.

#define MALLOC_CAP_EXEC (1 << 0)
#define MALLOC_CAP_32BIT (1 << 1)
#define MALLOC_CAP_8BIT (1 << 2)
#define MALLOC_CAP_DMA (1 << 3)
#define MALLOC_CAP_SPIRAM (1 << 10)
#define MALLOC_CAP_INTERNAL (1 << 11)
#define MALLOC_CAP_DEFAULT (1 << 12)
#define MALLOC_CAP_IRAM_8BIT (1 << 13)
#define MALLOC_CAP_RETENTION (1 << 14)
#define MALLOC_CAP_RTCRAM (1 << 15)

namespace esp_heap_caps_host {

// Nominal capacities of the shipping board.
constexpr size_t kInternalHeapBytes = 393216;  // mirrors ARDUINO_HOST_HEAP_SIZE_BYTES
constexpr size_t kPsramBytes = 2 * 1024 * 1024;

// Every capability request is satisfiable from the one host heap. Kept as a helper so
// the intent ("SPIRAM is present on this target") is documented in one place.
inline bool hasPsram() { return true; }

}  // namespace esp_heap_caps_host

inline void* heap_caps_malloc(const size_t size, const uint32_t /*caps*/) { return std::malloc(size); }

inline void* heap_caps_calloc(const size_t count, const size_t size, const uint32_t /*caps*/) {
  return std::calloc(count, size);
}

inline void* heap_caps_realloc(void* ptr, const size_t size, const uint32_t /*caps*/) {
  return std::realloc(ptr, size);
}

inline void heap_caps_free(void* ptr) { std::free(ptr); }

inline size_t heap_caps_get_free_size(const uint32_t caps) {
  return (caps & MALLOC_CAP_SPIRAM) != 0 ? esp_heap_caps_host::kPsramBytes : esp_heap_caps_host::kInternalHeapBytes;
}

inline size_t heap_caps_get_total_size(const uint32_t caps) { return heap_caps_get_free_size(caps); }

inline size_t heap_caps_get_minimum_free_size(const uint32_t caps) { return heap_caps_get_free_size(caps); }

inline size_t heap_caps_get_largest_free_block(const uint32_t caps) { return heap_caps_get_free_size(caps); }
