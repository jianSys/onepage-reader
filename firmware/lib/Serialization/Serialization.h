#pragma once
#include <HalStorage.h>

#include <iostream>

namespace serialization {
template <typename T>
void writePod(std::ostream& os, const T& value) {
  os.write(reinterpret_cast<const char*>(&value), sizeof(T));
}

template <typename T>
void writePod(HalFile& file, const T& value) {
  file.write(reinterpret_cast<const uint8_t*>(&value), sizeof(T));
}

template <typename T>
void readPod(std::istream& is, T& value) {
  is.read(reinterpret_cast<char*>(&value), sizeof(T));
}

template <typename T>
void readPod(HalFile& file, T& value) {
  file.read(reinterpret_cast<uint8_t*>(&value), sizeof(T));
}

inline void writeString(std::ostream& os, const std::string& s) {
  const uint32_t len = s.size();
  writePod(os, len);
  os.write(s.data(), len);
}

inline void writeString(HalFile& file, const std::string& s) {
  const uint32_t len = s.size();
  writePod(file, len);
  file.write(reinterpret_cast<const uint8_t*>(s.data()), len);
}

inline void readString(std::istream& is, std::string& s) {
  uint32_t len;
  readPod(is, len);
  s.resize(len);
  is.read(&s[0], len);
}

inline void readString(HalFile& file, std::string& s) {
  uint32_t len;
  readPod(file, len);
  s.resize(len);
  file.read(&s[0], len);
}

// Try-style variants used by journal / persistence code that must abort a
// multi-field write when any step short-circuits. The void versions above
// silently swallow FS errors, which is fine for fire-and-forget caches but
// unsafe for user data. HalFile::read/write return the byte count, and the
// stream variants expose the usual good/bad bits, so we can detect short IO
// without touching the underlying HAL.
template <typename T>
inline bool tryWritePod(std::ostream& os, const T& value) {
  os.write(reinterpret_cast<const char*>(&value), sizeof(T));
  return os.good();
}

template <typename T>
inline bool tryWritePod(HalFile& file, const T& value) {
  return file.write(reinterpret_cast<const uint8_t*>(&value), sizeof(T)) == sizeof(T);
}

template <typename T>
inline bool tryReadPod(std::istream& is, T& value) {
  is.read(reinterpret_cast<char*>(&value), sizeof(T));
  return is.good();
}

template <typename T>
inline bool tryReadPod(HalFile& file, T& value) {
  return file.read(reinterpret_cast<uint8_t*>(&value), sizeof(T)) == static_cast<int>(sizeof(T));
}

inline bool tryWriteString(std::ostream& os, const std::string& s) {
  const uint32_t len = s.size();
  if (!tryWritePod(os, len)) return false;
  os.write(s.data(), len);
  return os.good();
}

inline bool tryWriteString(HalFile& file, const std::string& s) {
  const uint32_t len = s.size();
  if (!tryWritePod(file, len)) return false;
  if (len == 0) return true;
  return file.write(reinterpret_cast<const uint8_t*>(s.data()), len) == len;
}

inline bool tryReadString(std::istream& is, std::string& s) {
  uint32_t len;
  if (!tryReadPod(is, len)) return false;
  s.resize(len);
  if (len == 0) return true;
  is.read(&s[0], len);
  return is.good();
}

inline bool tryReadString(HalFile& file, std::string& s) {
  uint32_t len;
  if (!tryReadPod(file, len)) return false;
  s.resize(len);
  if (len == 0) return true;
  return file.read(&s[0], len) == static_cast<int>(len);
}

// Length-capped variant used when reading untrusted / possibly-corrupt headers:
// refuses a stored length larger than maxLen before resizing the destination,
// so a bad uint32 in the file cannot trigger a huge heap alloc on-device.
inline bool tryReadString(HalFile& file, std::string& s, uint32_t maxLen) {
  uint32_t len;
  if (!tryReadPod(file, len)) return false;
  if (len > maxLen) return false;
  s.resize(len);
  if (len == 0) return true;
  return file.read(&s[0], len) == static_cast<int>(len);
}
}  // namespace serialization
