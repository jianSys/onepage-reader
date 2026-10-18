#pragma once

#include "activities/Activity.h"
#include <string>

class MappedInputManager;
class GfxRenderer;

// Manual dictionary lookup. The user types a word (via the on-screen keyboard) and
// we look it up in a local dictionary file on the SD card
// (default path "/.dict/dictionary.txt", one "word<TAB>definition" per line, UTF-8).
// Mirrors crossmux's DictionaryDefinitionActivity but with a pluggable file source
// so it works without bundling a large built-in dictionary.
class DictionaryActivity : public Activity {
 public:
  DictionaryActivity(GfxRenderer& renderer, MappedInputManager& mappedInput);

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  std::string query_;
  std::string definition_;
  bool lookedUp_ = false;
  // True when the dictionary data file is absent from the SD card (as opposed to
  // the word simply not being in the dictionary). Lets the UI tell the user to
  // deploy /.dict/dictionary.txt instead of a misleading "not found".
  bool dictFileMissing_ = false;

  void lookUp(const std::string& word);
  void openKeyboard();

  // Streaming line matcher used by lookUp(): parses "word<TAB>def" (or "word=def"),
  // lowercases the head word, and stores the definition on match.
  bool matchDictionaryLine(const std::string& line, const std::string& lower);

  // Binary search over a sorted dictionary file (word<TAB>def, sorted by head word
  // in UTF-8 byte order). O(log n) — keeps lookups fast even for very large files.
  // Returns true and fills `def` when the exact key is found.
  bool binarySearchDictionary(const std::string& key, std::string& def);

 public:
  // Pre-fill the lookup word (e.g. a word selected in the reader) and look it up
  // immediately on entry instead of opening the keyboard.
  void setInitialQuery(const std::string& q);
};
