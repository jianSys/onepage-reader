#pragma once

#include <cstdint>

using BaseType_t = long;
using UBaseType_t = unsigned long;
using TickType_t = uint32_t;
using StackType_t = uint8_t;

inline constexpr BaseType_t pdTRUE = 1;
inline constexpr BaseType_t pdFALSE = 0;
inline constexpr BaseType_t pdPASS = 1;
inline constexpr BaseType_t pdFAIL = 0;

inline constexpr TickType_t portMAX_DELAY = static_cast<TickType_t>(-1);
inline constexpr TickType_t portTICK_PERIOD_MS = 1;
inline constexpr unsigned configTICK_RATE_HZ = 1000;

#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))

#ifndef IRAM_ATTR
#define IRAM_ATTR
#endif
#ifndef DRAM_ATTR
#define DRAM_ATTR
#endif

// Queue handles are normally introduced by <freertos/queue.h>. Some firmware headers
// reference the type while only including <freertos/FreeRTOS.h>, which the ESP-IDF
// build tolerates through include order; declare the alias here so header-only
// consumers are self-sufficient. queue.h re-declares the same alias.
struct Queue_;
using QueueHandle_t = Queue_*;
