#pragma once

#include <sys/time.h>
#include <time.h>

#include <cstdint>

// Wall-clock helper for boards without a hardware RTC (OnePage C61 has no
// DS3231 — see HalClock, which is X3/X4-only). The browser pushes the phone's
// epoch over POST /api/set-time; we install it into the ESP32 system clock via
// settimeofday(). The SoC's internal RTC keeps counting across deep sleep
// (C61 does not latch-cut the MCU rail), so the lock-screen clock stays roughly
// correct between syncs, drifting only with the RC slow-clock accuracy. A cold
// power loss resets it to epoch 0, which isValid() reports as "not yet set".
namespace HalTime {

// Any epoch below this (≈ 2020-09) is treated as "never synced".
constexpr uint32_t MIN_VALID_EPOCH = 1600000000u;

// Install epoch seconds into the system clock and remember the local offset.
inline void setTimeFromEpoch(uint32_t epoch, int16_t tzOffsetMin) {
  const struct timeval tv = {static_cast<time_t>(epoch), 0};
  settimeofday(&tv, nullptr);
}

// True once a plausible time has been set.
inline bool isValid() { return static_cast<uint32_t>(time(nullptr)) >= MIN_VALID_EPOCH; }

// Local hour/minute for display. `tzOffsetMin` is minutes east of UTC (e.g. +480
// for UTC+8). Returns false if the clock was never synced.
inline bool getLocalHHMM(int& hour, int& minute, int16_t tzOffsetMin) {
  const time_t now = time(nullptr);
  if (static_cast<uint32_t>(now) < MIN_VALID_EPOCH) return false;
  const time_t local = now + static_cast<time_t>(tzOffsetMin) * 60;
  struct tm tmLocal;
  gmtime_r(&local, &tmLocal);  // gmtime since the offset is already applied
  hour = tmLocal.tm_hour;
  minute = tmLocal.tm_min;
  return true;
}

// Broken-down local time for the clock+date lock-screen style. `weekday` follows
// struct tm: 0 = Sunday .. 6 = Saturday. Returns false if never synced.
struct DateTime {
  int year;    // full year (e.g. 2026)
  int hour;
  int minute;
  int month;   // 1..12
  int day;     // 1..31
  int weekday; // 0..6 (Sun..Sat)
};

inline bool getLocalDateTime(DateTime& out, int16_t tzOffsetMin) {
  const time_t now = time(nullptr);
  if (static_cast<uint32_t>(now) < MIN_VALID_EPOCH) return false;
  const time_t local = now + static_cast<time_t>(tzOffsetMin) * 60;
  struct tm tmLocal;
  gmtime_r(&local, &tmLocal);  // gmtime since the offset is already applied
  out.year = tmLocal.tm_year + 1900;
  out.hour = tmLocal.tm_hour;
  out.minute = tmLocal.tm_min;
  out.month = tmLocal.tm_mon + 1;
  out.day = tmLocal.tm_mday;
  out.weekday = tmLocal.tm_wday;
  return true;
}

}  // namespace HalTime
