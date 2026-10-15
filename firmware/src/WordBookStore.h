#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "WordEntry.h"

class WordBookStore;
namespace JsonSettingsIO {
bool saveWordBook(const WordBookStore& store, const char* path);
bool loadWordBook(WordBookStore& store, const char* json);
}  // namespace JsonSettingsIO

/**
 * Singleton store for the on-device word book (vocabulary / spaced repetition).
 * Persisted as /.crosspoint/wordbook.json. Review scheduling is a count-based
 * Leitner box: a global monotonic counter (reviewSeq) tracks how many cards have
 * ever been graded, and each card remembers the counter value when it was last
 * seen. No RTC required.
 */
class WordBookStore {
  static WordBookStore instance;

  std::vector<WordEntry> entries;
  uint32_t reviewSeq = 0;  // monotonic count of graded cards (persisted)

  friend bool JsonSettingsIO::saveWordBook(const WordBookStore&, const char*);
  friend bool JsonSettingsIO::loadWordBook(WordBookStore&, const char*);

  // Cards reviewed before a card in `box` becomes due again (box 1 -> 0 = every cycle).
  static uint32_t intervalForBox(uint8_t box);
  bool isDue(const WordEntry& e) const;

 public:
  static constexpr int MAX_WORDS = 500;

  WordBookStore() = default;

  static WordBookStore& getInstance() { return instance; }

  bool saveToFile() const;
  bool loadFromFile();

  // Append a new word (box 1, immediately due). Empty word or a full book -> false.
  bool addWord(const std::string& word, const std::string& meaning);
  // Remove the entry at index (bounds-checked). Persists on success.
  bool removeAt(int index);

  const std::vector<WordEntry>& getEntries() const { return entries; }
  int getCount() const { return static_cast<int>(entries.size()); }
  bool isEmpty() const { return entries.empty(); }

  // How many cards are currently due for review.
  int getDueCount() const;
  // Snapshot of the due-card indices, most-overdue first (smallest lastSeenSeq, ties -> lower box).
  std::vector<int> buildReviewQueue() const;

  // Grade the card at index: known=true promotes the box (capped at 5), known=false
  // resets it to 1. Either way the card is stamped at the next reviewSeq. Persists on success.
  bool grade(int index, bool known);

  uint32_t getReviewSeq() const { return reviewSeq; }
};

#define WORDBOOK WordBookStore::getInstance()
