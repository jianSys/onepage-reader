#include "ToolApp.h"

#include <memory>
#include <vector>

#include "BookshelfActivity.h"
#include "CalculatorActivity.h"
#include "CalendarActivity.h"
#include "DictionaryActivity.h"
#include "NotificationActivity.h"
#include "PomodoroActivity.h"
#include "ReadingAnalyticsMenuActivity.h"

std::vector<ToolApp> getToolApps() {
  return {
      {StrId::STR_POMODORO, StrId::STR_POMODORO_HINT,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<PomodoroActivity>(r, i); }},
      {StrId::STR_CALENDAR, StrId::STR_CALENDAR_HINT,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<CalendarActivity>(r, i); }},
      {StrId::STR_READING_STATS, StrId::STR_READING_STATS_HINT,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<ReadingAnalyticsMenuActivity>(r, i); }},
      {StrId::STR_CALCULATOR, StrId::STR_CALCULATOR_HINT,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<CalculatorActivity>(r, i); }},
      {StrId::STR_DICTIONARY, StrId::STR_DICTIONARY_HINT,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<DictionaryActivity>(r, i); }},
      {StrId::STR_NOTIFICATIONS, StrId::STR_NOTIFICATIONS_HINT,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<NotificationActivity>(r, i); }},
      {StrId::STR_BOOKSHELF, StrId::STR_BOOKSHELF,
       [](GfxRenderer& r, MappedInputManager& i) { return std::make_unique<BookshelfActivity>(r, i); }},
  };
}
