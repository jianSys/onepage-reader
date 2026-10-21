#pragma once
// Shim for ESP-IDF's rom CRC32 (components/esp_rom/.../esp_rom_crc.h). On-device the
// ROM routine is used by FontDownloadActivity and DictionaryDownloadActivity to checksum
// downloaded files against the manifest. Contract both callers rely on:
//
//   uint32_t crc = 0;
//   while (chunks) crc = esp_rom_crc32_le(crc, buf, len);   // == zlib crc32(all bytes)
//
// i.e. polynomial 0xEDB88320 (reflected), state pre/post-inverted inside the call, so the
// returned value is the *final* crc and feeding it back in resumes the raw state. That
// inversion is what makes the call chainable across chunks; a plain "state in, state out"
// loop would silently produce the wrong digest for any multi-chunk file.
//
// Lives in the simulator only: ESP-IDF provides the real one for the firmware build.

#include <array>
#include <cstdint>

inline constexpr std::array<uint32_t, 256> makeCrc32Table() {
  std::array<uint32_t, 256> table{};
  for (uint32_t index = 0; index < table.size(); ++index) {
    uint32_t value = index;
    for (int bit = 0; bit < 8; ++bit) {
      value = (value & 1U) ? (0xEDB88320U ^ (value >> 1U)) : (value >> 1U);
    }
    table[index] = value;
  }
  return table;
}

inline uint32_t esp_rom_crc32_le(uint32_t crc, const uint8_t* buf, uint32_t len) {
  static constexpr auto TABLE = makeCrc32Table();

  uint32_t state = ~crc;
  for (uint32_t i = 0; i < len; ++i) {
    state = TABLE[(state ^ buf[i]) & 0xFFU] ^ (state >> 8U);
  }
  return ~state;
}
