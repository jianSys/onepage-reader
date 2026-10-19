#include "ClipSelectionActivity.h"

#include <Arduino.h>
#include <FontCacheManager.h>
#include <GfxRenderer.h>
#include <I18n.h>
#include <Logging.h>
#include <Memory.h>
#include <fontIds.h>

#include <algorithm>
#include <climits>
#include <cstdlib>

#include "ClippingStore.h"
#include "CrossPointSettings.h"
#include "MappedInputManager.h"
#include "activities/ActivityResult.h"
#include "clippings/ClippingText.h"
#include "clippings/SelectionGeometry.h"
#include "components/UITheme.h"
#include "util/WordSelectionInput.h"

using Input = WordSelectionInput;

namespace {

constexpr size_t FONT_PREWARM_TEXT_MAX = 2048;
constexpr int TOUCH_DRAG_MOVEMENT_PX = 4;
constexpr unsigned long TOUCH_PAGE_ADVANCE_HOLD_MS = 1000;
constexpr int TOUCH_PAGE_END_DWELL_SLOP_PX = 8;
constexpr ClippingResult::Action SELECTION_ACTIONS[] = {ClippingResult::Action::Lookup, ClippingResult::Action::Clip,
                                                        ClippingResult::Action::Bookmark};

const char* cleanWordStart(const char* text) {
  if (!text) return "";
  if (clippingText::hasEmSpacePrefix(text)) text += 3;
  while (*text != '\0' && (*text == ' ' || *text == '\r' || *text == '\n' || *text == '\t' ||
                           (static_cast<uint8_t>(text[0]) == 0xC2 && static_cast<uint8_t>(text[1]) == 0xA0))) {
    text += static_cast<uint8_t>(text[0]) == 0xC2 ? 2 : 1;
  }
  return text;
}

}  // namespace

ClipSelectionActivity::ClipSelectionActivity(GfxRenderer& renderer, MappedInputManager& mappedInput,
                                             std::vector<std::unique_ptr<Page>> pages, const int marginLeft,
                                             const int marginTop, const int initialX, const int initialY,
                                             const Mode mode)
    : Activity("ClipSelection", renderer, mappedInput),
      pages(std::move(pages)),
      marginLeft(marginLeft),
      marginTop(marginTop),
      initialX(initialX),
      initialY(initialY),
      mode(mode) {}

void ClipSelectionActivity::onEnter() {
  Activity::onEnter();
  fontId = SETTINGS.getReaderFontId();
  lineHeight = renderer.getLineHeight(fontId);
  if (!extractWords() || wordCount == 0) {
    if (wordCount == 0) LOG_ERR("CLIP", "No selectable words on current page");
    cancel();
    return;
  }
  uint16_t firstPageRows = 0;
  for (size_t i = 0; i < wordCount; ++i) {
    const WordBox& word = words[i];
    if (word.pageOffset != 0) break;
    firstPageRows = std::max<uint16_t>(firstPageRows, static_cast<uint16_t>(word.row + 1));
  }
  const int middle = closestInRow(firstPageRows / 2, renderer.getScreenWidth() / 2);
  if (middle >= 0) selected = middle;
  if (initialX >= 0) {
    const int hit = wordAt(initialX, initialY);
    if (hit < 0) {
      cancel();
      return;
    }
    selected = rangeStart = hit;
    ignoreInitialTouch = true;
  }
  requestUpdate();
}

