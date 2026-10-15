#pragma once
#include <cstdint>
#include <string>

// A single vocabulary entry collected on-device and reviewed through a
// count-based Leitner box (see WordBookStore). There is no wall-clock involved:
// scheduling uses a monotonic "graded card" counter, so review ordering survives
// deep sleep and power loss on a device without an RTC.
struct WordEntry {
  std::string word;      // the term
  std::string meaning;   // definition / translation
  uint8_t box = 1;       // Leitner box 1..5 (higher = reviewed more successfully)
  uint32_t lastSeenSeq;  // global reviewSeq value at the moment this card was last graded
};
