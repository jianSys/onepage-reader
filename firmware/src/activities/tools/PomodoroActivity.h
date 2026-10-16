#pragma once
#include "activities/Activity.h"

/**
 * Pomodoro / focus timer. A single countdown you start from the Tools hub.
 * Minutes are shown as oversized seven-segment digits (the biggest built-in font
 * is only 18pt, so we draw the "big numbers" from filled bars like the lock-screen
 * dashboard). The panel repaints once per minute rather than every second — e-ink
 * gains nothing from a ticking-seconds refresh and it saves power and ghosting.
 *
 * Controls: Up/Down adjust the duration while stopped or paused, Confirm starts /
 * pauses / resumes / restarts, Back exits to the Tools list. While counting down we
 * keep the device awake (preventAutoSleep) so the timer stays accurate and can fire
 * the "time's up" frame; once stopped or finished we let normal auto-sleep resume.
 */
class PomodoroActivity final : public Activity {
 public:
  explicit PomodoroActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("Pomodoro", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&& lock) override;
  // Stay awake only while counting down, so a running timer keeps accurate time and
  // can show the "time's up" screen; paused/idle/done fall back to normal auto-sleep.
  bool preventAutoSleep() override { return state == State::Running; }

 private:
  enum class State { Idle, Running, Paused, Done };

  unsigned long totalMs() const;
  unsigned long elapsedMs() const;
  unsigned long remainingMs() const;
  int minutesToDisplay() const;
  void startCountdown();
  void pauseCountdown();
  void resumeCountdown();
  void resetToConfig();

  State state = State::Idle;
  int durationMin = 25;        // selected focus length (1..99)
  unsigned long runAnchorMs = 0;    // millis() when the current Running segment began
  unsigned long accumulatedMs = 0;  // focus time already banked before the current segment
  unsigned long lastPollMs = 0;     // last loop() sample, throttles repaints
  int lastShownMinute = -1;         // minute value on the panel; change => refresh
};