bool ClipSelectionActivity::extractWords() {
  wordCount = 0;
  words = makeUniqueNoThrow<WordBox[]>(MAX_SELECTABLE_WORDS);
  if (!words) {
    LOG_ERR("CLIP", "OOM: selection words (%u bytes)", static_cast<unsigned>(MAX_SELECTABLE_WORDS * sizeof(WordBox)));
    return false;
  }
  rowCount = 0;
  const bool needsFontPrewarm = renderer.isSdCardFont(fontId);
  auto pageText = needsFontPrewarm ? makeUniqueNoThrow<char[]>(FONT_PREWARM_TEXT_MAX) : nullptr;
  size_t pageTextLength = 0;
  if (needsFontPrewarm && !pageText) LOG_DBG("CLIP", "Skipping SD font prewarm: OOM");
  // C61 port (CrossPoint 1.4.1): TextBlock in this tree does not expose per-word
  // style / source range / ruby shift / character spacing / discretionary hyphen
  // the way 1.6.5 does. Words come back as parallel vectors of text + xpos and
  // render with the block's base style. The clip layer therefore treats every
  // selectable word as REGULAR, offset-less, and paragraphStart=false; selection
  // persistence still records startPage/endPage/wordIndex which is enough for
  // the store to re-anchor on font/layout changes once the Reader abstraction
  // (#3) plumbs a real layoutSignature through.
  uint8_t styleMask = 0x01;

  for (size_t pageOffset = 0; pageOffset < pages.size(); ++pageOffset) {
    uint16_t pageWordIndex = 0;
    for (const auto& element : pages[pageOffset]->elements) {
      if (element->getTag() != TAG_PageLine) continue;
      const auto& line = static_cast<const PageLine&>(*element);
      const auto& block = line.getBlock();
      if (!block || block->isEmpty()) continue;

      const size_t lineStart = wordCount;
      const bool isRtl = block->getBlockStyle().isRtl;
      const auto& wordTexts = block->getWords();
      const auto& wordXs = block->getWordXpos();
      const size_t total = wordTexts.size();
      const size_t remaining = MAX_SELECTABLE_WORDS - lineStart;
      size_t rtlWordCount = 0;
      for (size_t i = 0; i < total; ++i) {
        const char* text = wordTexts[i].c_str();
        if (!clippingText::hasVisibleText(text)) continue;

        const auto style = EpdFontFamily::REGULAR;
        int width = renderer.getTextAdvanceX(fontId, text, style);
        if (width <= 0) continue;
        if (i + 1 < total && wordXs[i + 1] > wordXs[i]) {
          width = std::min(width, static_cast<int>(wordXs[i + 1] - wordXs[i]));
        }

        if (!isRtl && wordCount == MAX_SELECTABLE_WORDS) break;

        WordBox& word = isRtl ? words[lineStart + (rtlWordCount < remaining ? rtlWordCount : rtlWordCount % remaining)]
                              : words[wordCount++];
        word.x = static_cast<int16_t>(marginLeft + line.xPos + wordXs[i]);
        word.y = static_cast<int16_t>(marginTop + line.yPos);
        word.width = static_cast<int16_t>(width);
        word.height = static_cast<int16_t>(lineHeight);
        word.row = rowCount;
        word.pageOffset = static_cast<uint8_t>(pageOffset);
        word.pageWordIndex = pageWordIndex++;
        word.startOffset = UINT32_MAX;
        word.endOffset = UINT32_MAX;
        word.text = text;
        word.style = style;
        word.characterSpacing = 0;
        word.paragraphStart = false;
        word.isRtl = isRtl;
        word.discretionaryHyphen = false;
        if (pageText) {
          for (const char* p = text; *p != '\0' && pageTextLength + 1 < FONT_PREWARM_TEXT_MAX; ++p) {
            pageText[pageTextLength++] = *p;
          }
          if (pageTextLength + 1 < FONT_PREWARM_TEXT_MAX) pageText[pageTextLength++] = ' ';
        }
        if (isRtl) ++rtlWordCount;
      }
      if (isRtl) {
        const size_t stored = std::min(remaining, rtlWordCount);
        wordCount = lineStart + stored;
        if (rtlWordCount > remaining) {
          std::rotate(words.get() + lineStart, words.get() + lineStart + rtlWordCount % remaining,
                      words.get() + wordCount);
        }
        std::reverse(words.get() + lineStart, words.get() + wordCount);
      }
      if (wordCount != lineStart) ++rowCount;
      if (wordCount == MAX_SELECTABLE_WORDS) {
        LOG_ERR("CLIP", "Selectable word cap hit (%u); multi-page selection was truncated",
                static_cast<unsigned>(MAX_SELECTABLE_WORDS));
        break;
      }
    }
    if (wordCount == MAX_SELECTABLE_WORDS) break;
  }

  if (pageText) {
    pageText[pageTextLength] = '\0';
    renderer.ensureSdCardFontReady(fontId, pageText.get(), styleMask);
  }

  return true;
}

