#pragma once

#include <cstdint>
#include <string>

// Canonical 32-bit MurmurHash2 (seed 0) over the string's UTF-8 bytes.
//
// Txt uses this to name its cache directory ("txt_<hash>"). It MUST stay
// byte-identical to murmur2_32() in src/network/html/TxtIndexPage.html, because
// that web page pre-computes the same hash to place index.bin where the reader
// will look for it. Previously Txt called std::hash<std::string>, which is
// implementation-defined and width-dependent (32-bit on the ESP32 target, but
// 64-bit on the host test runner) — an upgrade could silently change the
// directory name and orphan every cached book with no error. Pinning the
// algorithm here makes device, simulator and web agree by construction, and
// test/path_hash locks it against golden vectors.
namespace txthash {

inline uint32_t murmur2_32(const std::string& s) {
  constexpr uint32_t m = 0x5bd1e995u;
  constexpr int r = 24;
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(s.data());
  const size_t n = s.size();
  uint32_t h = 0u ^ static_cast<uint32_t>(n);  // seed = 0, XOR length
  size_t i = 0;
  uint32_t len = static_cast<uint32_t>(n);
  while (len >= 4) {
    uint32_t k = static_cast<uint32_t>(bytes[i]) | (static_cast<uint32_t>(bytes[i + 1]) << 8) |
                 (static_cast<uint32_t>(bytes[i + 2]) << 16) | (static_cast<uint32_t>(bytes[i + 3]) << 24);
    k *= m;
    k ^= k >> r;
    k *= m;
    h *= m;
    h ^= k;
    i += 4;
    len -= 4;
  }
  if (len >= 3) h ^= static_cast<uint32_t>(bytes[i + 2]) << 16;
  if (len >= 2) h ^= static_cast<uint32_t>(bytes[i + 1]) << 8;
  if (len >= 1) {
    h ^= static_cast<uint32_t>(bytes[i]);
    h *= m;
  }
  h ^= h >> 13;
  h *= m;
  h ^= h >> 15;
  return h;
}

}  // namespace txthash
