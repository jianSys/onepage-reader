#pragma once

#include <cstddef>

// Mirrors runtime LOG_* output to /logs.txt on the SD card.
//
// Design: the logging hot path (logPrintf -> sdLogAppend) only memcpy's each
// line into a PSRAM-backed ring buffer under a mutex; the slow SD write happens
// in flushToSd(), called periodically from the main loop and once before deep
// sleep. Nothing here runs until init() succeeds and setEnabled(true) is called,
// so with the feature off there is zero cost and /logs.txt is never created.
namespace SdLog {

// Allocate the PSRAM ring + scratch. If PSRAM is unavailable, disables itself
// (safe no-op on environments without PSRAM). Idempotent.
void init();

// Reflect the SETTINGS toggle. Turning on registers the log sink; turning off
// detaches it and flushes whatever is still buffered. Takes effect live (the
// main loop re-syncs this from SETTINGS each iteration).
void setEnabled(bool on);

bool isEnabled();

// The sink callback: append one formatted line into the ring (drop-oldest when
// full). Cheap and lock-guarded; safe to call from any task.
void sdLogAppend(const char* line, size_t len);

// Drain the ring buffer and append it to /logs.txt, rotating the file when it
// exceeds the size cap. No-op when disabled or the ring is empty.
void flushToSd();

}  // namespace SdLog
