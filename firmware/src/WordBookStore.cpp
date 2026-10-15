#include "WordBookStore.h"

#include <HalStorage.h>
#include <JsonSettingsIO.h>
#include <Logging.h>

#include <algorithm>

WordBookStore WordBookStore::instance;

namespace {
constexpr char WORDBOOK_FILE_JSON[] = "/.crosspoint/wordbook.json";
// Leitner intervals measured in graded cards, indexed by box (slot 0 unused).
// box 1 = 0 -> a card is due every cycle (so fresh words surface immediately and
// missed words come back soon); higher boxes are seen progressively less often.
constexpr uint32_t BOX_INTERVAL[6] = {0, 0, 3, 6, 12, 24};
}  // namespace

uint32_t WordBookStore::intervalForBox(uint8_t box) {
  if (box < 1) box = 1;
  if (box > 5) box = 5;
  return BOX_INTERVAL[box];
}

bool WordBookStore::isDue(const WordEntry& e) const {
  // reviewSeq is monotonic and lastSeenSeq is only ever set to a past reviewSeq,
  // so reviewSeq >= lastSeenSeq holds and the unsigned difference is safe.
  return (reviewSeq - e.lastSeenSeq) >= intervalForBox(e.box);
}

bool WordBookStore::saveToFile() const {
  Storage.mkdir("/.crosspoint");
  return JsonSettingsIO::saveWordBook(*this, WORDBOOK_FILE_JSON);
}

bool WordBookStore::loadFromFile() {
  if (Storage.exists(WORDBOOK_FILE_JSON)) {
    String json = Storage.readFile(WORDBOOK_FILE_JSON);
    if (!json.isEmpty()) {
      return JsonSettingsIO::loadWordBook(*this, json.c_str());
    }
  }
  // No file yet: an empty word book is a valid starting state.
  return false;
}

bool WordBookStore::addWord(const std::string& word, const std::string& meaning) {
  if (word.empty()) {
    return false;
  }
  if (static_cast<int>(entries.size()) >= MAX_WORDS) {
    LOG_DBG("WBS", "Word book full (%d), rejecting new word", MAX_WORDS);
    return false;
  }
  WordEntry e;
  e.word = word;
  e.meaning = meaning;
  e.box = 1;
  e.lastSeenSeq = 0;  // box 1 interval is 0 -> due immediately
  entries.push_back(std::move(e));
  LOG_DBG("WBS", "Added word: %s (%d total)", word.c_str(), static_cast<int>(entries.size()));
  return saveToFile();
}

bool WordBookStore::removeAt(int index) {
  if (index < 0 || index >= static_cast<int>(entries.size())) {
    return false;
  }
  LOG_DBG("WBS", "Removed word: %s", entries[index].word.c_str());
  entries.erase(entries.begin() + index);
  return saveToFile();
}

int WordBookStore::getDueCount() const {
  int n = 0;
  for (const auto& e : entries) {
    if (isDue(e)) ++n;
  }
  return n;
}

std::vector<int> WordBookStore::buildReviewQueue() const {
  std::vector<int> queue;
  for (int i = 0; i < static_cast<int>(entries.size()); ++i) {
    if (isDue(entries[i])) queue.push_back(i);
  }
  // Most overdue first (smallest lastSeenSeq); break ties toward the lower box so
  // weaker cards lead the session.
  std::sort(queue.begin(), queue.end(), [this](int a, int b) {
    const auto& ea = entries[a];
    const auto& eb = entries[b];
    if (ea.lastSeenSeq != eb.lastSeenSeq) return ea.lastSeenSeq < eb.lastSeenSeq;
    return ea.box < eb.box;
  });
  return queue;
}

bool WordBookStore::grade(int index, bool known) {
  if (index < 0 || index >= static_cast<int>(entries.size())) {
    return false;
  }
  auto& e = entries[index];
  e.box = known ? static_cast<uint8_t>(std::min<int>(e.box + 1, 5)) : 1;
  e.lastSeenSeq = ++reviewSeq;
  return saveToFile();
}
