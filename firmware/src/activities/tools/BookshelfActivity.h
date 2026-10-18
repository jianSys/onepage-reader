#pragma once

#include <vector>

#include "RecentBooksStore.h"
#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// A bookshelf view over the recent-books list. Each book shows a Bookmark icon when
// favorited; long-press Confirm toggles the favorite flag (persisted via BookshelfStore).
// Short-press Confirm opens the book — mirrors RecentBooksActivity but adds the
// collection/favorite concept that was previously missing.
class BookshelfActivity : public Activity {
 private:
  ButtonNavigator buttonNavigator;
  size_t selectorIndex = 0;
  bool longPressFired = false;
  std::vector<RecentBook> books_;

  void loadBooks();

  // Number of books visible on one page of the 4-column grid (rows * 4).
  // Shared by render() and loop() so paging stays in sync.
  int computePageItems() const;

 public:
  explicit BookshelfActivity(GfxRenderer& renderer, MappedInputManager& mappedInput);
  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
