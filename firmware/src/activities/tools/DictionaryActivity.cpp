#include "DictionaryActivity.h"

#include <GfxRenderer.h>
#include <I18n.h>

#include <cctype>
#include <string>
#include <variant>

#include <HalStorage.h>

#include <Utf8.h>

#include "activities/ActivityResult.h"
#include "activities/util/KeyboardEntryActivity.h"
#include "MappedInputManager.h"
#include "ToolsUi.h"
#include "components/UITheme.h"
#include "fontIds.h"

namespace {
constexpr const char* kDictPaths[] = {"/.dict/dictionary.txt", "/.crosspoint/dictionary.txt",
                                      "/dictionary.txt"};

// Trim ASCII / C0 whitespace and the ideographic/full-width space from a query.
std::string trimQuery(const std::string& in) {
  size_t b = 0, e = in.size();
  auto isWs = [](unsigned char c) { return c <= 0x20 || c == 0x7F; };
  while (b < e && isWs(static_cast<unsigned char>(in[b]))) b++;
  while (e > b && isWs(static_cast<unsigned char>(in[e - 1]))) e--;
  return in.substr(b, e - b);
}

// Split one dictionary line "head<TAB>def" (or "head=def") into its parts.
bool splitEntry(const std::string& raw, std::string& head, std::string& def) {
  std::string s = raw;
  while (!s.empty() && (s.back() == '\r' || s.back() == '\n')) s.pop_back();
  size_t sep = s.find('\t');
  if (sep == std::string::npos) sep = s.find('=');
  if (sep == std::string::npos) return false;
  head = s.substr(0, sep);
  def = s.substr(sep + 1);
  return true;
}

// Small buffered reader so the binary search doesn't issue one SPI transaction
// per byte when scanning a line.
struct DictReader {
  HalFile& f;
  uint8_t buf[256];
  size_t pos = 0;
  size_t len = 0;
  int getByte() {
    if (pos >= len) {
      len = f.read(buf, sizeof(buf));
      pos = 0;
      if (len == 0) return -1;
    }
    return static_cast<int>(buf[pos++]);
  }
  void reset() { pos = 0; len = 0; }
};

std::string readLine(DictReader& r) {
  std::string out;
  int b;
  while ((b = r.getByte()) != -1 && b != '\n') out += static_cast<char>(b);
  if (!out.empty() && out.back() == '\r') out.pop_back();
  return out;
}
}  // namespace

DictionaryActivity::DictionaryActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
    : Activity("DictionaryActivity", renderer, mappedInput) {}

void DictionaryActivity::setInitialQuery(const std::string& q) { query_ = q; }

void DictionaryActivity::openKeyboard() {
  auto handler = [this](const ActivityResult& result) {
    if (!result.isCancelled) {
      if (auto* kr = std::get_if<KeyboardResult>(&result.data)) {
        if (!kr->text.empty()) lookUp(kr->text);
      }
    }
    requestUpdate();
  };
  startActivityForResult(
      std::make_unique<KeyboardEntryActivity>(renderer, mappedInput, tr(STR_DICTIONARY_ENTER_WORD), query_, 48),
      std::move(handler));
}

void DictionaryActivity::onEnter() {
  Activity::onEnter();
  if (!query_.empty()) {
    lookUp(query_);
    requestUpdate();
    return;
  }
  openKeyboard();
}

