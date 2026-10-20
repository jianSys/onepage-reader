#pragma once

#include <Print.h>

class Stream : public Print {
 public:
  virtual int available() = 0;
  virtual int read() = 0;
  virtual int peek() = 0;

  // Arduino's Stream API exposes a per-stream timeout used by helper read
  // operations (readBytes, timedRead). Host doesn't run those code paths, but
  // subclasses still call setTimeout() in their constructors.
  void setTimeout(unsigned long timeoutMs) { _timeout = timeoutMs; }
  unsigned long getTimeout() const { return _timeout; }

  // Read until terminator or timeout; default impl reads byte-by-byte.
  virtual String readStringUntil(char terminator);
  virtual String readString();

  // Arduino's blocking read helpers, used by ArduinoJson's stream reader. Host streams
  // return -1 instead of blocking on timeout, so these stop as soon as the source dries
  // up rather than burning _timeout milliseconds per call.
  virtual size_t readBytes(char* buffer, size_t length);
  size_t readBytes(uint8_t* buffer, size_t length) { return readBytes(reinterpret_cast<char*>(buffer), length); }

 protected:
  unsigned long _timeout = 1000;
};
