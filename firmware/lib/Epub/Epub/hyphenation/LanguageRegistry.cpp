#include "LanguageRegistry.h"

#include <algorithm>
#include <array>

#include "HyphenationCommon.h"
#include "generated/hyph-en.trie.h"

namespace {

// English hyphenation patterns (3/3 minimum prefix/suffix length)
LanguageHyphenator englishHyphenator(en_patterns, isLatinLetter, toLowerLatin, 3, 3);

// Only English ships in flash by design: each Liang trie costs 13-200KB of app
// partition (de alone was 201KB) and this device's readers work in CJK scripts,
// which wrap per character and never use hyphenation dictionaries. Books in
// other languages degrade gracefully (see Hyphenator.cpp): explicit soft
// hyphens and the every-N-chars fallback still apply. To re-enable a language,
// restore its generated/hyph-XX.trie.h include, hyphenator, and entry below.
using EntryArray = std::array<LanguageEntry, 1>;

const EntryArray& entries() {
  static const EntryArray kEntries = {{"english", "en", &englishHyphenator}};
  return kEntries;
}

}  // namespace

const LanguageHyphenator* getLanguageHyphenatorForPrimaryTag(const std::string& primaryTag) {
  const auto& allEntries = entries();
  const auto it = std::find_if(allEntries.begin(), allEntries.end(),
                               [&primaryTag](const LanguageEntry& entry) { return primaryTag == entry.primaryTag; });
  return (it != allEntries.end()) ? it->hyphenator : nullptr;
}

LanguageEntryView getLanguageEntries() {
  const auto& allEntries = entries();
  return LanguageEntryView{allEntries.data(), allEntries.size()};
}