void DictionaryActivity::lookUp(const std::string& word) {
  query_ = word;
  definition_.clear();
  lookedUp_ = true;
  dictFileMissing_ = false;
  if (word.empty()) return;

  // Normalize exactly like the reader does (ParsedText::addWord composes NFC),
  // then trim whitespace so a stray space can't break the match. The dictionary
  // is generated with NFC headwords, so a normalized key matches directly.
  std::string key = utf8ComposeNfc(word);
  key = trimQuery(key);
  if (key.empty()) return;

  // Fast path: binary search a sorted dictionary (handles very large files).
  if (binarySearchDictionary(key, definition_)) return;

  // Fallback: linear scan. Runs for small/unsorted custom dictionaries AND as a
  // correctness net when the binary search misses the (large) sorted file — a
  // miss is user-triggered and rare, so the one-off scan cost is acceptable.
  bool anyFileOpened = false;
  for (const char* p : kDictPaths) {
    HalFile f;
    if (!Storage.openFileForRead("Dictionary", p, f)) continue;
    anyFileOpened = true;

    std::string line;
    uint8_t buf[128];
    bool found = false;
    while (f.available() > 0) {
      const size_t n = f.read(buf, sizeof(buf));
      if (n == 0) break;
      for (size_t i = 0; i < n; ++i) {
        const char c = static_cast<char>(buf[i]);
        if (c == '\n' || c == '\r') {
          if (!line.empty()) {
            if (matchDictionaryLine(line, key)) {
              found = true;
              break;
            }
            line.clear();
          }
        } else {
          line += c;
        }
      }
      if (found) break;
    }
    // Handle a final line that has no trailing newline.
    if (!found && !line.empty()) matchDictionaryLine(line, key);
    if (found || !definition_.empty()) return;
  }

  if (!anyFileOpened) {
    // No dictionary data file on the SD card — distinct from "word not found".
    dictFileMissing_ = true;
  }
}

bool DictionaryActivity::binarySearchDictionary(const std::string& key, std::string& def) {
  HalFile f;
  bool opened = false;
  for (const char* p : kDictPaths) {
    if (Storage.openFileForRead("Dictionary", p, f)) { opened = true; break; }
  }
  if (!opened) return false;
  const uint64_t size = f.fileSize64();
  if (size == 0) return false;

  DictReader r{f};

  // Return the offset of the first line start at or after `mid`.
  auto lineStartAt = [&](uint64_t mid) -> uint64_t {
    if (mid == 0) return 0;
    f.seekSet(mid - 1);
    r.reset();
    int b;
    while ((b = r.getByte()) != -1 && b != '\n') { /* skip to end of this line */ }
    return f.position();
  };

  uint64_t lo = 0, hi = size;
  while (lo < hi) {
    const uint64_t mid = lo + (hi - lo) / 2;
    const uint64_t lineStart = lineStartAt(mid);
    f.seekSet(lineStart);
    r.reset();
    const std::string line = readLine(r);
    const uint64_t lineEnd = f.position();  // offset just past this line

    std::string head, d;
    if (!splitEntry(line, head, d)) { lo = lineEnd; continue; }
    const int cmp = head.compare(key);  // UTF-8 byte order == codepoint order
    if (cmp < 0) lo = lineEnd;          // key is after this line
    else hi = lineStart;                // key is at or before this line
  }

  // lo is the first line whose head >= key; check for an exact match.
  f.seekSet(lo);
  r.reset();
  std::string head, d;
  if (splitEntry(readLine(r), head, d) && head == key) {
    def = d;
    return true;
  }
  return false;
}

bool DictionaryActivity::matchDictionaryLine(const std::string& line, const std::string& key) {
  std::string head, def;
  if (!splitEntry(line, head, def)) return false;
  // Normalize the headword the same way the query was normalized (NFC + lower),
  // so dictionary entries stored in a non-precomposed form still match.
  head = utf8ComposeNfc(head);
  for (char& c : head) c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
  std::string k = key;
  for (char& c : k) c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
  if (head == k) {
    definition_ = def;
    return true;
  }
  return false;
}

void DictionaryActivity::loop() {
  if (mappedInput.wasReleased(MappedInputManager::Button::Back)) {
    finish();
    return;
  }
  if (mappedInput.wasPressed(MappedInputManager::Button::Confirm)) {
    // Re-open the keyboard to edit / re-enter a different word.
    openKeyboard();
    return;
  }
}

