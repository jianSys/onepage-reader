#include "ReadingAchievements.h"

#include <I18n.h>

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

#include "ReadingStatsStore.h"

namespace {

std::string replaceFirst(std::string s, const char* needle, const std::string& value) {
  const size_t pos = s.find(needle);
  if (pos != std::string::npos) s.replace(pos, std::strlen(needle), value);
  return s;
}

// Compact duration for the two time-based metrics (e.g. "5h", "30m", "1h 30m").
std::string formatDurationCompact(uint64_t ms) {
  const uint64_t totalSec = ms / 1000ULL;
  const uint64_t h = totalSec / 3600ULL;
  const uint64_t m = (totalSec % 3600ULL) / 60ULL;
  if (h > 0) {
    std::string out = std::to_string(h) + tr(STR_HOUR);
    if (m > 0) out += " " + std::to_string(m) + tr(STR_MINUTE);
    return out;
  }
  return std::to_string(m) + tr(STR_MINUTE);
}

struct Snapshot {
  uint64_t booksStarted = 0;
  uint64_t booksFinished = 0;
  uint64_t sessions = 0;
  uint64_t totalReadingMs = 0;
  uint64_t goalDays = 0;
  uint64_t maxGoalStreak = 0;
  uint64_t maxSessionMs = 0;
};

uint64_t valueFor(const Snapshot& s, AchMetric metric) {
  switch (metric) {
    case AchMetric::BooksStarted: return s.booksStarted;
    case AchMetric::BooksFinished: return s.booksFinished;
    case AchMetric::Sessions: return s.sessions;
    case AchMetric::TotalReadingMs: return s.totalReadingMs;
    case AchMetric::GoalDays: return s.goalDays;
    case AchMetric::MaxGoalStreak: return s.maxGoalStreak;
    case AchMetric::MaxSessionMs: return s.maxSessionMs;
  }
  return 0;
}

Snapshot computeSnapshot() {
  Snapshot s;
  s.booksStarted = READING_STATS.getBooksStartedCount();
  s.booksFinished = READING_STATS.getBooksFinishedCount();
  s.totalReadingMs = READING_STATS.getTotalReadingMs();

  std::vector<uint32_t> goalDayList;
  const uint64_t goalMs = getDailyReadingGoalMs();
  if (goalMs > 0) {
    for (const auto& d : READING_STATS.getReadingDays()) {
      if (d.readingMs >= goalMs) goalDayList.push_back(d.dayOrdinal);
    }
  }
  std::sort(goalDayList.begin(), goalDayList.end());
  goalDayList.erase(std::unique(goalDayList.begin(), goalDayList.end()), goalDayList.end());
  s.goalDays = goalDayList.size();
  uint64_t run = 0, best = 0;
  bool have = false;
  uint32_t prev = 0;
  for (const uint32_t day : goalDayList) {
    run = (have && day == prev + 1) ? run + 1 : 1;
    best = std::max(best, run);
    prev = day;
    have = true;
  }
  s.maxGoalStreak = best;

  for (const auto& e : READING_STATS.getSessionLog()) {
    ++s.sessions;
    s.maxSessionMs = std::max<uint64_t>(s.maxSessionMs, e.sessionMs);
  }
  return s;
}

}  // namespace

