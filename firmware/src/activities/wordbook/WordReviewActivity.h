#pragma once
#include <vector>

#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// A single Leitner review session over the currently-due cards. The queue of due
// store indices is snapshotted on enter (grading never reorders it), the card is
// revealed with Confirm, then graded with Left (forgot) / Right (known).
class WordReviewActivity final : public Activity {
  ButtonNavigator buttonNavigator;
  std::vector<int> queue;  // store indices, most-overdue first (snapshot)
  size_t position = 0;
  bool revealed = false;
  bool finished = false;

  void advance();

 public:
  explicit WordReviewActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("WordReview", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