int ClipSelectionActivity::closestInRow(const uint16_t row, const int centerX) const {
  int best = -1;
  int bestDistance = INT_MAX;
  for (int i = 0; i < static_cast<int>(wordCount); ++i) {
    if (words[i].row != row) continue;
    const int distance = std::abs(words[i].x + words[i].width / 2 - centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

int ClipSelectionActivity::wordAt(const int x, int y) const {
  y -= textOffset();
  constexpr int SLOP = 4;
  for (int i = 0; i < static_cast<int>(wordCount); ++i) {
    const WordBox& word = words[i];
    if (word.pageOffset != currentPageOffset) continue;
    if (x >= word.x - SLOP && x < word.x + word.width + SLOP && y >= word.y - SLOP && y < word.y + word.height + SLOP) {
      return i;
    }
  }
  return -1;
}

int ClipSelectionActivity::dragWordAt(const int x, int y) const {
  y -= textOffset();
  int best = -1;
  Rect nearest{};
  for (int i = 0; i < static_cast<int>(wordCount); ++i) {
    const WordBox& word = words[i];
    if (word.pageOffset != currentPageOffset) continue;
    const Rect candidate{word.x, word.y, word.width, word.height};
    if (best < 0 || selectionGeometry::nearerWord(candidate, nearest, x, y)) {
      nearest = candidate;
      best = i;
    }
  }
  return best;
}

bool ClipSelectionActivity::selectionContains(const int x, const int y) const {
  const int offset = textOffset();
  const WordBox* previous = nullptr;
  for (int i = std::min(rangeStart, selected); i <= std::max(rangeStart, selected); ++i) {
    const WordBox& word = words[i];
    if (word.pageOffset != currentPageOffset) continue;
    int left = word.x;
    int right = word.x + word.width;
    if (previous && previous->row == word.row) {
      left = std::min(left, static_cast<int>(previous->x));
      right = std::max(right, previous->x + previous->width);
    }
    if (selectionGeometry::contains(Rect{left, word.y + offset, right - left, word.height}, x, y)) return true;
    previous = &word;
  }
  return false;
}

int ClipSelectionActivity::nextPageStartIndexForTouchDrag() const {
  if (!touchDragHasMoved || rangeStart < 0 || selected < rangeStart) return -1;

  const uint8_t currentPage = words[selected].pageOffset;
  for (int i = selected + 1; i < static_cast<int>(wordCount); ++i) {
    if (words[i].pageOffset > currentPage) return i;
  }
  return -1;
}

bool ClipSelectionActivity::isWithinCurrentPageEndDwellSlop(const int x, const int y) const {
  if (selected < 0 || selected >= static_cast<int>(wordCount)) return false;
  const Rect safe = UITheme::getInstance().getScreenSafeArea(renderer, true, false);
  if (selectionGeometry::atBottomEdge(safe, lineHeight, x, y)) return true;
  if (selected + 1 < static_cast<int>(wordCount) && words[selected + 1].pageOffset == currentPageOffset) return false;
  const WordBox& word = words[selected];
  const int wordY = word.y + textOffset();
  return word.pageOffset == currentPageOffset && x >= word.x - TOUCH_PAGE_END_DWELL_SLOP_PX &&
         x < word.x + word.width + TOUCH_PAGE_END_DWELL_SLOP_PX && y >= wordY - TOUCH_PAGE_END_DWELL_SLOP_PX &&
         y < wordY + word.height + TOUCH_PAGE_END_DWELL_SLOP_PX;
}

void ClipSelectionActivity::moveVertical(const int direction) {
  const int targetRow = static_cast<int>(words[selected].row) + direction;
  if (targetRow < 0 || targetRow >= rowCount) return;
  const int next = closestInRow(static_cast<uint16_t>(targetRow), words[selected].x + words[selected].width / 2);
  if (next >= 0 && next != selected) {
    selectIndex(next);
  }
}

void ClipSelectionActivity::selectIndex(const int index) {
  if (index < 0 || index >= static_cast<int>(wordCount) || index == selected) return;
  selected = index;
  currentPageOffset = words[selected].pageOffset;
  requestUpdate();
}

void ClipSelectionActivity::moveToPage(const int pageOffset) {
  if (pageOffset < 0 || pageOffset >= static_cast<int>(pages.size()) || pageOffset == currentPageOffset) return;
  for (int i = 0; i < static_cast<int>(wordCount); ++i) {
    if (words[i].pageOffset == pageOffset) {
      selectIndex(i);
      return;
    }
  }
}

bool ClipSelectionActivity::buildSelectedText(const int first, const int last, std::string& text) const {
  text.clear();
  text.reserve(CLIPPING_TEXT_MAX);
  const size_t count = last - first + 1;
  auto order = makeUniqueNoThrow<uint16_t[]>(count);
  if (!order) {
    LOG_ERR("CLIP", "OOM: selection export order");
    return false;
  }
  bool allSourcesKnown = true;
  for (size_t i = 0; i < count; ++i) {
    order[i] = static_cast<uint16_t>(first + i);
    allSourcesKnown &= words[order[i]].startOffset != UINT32_MAX && words[order[i]].endOffset != UINT32_MAX;
  }
  // Keep navigation in visual order and export in logical source order.
  if (allSourcesKnown) {
    std::sort(order.get(), order.get() + count, [this](const uint16_t a, const uint16_t b) {
      if (words[a].startOffset == words[b].startOffset) return a < b;
      return words[a].startOffset < words[b].startOffset;
    });
  }
  for (size_t i = 0; i < count; ++i) {
    const WordBox& current = words[order[i]];
    const char* word = cleanWordStart(current.text);
    char separator = '\0';
    if (i > 0) {
      const WordBox& previous = words[order[i - 1]];
      const bool sourceKnown = previous.endOffset != UINT32_MAX && current.startOffset != UINT32_MAX;
      const bool separated = sourceKnown ? current.startOffset > previous.endOffset
                                         : current.row != previous.row || current.x > previous.x + previous.width + 2;
      if (current.paragraphStart) {
        separator = '\n';
      } else if (separated) {
        separator = ' ';
      }
    }
    if (!clippingText::append(text, word, separator, CLIPPING_TEXT_MAX, current.discretionaryHyphen)) {
      return false;
    }
  }
  return true;
}

void ClipSelectionActivity::confirmSelection(const ClippingResult::Action action) {
  if (rangeStart < 0) {
    rangeStart = selected;
    requestUpdate();
    return;
  }

  const int first = std::min(rangeStart, selected);
  const int last = std::max(rangeStart, selected);
  ClippingResult result;
  result.action = action;
  // C61 port: use Arduino ESP32 heap helpers in place of CrossMux HalMemory.
  const size_t heapFree = ESP.getFreeHeap();
  const size_t heapMax = ESP.getMaxAllocHeap();
  // reserve() aborts on OOM; leave room for the sort order and error popup too.
  const size_t requiredHeap = CLIPPING_TEXT_MAX + 1 + (last - first + 1) * sizeof(uint16_t) + 1024;
  const bool lowMemory = heapMax < CLIPPING_TEXT_MAX + 1 || heapFree < requiredHeap;
  if (lowMemory || !buildSelectedText(first, last, result.text)) {
    static constexpr StrId OPTIONS[] = {StrId::STR_BACK};
    actionPopup.show(lowMemory ? StrId::STR_MEMORY_ERROR : StrId::STR_CLIPPING_TOO_LONG, OPTIONS, 1, 0, [](int) {});
    requestUpdate();
    return;
  }
  result.startPageOffset = words[first].pageOffset;
  result.endPageOffset = words[last].pageOffset;
  result.startWordIndex = words[first].pageWordIndex;
  result.endWordIndex = words[last].pageWordIndex;
  result.wordCount = static_cast<uint16_t>(last - first + 1);
  result.startOffset = UINT32_MAX;
  result.endOffset = 0;
  for (int i = first; i <= last; ++i) {
    if (words[i].startOffset == UINT32_MAX || words[i].endOffset == UINT32_MAX) {
      result.startOffset = result.endOffset = UINT32_MAX;
      break;
    }
    result.startOffset = std::min(result.startOffset, words[i].startOffset);
    result.endOffset = std::max(result.endOffset, words[i].endOffset);
  }
  setResult(std::move(result));
  finish();
}

void ClipSelectionActivity::cancel() {
  ActivityResult result;
  result.isCancelled = true;
  setResult(std::move(result));
  finish();
}

void ClipSelectionActivity::loopButtons() {
  const uint8_t buttons = selectionInput.pollButtons(mappedInput, millis());
  if (buttons) {
    if (pendingButtonCount < pendingButtons.size()) {
      pendingButtons[pendingButtonCount++] = buttons;
    } else {
      LOG_ERR("CLIP", "Selection button queue full");
    }
  }

  RenderLock lock(RenderLock::Mode::Try);
  if (!lock.ownsLock()) return;
  size_t processed = 0;
  while (processed < pendingButtonCount) {
    if (handleButtons(pendingButtons[processed++])) break;
  }
  std::move(pendingButtons.begin() + processed, pendingButtons.begin() + pendingButtonCount, pendingButtons.begin());
  pendingButtonCount -= processed;
}

void ClipSelectionActivity::loop() {
  if (wordCount == 0) return;
  // C61 has no touch surface: everything routes through the button state machine.
  loopButtons();
}

bool ClipSelectionActivity::handleButtons(const uint8_t buttons) {
  if (actionPopup.handleButtons(buttons & Input::INPUT_PREVIOUS, buttons & Input::INPUT_NEXT,
                                buttons & Input::INPUT_CONFIRM, buttons & Input::INPUT_BACK,
                                [this] { requestUpdate(); }))
    return true;

  if (buttons & Input::INPUT_BACK) {
    if (rangeStart >= 0) {
      rangeStart = -1;
      requestUpdate();
    } else {
      cancel();
    }
    return true;
  }

  if (buttons & Input::INPUT_CONFIRM) {
    confirmSelection(mode == Mode::Lookup ? ClippingResult::Action::Lookup : ClippingResult::Action::Clip);
    return true;
  }

  const int next =
      selectionGeometry::horizontalIndex(selected, static_cast<int>(wordCount), buttons & Input::INPUT_LEFT,
                                         buttons & Input::INPUT_RIGHT, words[selected].isRtl);
  if (next != selected) {
    selectIndex(next);
  } else if (buttons & Input::INPUT_UP) {
    moveVertical(-1);
  } else if (buttons & Input::INPUT_DOWN) {
    moveVertical(1);
  }
  return false;
}

Rect ClipSelectionActivity::handleRect(const int index, const bool start) const {
  const WordBox& word = words[index];
  const Rect safe = UITheme::getInstance().getScreenSafeArea(renderer, true, false);
  const int size = std::max(24, UITheme::getInstance().getMetrics().verticalSpacing * 2);
  const bool left = start != word.isRtl;
  const int edge = left ? word.x : word.x + word.width;
  return Rect{std::clamp(edge - (left ? size : 0), safe.x, safe.x + safe.width - size),
              std::clamp(word.y + textOffset() + word.height, safe.y, safe.y + safe.height - size), size, size};
}

int ClipSelectionActivity::selectionTop() const {
  const int first = std::min(rangeStart, selected);
  const int last = std::max(rangeStart, selected);
  int top = renderer.getScreenHeight();
  for (int i = first; i <= last; ++i) {
    if (words[i].pageOffset == currentPageOffset) top = std::min(top, static_cast<int>(words[i].y));
  }
  return top;
}

Rect ClipSelectionActivity::actionRect() const {
  Rect safe = UITheme::getInstance().getScreenSafeArea(renderer, true, false);
  const auto& metrics = UITheme::getInstance().getMetrics();
  int top, right, bottom, left;
  renderer.getOrientedViewableTRBL(&top, &right, &bottom, &left);
  const int rightEdge = std::min(safe.x + safe.width, renderer.getScreenWidth() - right);
  const int bottomEdge = std::min(safe.y + safe.height, renderer.getScreenHeight() - bottom);
  safe.x = std::max(safe.x, left);
  safe.y = std::max(safe.y, top) + std::max(metrics.topPadding, metrics.verticalSpacing);
  safe.width = rightEdge - safe.x;
  safe.height = bottomEdge - safe.y;
  const int font = UI_10_FONT_ID;
  const int labelWidth =
      std::max({renderer.getTextWidth(font, tr(STR_LOOKUP)), renderer.getTextWidth(font, tr(STR_CLIP)),
                renderer.getTextWidth(font, tr(STR_BOOKMARK_OPTION))});
  const int padding = metrics.menuSpacing;
  const int width = std::min(safe.width, 3 * (labelWidth + padding * 2) + padding * 4);
  const int lines = labelWidth > (width - padding * 4) / 3 ? 2 : 1;
  const int height = std::max(36, renderer.getLineHeight(font) * lines + padding * 2);
  int first = std::min(rangeStart, selected);
  const int last = std::max(rangeStart, selected);
  while (first < last && words[first].pageOffset < currentPageOffset) ++first;
  return selectionGeometry::actions(safe, selectionTop(), height + padding * 2, metrics.verticalSpacing, width,
                                    words[first].x - padding);
}

int ClipSelectionActivity::textOffset() const {
  // C61 has no touch surface: always scroll the page to keep the cursor visible.
  if (wordCount) {
    const Rect safe = UITheme::getInstance().getScreenSafeArea(renderer, true, false);
    const WordBox& cursor = words[selected];
    return selectionGeometry::keepVisible(cursor.y, cursor.height, safe.y, safe.height);
  }
  return 0;
}

int ClipSelectionActivity::textXOffset() const {
  if (!wordCount) return 0;
  const Rect safe = UITheme::getInstance().getScreenSafeArea(renderer, true, false);
  const WordBox& cursor = words[selected];
  return selectionGeometry::keepVisible(cursor.x, cursor.width, safe.x, safe.width);
}

void ClipSelectionActivity::prewarmWord(const int index) const {
  if (index >= 0 && index < static_cast<int>(wordCount) && words[index].text) {
    renderer.getFontCacheManager()->prewarmCache(
        fontId, words[index].text, static_cast<uint8_t>(1u << (static_cast<uint8_t>(words[index].style) & 0x03)));
  }
}

void ClipSelectionActivity::ditherGapBetween(const WordBox& a, const WordBox& b, const int offsetX,
                                             const int offset) const {
  if (a.row != b.row || a.pageOffset != b.pageOffset) return;
  const int leftRight = std::min(a.x + a.width, b.x + b.width);
  const int rightLeft = std::max(a.x, b.x);
  if (leftRight < rightLeft) {
    renderer.fillRectDither(leftRight + offsetX, a.y + offset, rightLeft - leftRight, a.height, Color::LightGray);
  }
}

void ClipSelectionActivity::clearGapBetween(const WordBox& a, const WordBox& b, const int offsetX,
                                            const int offset) const {
  if (a.row != b.row || a.pageOffset != b.pageOffset) return;
  const int leftRight = std::min(a.x + a.width, b.x + b.width);
  const int rightLeft = std::max(a.x, b.x);
  if (leftRight < rightLeft) {
    renderer.fillRect(leftRight + offsetX, a.y + offset, rightLeft - leftRight, a.height, false);
  }
}

void ClipSelectionActivity::drawWordClean(const int index, const int offsetX, const int offset) const {
  if (index < 0 || index >= static_cast<int>(wordCount)) return;
  const WordBox& word = words[index];
  if (word.pageOffset != currentPageOffset) return;

  prewarmWord(index);

  renderer.fillRect(word.x + offsetX, word.y + offset, word.width, word.height, false);

  if (index > 0) {
    clearGapBetween(words[index - 1], word, offsetX, offset);
  }
  if (index + 1 < static_cast<int>(wordCount)) {
    clearGapBetween(word, words[index + 1], offsetX, offset);
  }

  renderer.drawText(fontId, word.x + offsetX, word.y + offset, word.text, true, word.style,
                    BidiUtils::BidiBaseDir::AUTO);
}

void ClipSelectionActivity::drawWordHighlight(const int index, const int firstSelected, const int lastSelected,
                                              const int offsetX, const int offset) const {
  if (index < 0 || index >= static_cast<int>(wordCount)) return;
  const WordBox& word = words[index];
  if (word.pageOffset != currentPageOffset) return;

  prewarmWord(index);

  if (index > firstSelected) {
    ditherGapBetween(words[index - 1], word, offsetX, offset);
  }
  if (index < lastSelected) {
    ditherGapBetween(word, words[index + 1], offsetX, offset);
  }

  renderer.fillRectDither(word.x + offsetX, word.y + offset, word.width, word.height, Color::LightGray);
  renderer.drawText(fontId, word.x + offsetX, word.y + offset, word.text, true, word.style,
                    BidiUtils::BidiBaseDir::AUTO);
}

bool ClipSelectionActivity::renderIncremental() {
  if (actionPopup.isActive()) return false;
  if (lastRenderedPageOffset < 0 || lastRenderedPageOffset != currentPageOffset) return false;
  const int offset = textOffset();
  const int offsetX = textXOffset();
  if (offset != lastRenderedTextOffset || offsetX != lastRenderedTextXOffset) return false;
  if (lastRenderedSelected < 0 || lastRenderedSelected >= static_cast<int>(wordCount)) return false;
  if (selected < 0 || selected >= static_cast<int>(wordCount)) return false;

  // Case 1: Moving cursor before range selection starts (rangeStart < 0)
  if (rangeStart < 0 && lastRenderedRangeStart < 0) {
    if (selected == lastRenderedSelected) return true;

    drawWordClean(lastRenderedSelected, offsetX, offset);
    drawWordHighlight(selected, selected, selected, offsetX, offset);
    const WordBox& cursor = words[selected];
    renderer.drawRect(cursor.x + offsetX, cursor.y + offset, cursor.width, cursor.height, true);

    const auto labels = mappedInput.mapLabels(tr(STR_BACK), tr(STR_SELECT), tr(STR_DIR_LEFT), tr(STR_DIR_RIGHT));
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
    renderer.displayBuffer(HalDisplay::FAST_REFRESH);

    lastRenderedSelected = selected;
    return true;
  }

  // Case 2: Transition from rangeStart < 0 to rangeStart >= 0 (user just confirmed rangeStart)
  if (rangeStart >= 0 && lastRenderedRangeStart < 0 && rangeStart == selected && selected == lastRenderedSelected) {
    const auto labels = mappedInput.mapLabels(tr(STR_BACK), mode == Mode::Lookup ? tr(STR_LOOKUP) : tr(STR_DONE),
                                              tr(STR_DIR_LEFT), tr(STR_DIR_RIGHT));
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
    renderer.displayBuffer(HalDisplay::FAST_REFRESH);

    lastRenderedRangeStart = rangeStart;
    return true;
  }

  // Case 3: Moving cursor to choose end word (rangeStart >= 0, expanding or shrinking selection)
  if (rangeStart >= 0 && lastRenderedRangeStart == rangeStart) {
    if (selected == lastRenderedSelected) return true;

    const int firstOld = std::min(rangeStart, lastRenderedSelected);
    const int lastOld = std::max(rangeStart, lastRenderedSelected);
    const int firstNew = std::min(rangeStart, selected);
    const int lastNew = std::max(rangeStart, selected);

    if (words[firstOld].pageOffset != currentPageOffset || words[lastOld].pageOffset != currentPageOffset ||
        words[firstNew].pageOffset != currentPageOffset || words[lastNew].pageOffset != currentPageOffset) {
      return false;
    }

    for (int i = firstOld; i <= lastOld; ++i) {
      if (i < firstNew || i > lastNew) {
        drawWordClean(i, offsetX, offset);
      }
    }

    for (int i = firstNew; i <= lastNew; ++i) {
      if (i < firstOld || i > lastOld) {
        drawWordHighlight(i, firstNew, lastNew, offsetX, offset);
      }
    }

    if (lastRenderedSelected >= firstNew && lastRenderedSelected <= lastNew) {
      drawWordHighlight(lastRenderedSelected, firstNew, lastNew, offsetX, offset);
    }

    const WordBox& cursor = words[selected];
    renderer.drawRect(cursor.x + offsetX, cursor.y + offset, cursor.width, cursor.height, true);

    const auto labels = mappedInput.mapLabels(tr(STR_BACK), mode == Mode::Lookup ? tr(STR_LOOKUP) : tr(STR_DONE),
                                              tr(STR_DIR_LEFT), tr(STR_DIR_RIGHT));
    GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
    renderer.displayBuffer(HalDisplay::FAST_REFRESH);

    lastRenderedSelected = selected;
    return true;
  }

  return false;
}

void ClipSelectionActivity::drawSelection() const {
  const int offset = textOffset();
  const int offsetX = textXOffset();
  const int first = rangeStart < 0 ? selected : std::min(rangeStart, selected);
  const int last = rangeStart < 0 ? selected : std::max(rangeStart, selected);
  const WordBox* previous = nullptr;
  for (int i = first; i <= last; ++i) {
    const WordBox& word = words[i];
    if (word.pageOffset != currentPageOffset) continue;
    if (previous) ditherGapBetween(*previous, word, offsetX, offset);
    renderer.fillRectDither(word.x + offsetX, word.y + offset, word.width, word.height, Color::LightGray);
    renderer.drawText(fontId, word.x + offsetX, word.y + offset, word.text, true, word.style,
                      BidiUtils::BidiBaseDir::AUTO);
    previous = &word;
  }
  // C61 port: touch-only selection handle/action strip rendering removed;
  // the cursor rect stands in for the drag UI on button-only devices.
  {
    const WordBox& cursor = words[selected];
    renderer.drawRect(cursor.x + offsetX, cursor.y + offset, cursor.width, cursor.height, true);
  }
}

void ClipSelectionActivity::render(RenderLock&&) {
  if (actionPopup.processRender(renderer, mappedInput)) {
    lastRenderedPageOffset = -1;
    return;
  }

  if (renderIncremental()) {
    return;
  }

  const int offset = textOffset();
  const int offsetX = textXOffset();
  renderer.clearScreen();
  const auto clip = renderer.getClipRect();
  const Rect safe = UITheme::getInstance().getScreenSafeArea(renderer, true, false);
  renderer.setClipRect(safe.x, safe.y, safe.width, safe.height);
  auto* fcm = renderer.getFontCacheManager();
  auto scope = fcm->createPrewarmScope();
  pages[currentPageOffset]->render(renderer, fontId, marginLeft + offsetX, marginTop + offset);
  scope.endScanAndPrewarm();
  pages[currentPageOffset]->render(renderer, fontId, marginLeft + offsetX, marginTop + offset);
  if (wordCount != 0) drawSelection();
  renderer.setClipRect(clip[0], clip[1], clip[2], clip[3]);

  const auto labels = mappedInput.mapLabels(
      tr(STR_BACK), rangeStart < 0 ? tr(STR_SELECT) : (mode == Mode::Lookup ? tr(STR_LOOKUP) : tr(STR_DONE)),
      tr(STR_DIR_LEFT), tr(STR_DIR_RIGHT));
  GUI.drawButtonHints(renderer, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
  renderer.displayBuffer();

  lastRenderedPageOffset = currentPageOffset;
  lastRenderedTextOffset = offset;
  lastRenderedTextXOffset = offsetX;
  lastRenderedRangeStart = rangeStart;
  lastRenderedSelected = selected;
}
