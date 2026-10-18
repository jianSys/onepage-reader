#pragma once

#include "activities/Activity.h"
#include <string>

class MappedInputManager;
class GfxRenderer;

// A simple integer calculator, navigated with the D-pad (a crossmux-style "app").
class CalculatorActivity : public Activity {
 public:
  CalculatorActivity(GfxRenderer& renderer, MappedInputManager& mappedInput);

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  static constexpr int kCols = 4;
  static constexpr int kRows = 4;

  int cursor_ = 0;             // 0..15 keypad cursor
  double result_ = 0;          // accumulated result
  double current_ = 0;         // value being entered
  char pendingOp_ = 0;         // '+', '-', '*', '/' or 0
  bool entering_ = false;      // true while typing current_
  bool justEvaluated_ = false;

  void pressKey(int index);
  double apply(double a, char op, double b) const;
  std::string displayText() const;
};
