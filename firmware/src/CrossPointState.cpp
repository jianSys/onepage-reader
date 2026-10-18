#include "CrossPointState.h"

#include <Arduino.h>
#include <HalStorage.h>
#include <JsonSettingsIO.h>
#include <Logging.h>
#include <Serialization.h>

#include <algorithm>
#include <time.h>

namespace {
constexpr uint8_t STATE_FILE_VERSION = 4;
constexpr char STATE_FILE_BIN[] = "/.crosspoint/state.bin";
constexpr char STATE_FILE_JSON[] = "/.crosspoint/state.json";
constexpr char STATE_FILE_BAK[] = "/.crosspoint/state.bin.bak";
}  // namespace

CrossPointState CrossPointState::instance;

bool CrossPointState::isRecentSleep(uint16_t idx, uint8_t checkCount) const {
  const uint8_t effectiveCount = std::min(checkCount, recentSleepFill);
  for (uint8_t i = 0; i < effectiveCount; i++) {
    const uint8_t slot = (recentSleepPos + SLEEP_RECENT_COUNT - 1 - i) % SLEEP_RECENT_COUNT;
    if (recentSleepImages[slot] == idx) return true;
  }
  return false;
}

void CrossPointState::pushRecentSleep(uint16_t idx) {
  recentSleepImages[recentSleepPos] = idx;
  recentSleepPos = (recentSleepPos + 1) % SLEEP_RECENT_COUNT;
  if (recentSleepFill < SLEEP_RECENT_COUNT) recentSleepFill++;
}

void CrossPointState::startReadingSession() {
  sessionStartMillis = millis();
  sessionTurns = 0;
  sessionActive = true;
}

void CrossPointState::bumpPageTurn() {
  if (sessionActive) sessionTurns++;
}

void CrossPointState::commitReadingSession() {
  if (!sessionActive) return;
  const uint32_t sessionSeconds = static_cast<uint32_t>((millis() - sessionStartMillis) / 1000);
  totalReadingSeconds += sessionSeconds;
  totalPagesTurns += sessionTurns;
  readingSessions++;
  recordReadingSeconds(sessionSeconds);
  sessionActive = false;
  sessionTurns = 0;
}

uint32_t CrossPointState::currentDayOrdinal() {
  const time_t now = time(nullptr);
  if (static_cast<uint32_t>(now) < 1600000000u) return 0;
  return static_cast<uint32_t>(now) / 86400u;
}

void CrossPointState::recordReadingSeconds(uint32_t seconds) {
  if (seconds == 0) return;
  const uint32_t day = currentDayOrdinal();
  for (size_t i = 0; i < readingDayOrdinals.size(); i++) {
    if (readingDayOrdinals[i] == day) {
      readingDaySeconds[i] += seconds;
      return;
    }
  }
  readingDayOrdinals.push_back(day);
  readingDaySeconds.push_back(seconds);
  // Bound growth: drop buckets older than ~180 days.
  constexpr uint32_t kMaxAgeDays = 180;
  while (!readingDayOrdinals.empty() && day > kMaxAgeDays &&
         readingDayOrdinals.front() < day - kMaxAgeDays) {
    readingDayOrdinals.erase(readingDayOrdinals.begin());
    readingDaySeconds.erase(readingDaySeconds.begin());
  }
}

uint32_t CrossPointState::readingSecondsForDay(uint32_t dayOrdinal) const {
  for (size_t i = 0; i < readingDayOrdinals.size(); i++) {
    if (readingDayOrdinals[i] == dayOrdinal) return readingDaySeconds[i];
  }
  return 0;
}

bool CrossPointState::saveToFile() const {
  Storage.mkdir("/.crosspoint");
  return JsonSettingsIO::saveState(*this, STATE_FILE_JSON);
}

bool CrossPointState::loadFromFile() {
  // Try JSON first
  if (Storage.exists(STATE_FILE_JSON)) {
    String json = Storage.readFile(STATE_FILE_JSON);
    if (!json.isEmpty()) {
      return JsonSettingsIO::loadState(*this, json.c_str());
    }
  }

  // Fall back to binary migration
  if (Storage.exists(STATE_FILE_BIN)) {
    if (loadFromBinaryFile()) {
      if (saveToFile()) {
        Storage.rename(STATE_FILE_BIN, STATE_FILE_BAK);
        LOG_DBG("CPS", "Migrated state.bin to state.json");
        return true;
      } else {
        LOG_ERR("CPS", "Failed to save state during migration");
        return false;
      }
    }
  }

  return false;
}

bool CrossPointState::loadFromBinaryFile() {
  HalFile inputFile;
  if (!Storage.openFileForRead("CPS", STATE_FILE_BIN, inputFile)) {
    return false;
  }

  uint8_t version;
  serialization::readPod(inputFile, version);
  if (version > STATE_FILE_VERSION) {
    LOG_ERR("CPS", "Deserialization failed: Unknown version %u", version);
    return false;
  }

  serialization::readString(inputFile, openEpubPath);
  if (version >= 2) {
    uint8_t legacyLastSleep = UINT8_MAX;
    serialization::readPod(inputFile, legacyLastSleep);
    if (legacyLastSleep != UINT8_MAX) {
      pushRecentSleep(static_cast<uint16_t>(legacyLastSleep));
    }
  }

  if (version >= 3) {
    serialization::readPod(inputFile, readerActivityLoadCount);
  }

  if (version >= 4) {
    serialization::readPod(inputFile, lastSleepFromReader);
  } else {
    lastSleepFromReader = false;
  }

  return true;
}
