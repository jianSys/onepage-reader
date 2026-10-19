#include "AppGame.h"

#include <memory>
#include <vector>

#include "2048/Game2048Activity.h"
#include "sokoban/SokobanGameActivity.h"
#include "sudoku/SudokuMenuActivity.h"

std::vector<AppGame> getGameApps() {
  return {
      // Sudoku: the menu activity is the entry point (continue / new game by
      // difficulty / stats); it pushes the actual game as a sub-activity.
      {StrId::STR_SUDOKU_TITLE, StrId::STR_SUDOKU_MENU,
       [](GfxRenderer& renderer, MappedInputManager& mappedInput) -> std::unique_ptr<Activity> {
         return std::make_unique<SudokuMenuActivity>(renderer, mappedInput);
       }},
      // 2048: single-activity game (no menu) — resumes any in-progress board.
      {StrId::STR_2048_TITLE, StrId::STR_2048_MENU,
       [](GfxRenderer& renderer, MappedInputManager& mappedInput) -> std::unique_ptr<Activity> {
         return std::make_unique<Game2048Activity>(renderer, mappedInput);
       }},
      // Sokoban: single-activity game — resumes the saved level; level select lives inside
      // the game (Confirm opens it, Back returns to play).
      {StrId::STR_SOKOBAN_TITLE, StrId::STR_SOKOBAN_MENU,
       [](GfxRenderer& renderer, MappedInputManager& mappedInput) -> std::unique_ptr<Activity> {
         return std::make_unique<SokobanGameActivity>(renderer, mappedInput);
       }},
  };
}
