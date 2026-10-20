#pragma once

#include <cstddef>

class Print;

// Anything that can render itself into a Print sink. ArduinoJson serializes values of
// this type through printTo(), so the interface (not just the name) has to match.
class Printable {
 public:
  virtual ~Printable() = default;
  virtual size_t printTo(Print& p) const = 0;
};
