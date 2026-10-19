#pragma once

#include <string>
#include <unordered_map>

#include "activities/Activity.h"

// GitHub-style reading heatmap (P4). Renders the per-day reading buckets from our
// ReadingStatsStore as a 7-row grid of weeks, each cell shaded into 4 grayscale tiers
// relative to the daily reading goal. Key-only: Back exits, Left/Right page the window.
// Plain Activity - no freeink, no touch.
class ReadingHeatmapActivity final : public Activity {
 public:
  explicit ReadingHeatmapActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("ReadingHeatmap", renderer, mappedInput) {}
  ~ReadingHeatmapActivity() override = default;

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  int weeksBack = 0;  // window shift in weeks (0 = most recent)
  std::unordered_map<uint32_t, uint64_t> byDay;  // dayOrdinal -> readingMs
};
