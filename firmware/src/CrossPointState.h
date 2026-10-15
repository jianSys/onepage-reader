#pragma once
#include <cstdint>
#include <string>

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

  // Reading stats, accumulated per-session. The OnePage C61 has no RTC/NTP, so we
  // cannot track calendar days — these only ever count *within* a reading session
  // using millis(), summed into the totals below when the session is committed on
  // reader exit (which also runs before deep sleep, since goToSleep() invokes the
  // outgoing activity's onExit()). The totals persist across reboots; an
  // in-progress session is lost only on power loss / crash.
  uint32_t totalReadingSeconds = 0;
  uint32_t totalPagesTurns = 0;
  uint32_t readingSessions = 0;

  // In-memory session bookkeeping (NOT persisted). millis() is monotonic only
  // within a single boot, so we snapshot the start and sum deltas at commit time.
  unsigned long sessionStartMillis = 0;
  uint32_t sessionTurns = 0;
  bool sessionActive = false;

  void startReadingSession();
  void bumpPageTurn();
  void commitReadingSession();

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
