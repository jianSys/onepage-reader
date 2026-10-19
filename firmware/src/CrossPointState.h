#pragma once
#include <cstdint>
#include <string>
#include <vector>

class CrossPointState {
  // Static instance
  static CrossPointState instance;

 public:
  static constexpr uint8_t SLEEP_RECENT_COUNT = 16;

  std::string openEpubPath;
  uint16_t recentSleepImages[SLEEP_RECENT_COUNT] = {};  // circular buffer of recent wallpaper indices
  uint8_t recentSleepPos = 0;                           // next write slot
  uint8_t recentSleepFill = 0;                          // valid entries (0..SLEEP_RECENT_COUNT)
  uint8_t readerActivityLoadCount = 0;
  bool lastSleepFromReader = false;
  bool showBootScreen = true;

  // Reading statistics.
  //
  // The three totals below accumulate per-session and persist across reboots; an
  // in-progress session is lost only on power loss / crash. The C61 keeps a wall
  // clock via its internal RTC (seeded by the web companion's POST /api/set-time
  // or SNTP), so we additionally bucket reading time per UTC day
  // (readingDayOrdinals/Seconds) to power the 7-day chart on the stats page.
  uint32_t totalReadingSeconds = 0;
  uint32_t totalPagesTurns = 0;
  uint32_t readingSessions = 0;
  // Last wall-clock epoch (seconds) observed valid while the device was awake.
  // ReadingStatsStore uses this as a day-bucketing fallback when the RTC has
  // rolled back below the sanity threshold after a reboot without a fresh sync.
  uint32_t lastKnownValidTimestamp = 0;

  // Per-day reading time (seconds), bucketed by UTC day ordinal (time(nullptr)/86400).
  // readingDayOrdinals[i] pairs with readingDaySeconds[i]. Empty until the first
  // session is committed after a successful time sync.
  std::vector<uint32_t> readingDayOrdinals;
  std::vector<uint32_t> readingDaySeconds;

  // In-memory session bookkeeping (NOT persisted). millis() is monotonic only
  // within a single boot, so we snapshot the start and sum deltas at commit time.
  unsigned long sessionStartMillis = 0;
  uint32_t sessionTurns = 0;
  bool sessionActive = false;

  void startReadingSession();
  void bumpPageTurn();
  void commitReadingSession();

  // UTC day ordinal for "now" (time(nullptr)/86400), or 0 when the clock is unset.
  static uint32_t currentDayOrdinal();
  // Add `seconds` of reading time to the current day's bucket (persisted on save).
  void recordReadingSeconds(uint32_t seconds);
  // Total reading seconds recorded for a specific day ordinal (0 if none).
  uint32_t readingSecondsForDay(uint32_t dayOrdinal) const;

  // Returns true if idx was shown within the last checkCount picks.
  // Walks backwards from the most recently written slot.
  bool isRecentSleep(uint16_t idx, uint8_t checkCount) const;

  void pushRecentSleep(uint16_t idx);
  ~CrossPointState() = default;

  // Get singleton instance
  static CrossPointState& getInstance() { return instance; }

  bool saveToFile() const;

  bool loadFromFile();

 private:
  bool loadFromBinaryFile();
};

// Helper macro to access settings
#define APP_STATE CrossPointState::getInstance()