void DictionaryActivity::render(RenderLock&&) {
  renderer.clearScreen();

  const int pageWidth = renderer.getScreenWidth();
  const int pageHeight = renderer.getScreenHeight();
  const auto& metrics = UITheme::getInstance().getMetrics();

  GUI.drawHeader(renderer, Rect{0, metrics.topPadding, pageWidth, metrics.headerHeight}, tr(STR_DICTIONARY));

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int contentBottom = pageHeight - (metrics.buttonHintsHeight + metrics.verticalSpacing);
  const int cardX = 14;
  const int cardW = pageWidth - cardX * 2;
  const int pad = 16;

  // ---- word hero card ----
  const int heroH = 84;
  ToolsUi::drawCard(renderer, cardX, contentTop, cardW, heroH, 10);
  ToolsUi::drawTracked(renderer, SMALL_FONT_ID,
                       ToolsUi::eyebrow(tr(STR_DICTIONARY), "DICTIONARY").c_str(), cardX + pad, contentTop + 14, 2, true);

  const std::string wordLine = (lookedUp_ && !query_.empty()) ? query_ : std::string(tr(STR_DICTIONARY_HINT));
  // NOTOSERIF_18 has no CJK glyphs, so a Chinese word (e.g. selected in the
  // reader) would garble. Use a CJK-capable UI font for non-ASCII words.
  bool wordHasCjk = false;
  for (char c : wordLine) {
    if (static_cast<unsigned char>(c) >= 0x80) { wordHasCjk = true; break; }
  }
  const int wordFont = wordHasCjk ? UI_12_FONT_ID : NOTOSERIF_18_FONT_ID;
  const auto wordStyle = wordHasCjk ? EpdFontFamily::REGULAR : EpdFontFamily::BOLD;
  const int wordW = renderer.getTextWidth(wordFont, wordLine.c_str());
  const int wordY = contentTop + heroH - pad - renderer.getLineHeight(wordFont);
  renderer.drawText(wordFont, cardX + pad, wordY, wordLine.c_str(), true, wordStyle);

  // ---- definition card ----
  const int defTop = contentTop + heroH + 16;
  const int defH = contentBottom - defTop;
  ToolsUi::drawCard(renderer, cardX, defTop, cardW, defH, 10);
  ToolsUi::drawTracked(renderer, SMALL_FONT_ID, "DEFINITION", cardX + pad, defTop + pad, 2, true);

  std::string defText;
  if (!lookedUp_) {
    defText = tr(STR_DICTIONARY_HINT);
  } else if (dictFileMissing_) {
    defText = tr(STR_DICTIONARY_FILE_MISSING);
  } else if (definition_.empty()) {
    defText = tr(STR_DICTIONARY_NOT_FOUND);
  } else {
    defText = definition_;
  }

  const int labelFont = UI_12_FONT_ID;
  const int lineH = renderer.getLineHeight(labelFont);
  const int maxW = cardW - pad * 2;
  int y = defTop + pad + lineH + 8;
  std::string lineStr;
  int w = 0;
  for (size_t i = 0; i < defText.size(); i++) {
    const char ch = defText[i];
    if (ch == '\n' || w + renderer.getTextWidth(labelFont, std::string(1, ch).c_str()) > maxW) {
      if (!lineStr.empty()) {
        renderer.drawText(labelFont, cardX + pad, y, lineStr.c_str(), true);
        y += lineH + 2;
        lineStr.clear();
        w = 0;
      }
      if (ch == '\n' || ch == ' ' || ch == '　') continue;
    }
    lineStr += ch;
    w += renderer.getTextWidth(labelFont, std::string(1, ch).c_str());
  }
  if (!lineStr.empty()) renderer.drawText(labelFont, cardX + pad, y, lineStr.c_str(), true);

  const auto labels = mappedInput.mapLabels(tr(STR_HOME), tr(STR_SELECT), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);

  displayUiBuffer();
}
