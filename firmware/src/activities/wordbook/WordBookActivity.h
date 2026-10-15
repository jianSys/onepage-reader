#pragma once
#include <string>

#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// Top-level Word Book screen: a virtual list of [Review], [Add Word] followed by
// the stored words. Adding chains two keyboard prompts (word, then meaning);
// deleting uses a long-press + ConfirmationActivity (mirrors RecentBooksActivity).
class WordBookActivity final : public Activity {
  ButtonNavigator buttonNavigator;
  int selectorIndex = 0;
  bool longPressFired = false;
  std::string pendingWord;  // word typed before the meaning prompt completes

  // Rows = 2 action rows + stored word count.
  int getRowCount() const;

  void startReview();
  void startAddWord();
  void promptDeleteWord(int entryIndex);

 public:
  explicit WordBookActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("WordBook", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