const std::vector<AchievementDefinition>& ReadingAchievements::list() {
  static const std::vector<AchievementDefinition> items = {
      // Books started
      {AchMetric::BooksStarted, 1, StrId::STR_ACH_TITLE_FIRST_BOOK_STARTED},
      {AchMetric::BooksStarted, 5, StrId::STR_ACH_TITLE_FIVE_BOOKS_STARTED},
      {AchMetric::BooksStarted, 10, StrId::STR_ACH_TITLE_TEN_BOOKS_STARTED},
      {AchMetric::BooksStarted, 25, StrId::STR_ACH_TITLE_TWENTY_FIVE_BOOKS_STARTED},
      {AchMetric::BooksStarted, 50, StrId::STR_ACH_TITLE_FIFTY_BOOKS_STARTED},
      // Books finished
      {AchMetric::BooksFinished, 1, StrId::STR_ACH_TITLE_FIRST_BOOK_FINISHED},
      {AchMetric::BooksFinished, 5, StrId::STR_ACH_TITLE_FIVE_BOOKS_FINISHED},
      {AchMetric::BooksFinished, 10, StrId::STR_ACH_TITLE_TEN_BOOKS_FINISHED},
      {AchMetric::BooksFinished, 25, StrId::STR_ACH_TITLE_TWENTY_FIVE_BOOKS_FINISHED},
      // Reading sessions
      {AchMetric::Sessions, 1, StrId::STR_ACH_TITLE_FIRST_SESSION},
      {AchMetric::Sessions, 10, StrId::STR_ACH_TITLE_TEN_SESSIONS},
      {AchMetric::Sessions, 50, StrId::STR_ACH_TITLE_FIFTY_SESSIONS},
      {AchMetric::Sessions, 100, StrId::STR_ACH_TITLE_ONE_HUNDRED_SESSIONS},
      // Total reading time (ms)
      {AchMetric::TotalReadingMs, 60ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_READING_ONE_HOUR},
      {AchMetric::TotalReadingMs, 5ULL * 60ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_READING_FIVE_HOURS},
      {AchMetric::TotalReadingMs, 10ULL * 60ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_READING_TEN_HOURS},
      {AchMetric::TotalReadingMs, 50ULL * 60ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_READING_FIFTY_HOURS},
      {AchMetric::TotalReadingMs, 100ULL * 60ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_READING_ONE_HUNDRED_HOURS},
      // Goal days
      {AchMetric::GoalDays, 1, StrId::STR_ACH_TITLE_FIRST_GOAL_DAY},
      {AchMetric::GoalDays, 7, StrId::STR_ACH_TITLE_SEVEN_GOAL_DAYS},
      {AchMetric::GoalDays, 30, StrId::STR_ACH_TITLE_THIRTY_GOAL_DAYS},
      {AchMetric::GoalDays, 60, StrId::STR_ACH_TITLE_SIXTY_GOAL_DAYS},
      // Goal streak (days)
      {AchMetric::MaxGoalStreak, 3, StrId::STR_ACH_TITLE_THREE_GOAL_STREAK},
      {AchMetric::MaxGoalStreak, 7, StrId::STR_ACH_TITLE_SEVEN_GOAL_STREAK},
      {AchMetric::MaxGoalStreak, 30, StrId::STR_ACH_TITLE_THIRTY_GOAL_STREAK},
      // Longest single session (ms)
      {AchMetric::MaxSessionMs, 30ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_THIRTY_MINUTE_SESSION},
      {AchMetric::MaxSessionMs, 60ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_SIXTY_MINUTE_SESSION},
      {AchMetric::MaxSessionMs, 120ULL * 60ULL * 1000ULL, StrId::STR_ACH_TITLE_TWO_HOUR_SESSION},
  };
  return items;
}

std::string ReadingAchievements::description(const AchievementDefinition& def) {
  const std::string n = std::to_string(def.target);
  switch (def.metric) {
    case AchMetric::BooksStarted:
      if (def.target == 1) return tr(STR_ACH_DESC_START_FIRST_BOOK);
      return replaceFirst(tr(STR_ACH_DESC_START_BOOKS_FMT), "%u", n);
    case AchMetric::BooksFinished:
      if (def.target == 1) return tr(STR_ACH_DESC_FINISH_FIRST_BOOK);
      return replaceFirst(tr(STR_ACH_DESC_FINISH_BOOKS_FMT), "%u", n);
    case AchMetric::Sessions:
      if (def.target == 1) return tr(STR_ACH_DESC_FIRST_SESSION);
      return replaceFirst(tr(STR_ACH_DESC_SESSIONS_FMT), "%u", n);
    case AchMetric::TotalReadingMs:
      return replaceFirst(tr(STR_ACH_DESC_TOTAL_READING_FMT), "%s", formatDurationCompact(def.target));
    case AchMetric::GoalDays:
      if (def.target == 1) return tr(STR_ACH_DESC_FIRST_GOAL_DAY);
      return replaceFirst(tr(STR_ACH_DESC_GOAL_DAYS_FMT), "%u", n);
    case AchMetric::MaxGoalStreak:
      return replaceFirst(tr(STR_ACH_DESC_GOAL_STREAK_FMT), "%u", n);
    case AchMetric::MaxSessionMs:
      return replaceFirst(tr(STR_ACH_DESC_LONG_SESSION_FMT), "%s", formatDurationCompact(def.target));
  }
  return std::string();
}

std::vector<AchievementView> ReadingAchievements::buildViews() {
  const Snapshot s = computeSnapshot();
  std::vector<AchievementView> views;
  views.reserve(list().size());
  for (const auto& def : list()) {
    const uint64_t progress = valueFor(s, def.metric);
    AchievementView v;
    v.definition = &def;
    v.progress = progress;
    v.target = def.target;
    v.unlocked = progress >= def.target;
    views.push_back(v);
  }
  // Unlocked first, then by completion ratio (descending), stable otherwise.
  std::stable_sort(views.begin(), views.end(), [](const AchievementView& a, const AchievementView& b) {
    if (a.unlocked != b.unlocked) return a.unlocked;  // true before false
    const uint64_t ra = a.target > 0 ? a.progress * 100ULL / a.target : 0;
    const uint64_t rb = b.target > 0 ? b.progress * 100ULL / b.target : 0;
    return ra > rb;
  });
  return views;
}
