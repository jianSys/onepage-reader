#pragma once

// Flash-string access. On ESP32 the flash is memory-mapped into the address space, so
// `PROGMEM` marks data that is already readable with plain loads and every pgm_read_*()
// is an ordinary dereference. Mirroring ESP32's pgmspace.h here keeps the same
// `const char x[] PROGMEM = {...}` tables and pgm_read_*() call sites compiling on host
// (ArduinoJson's PROGMEM readers depend on it too).
//
// AVR-style true-flash targets would need a real copy-to-RAM step; nothing in this
// firmware relies on that.

#ifndef PROGMEM
#  define PROGMEM
#endif

#ifndef pgm_read_byte
#  define pgm_read_byte(addr) (*(const unsigned char*)(addr))
#endif
#ifndef pgm_read_word
#  define pgm_read_word(addr) (*(const unsigned short*)(addr))
#endif
#ifndef pgm_read_dword
#  define pgm_read_dword(addr) (*(const unsigned long*)(addr))
#endif
#ifndef pgm_read_float
#  define pgm_read_float(addr) (*(const float*)(addr))
#endif
#ifndef pgm_read_ptr
#  define pgm_read_ptr(addr) (*(void* const*)(addr))
#endif
