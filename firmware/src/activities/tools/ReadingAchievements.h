#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "I18n.h"

// Reading achievements (P4). Definitions and the metric ladder are adapted from CrossMux
// (0x1abin/crossmux, MIT) AchievementsStore, but re-implemented as a *live evaluator* on
// our own ReadingStatsStore: unlocked/progress are derived on the fly, with no incremental
// state machine, no persistence file and no unlock popups. Bookmark tiers are omitted
// because our store keeps no bookmark counter.
enum class AchMetric : uint8_t {
  BooksStarted = 0,
  BooksFinished,
  Sessions,
  TotalReadingMs,
  GoalDays,
  MaxGoalStreak,
  MaxSessionMs,
};

struct AchievementDefinition {
  AchMetric metric;
  uint64_t target;
  StrId titleId;
};

struct AchievementView {
  const AchievementDefinition* definition = nullptr;
  uint64_t progress = 0;
  uint64_t target = 0;
  bool unlocked = false;
};

namespace ReadingAchievements {
const std::vector<AchievementDefinition>& list();
std::vector<AchievementView> buildViews();
std::string description(const AchievementDefinition& def);
}  // namespace ReadingAchievements
