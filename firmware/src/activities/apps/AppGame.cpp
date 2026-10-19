#include "AppGame.h"

#include <memory>
#include <vector>

#include "sudoku/SudokuMenuActivity.h"

std::vector<AppGame> getGameApps() {
  return {
      // Sudoku: the menu activity is the entry point (continue / new game by
      // difficulty / stats); it pushes the actual game as a sub-activity.
      {StrId::STR_SUDOKU_TITLE, StrId::STR_SUDOKU_MENU,
       [](GfxRenderer& renderer, MappedInputManager& mappedInput) -> std::unique_ptr<Activity> {
         return std::make_unique<SudokuMenuActivity>(renderer, mappedInput);
       }},
  };
}
