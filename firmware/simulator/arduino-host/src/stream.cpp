#include <Stream.h>

String Stream::readStringUntil(char terminator) {
  String out;
  out.reserve(64);
  while (true) {
    int v = read();
    if (v < 0) break;
    char c = static_cast<char>(v);
    if (c == terminator) break;
    out += c;
  }
  return out;
}

String Stream::readString() {
  String out;
  out.reserve(64);
  while (true) {
    int v = read();
    if (v < 0) break;
    out += static_cast<char>(v);
  }
  return out;
}

size_t Stream::readBytes(char* buffer, size_t length) {
  size_t count = 0;
  while (count < length) {
    int v = read();
    if (v < 0) break;
    buffer[count++] = static_cast<char>(v);
  }
  return count;
}
