#pragma once
#include <Epub.h>
#include <Epub/FootnoteEntry.h>
#include <Epub/Section.h>

#include <optional>

#include "BookmarkEntry.h"
#include "ClipSelectionActivity.h"
#include "EpubReaderMenuActivity.h"
#include "ProgressMapper.h"
#include "activities/Activity.h"

class EpubReaderActivity final : public Activity {
  std::shared_ptr<Epub> epub;
  std::unique_ptr<Section> section = nullptr;
  // Consecutive page-load failures. The recovery path clears the section cache and
  // rebuilds (re-paginates the whole chapter) on the next render; if loading keeps
  // failing this bounds the retries so a corrupt EPUB / bad SD can't spin forever.
  // Reset to 0 whenever a page loads successfully.
  int pageLoadFailures = 0;
  int currentSpineIndex = 0;
  int nextPageNumber = 0;
  std::optional<uint16_t> pendingPageJump;
  // Set when navigating to a footnote href with a fragment (e.g. #note1).
  // Cleared on the next render after the new section loads and resolves it to a page.
  std::string pendingAnchor;
  int pagesUntilFullRefresh = 0;
  int cachedSpineIndex = 0;
  int cachedChapterTotalPageCount = 0;
  unsigned long lastPageTurnTime = 0UL;
  unsigned long pageTurnDuration = 0UL;
  // Signals that the next render should reposition within the newly loaded section
  // based on a cross-book percentage jump.
  bool pendingPercentJump = false;
  // Normalized 0.0-1.0 progress within the target spine item, computed from book percentage.
  float pendingSpineProgress = 0.0f;
  bool pendingScreenshot = false;
  bool pendingSyncSaveError = false;
  bool skipNextButtonCheck = false;  // Skip button processing for one frame after subactivity exit
  bool automaticPageTurnActive = false;
  bool showBookmarkMessage = false;
  bool ignoreNextConfirmRelease = false;
  bool currentPageBookmarked = false;
  bool bookmarkRemoved = false;  // true when last toggle removed (controls popup text)
  std::vector<BookmarkEntry> cachedBookmarks;
  // Tracks whether this book is currently removed from Recent Books by the
  // removeReadBooksFromRecents feature (set at End-of-Book, cleared if paged back in).
  bool recentsEntryRemoved = false;
  unsigned long bookmarkMessageTime = 0UL;
  // Ephemeral toast after a clip is saved/removed or fails to persist; mirrors
  // the bookmark message pattern from the same release-decay loop.
  bool showClippingMessage = false;
  StrId clippingMessage = StrId::STR_CLIPPING_SAVED;
  unsigned long clippingMessageTime = 0UL;
  // Set when the reader is left at end-of-book and SETTINGS.moveFinishedToReadFolder is on.
  // Consumed in onExit() to relocate the finished book into /Read/.
  bool pendingReadFolderMove = false;

  // --- In-reader word selection (long-press "Dictionary" -> pick a word -> look it up) ---
  struct WordHit {
    int x = 0;  // page-relative top-left (before margin offset)
    int y = 0;
    int w = 0;
    int h = 0;
    std::string text;
  };
  bool wordSelectMode_ = false;
  std::vector<std::vector<WordHit>> selectLines_;  // [line][word], page-relative coords
  int selLine_ = 0;
  int selWord_ = 0;

  // Footnote support
  std::vector<FootnoteEntry> currentPageFootnotes;
  struct SavedPosition {
    int spineIndex;
    int pageNumber;
  };
  static constexpr int MAX_FOOTNOTE_DEPTH = 3;
  SavedPosition savedPositions[MAX_FOOTNOTE_DEPTH] = {};
  int footnoteDepth = 0;

  void renderContents(std::unique_ptr<Page> page, int orientedMarginTop, int orientedMarginRight,
                      int orientedMarginBottom, int orientedMarginLeft, const WordHit* highlight = nullptr);
  void drawRuledLines(const Page& page, int fontId, int orientedMarginTop, int orientedMarginLeft,
                      int orientedMarginRight) const;
  void renderStatusBar() const;
  void silentIndexNextChapterIfNeeded(uint16_t viewportWidth, uint16_t viewportHeight);
  bool saveProgress(int spineIndex, int currentPage, int pageCount);
  // Jump to a percentage of the book (0-100), mapping it to spine and page.
  void jumpToPercent(int percent);
  void onReaderMenuConfirm(EpubReaderMenuActivity::MenuAction action);
  // Returns true if sync acted (launched, or surfaced a save error); false if it was a no-op
  // because no KOReader credentials are stored.
  bool launchKOReaderSync();
  void applyOrientation(uint8_t orientation);
  void toggleAutoPageTurn(uint8_t selectedPageTurnOption);
  void pageTurn(bool isForwardTurn);
  void loadCachedBookmarks();
  void addBookmark();
  void updateBookmarkFlag();

  // Word-selection mode (long-press "Dictionary"): let the user move a cursor over
  // the current page's laid-out words and send the chosen word to the Dictionary.
  void enterWordSelect();
  void exitWordSelect();
  void moveWordSelection(int dLine, int dWord);
  void launchDictionaryWithWord(const std::string& word);

  // Footnote navigation
  void navigateToHref(const std::string& href, bool savePosition = false);
  void restoreSavedPosition();

  // Clipping flow (CrossMux parity): the reader hands off to a standalone
  // word-selection activity anchored on the current page and persists the
  // result via ClippingStore + ClippingsManager. openClippingList launches
  // the plain-Activity browser for the current book's saved items.
  void startClipSelection(ClipSelectionActivity::Mode mode = ClipSelectionActivity::Mode::Clip);
  void openClippingList();

 public:
  explicit EpubReaderActivity(GfxRenderer& renderer, MappedInputManager& mappedInput, std::unique_ptr<Epub> epub)
      : Activity("EpubReader", renderer, mappedInput), epub(std::move(epub)) {}
  void onEnter() override;
  void onExit() override;
  void loop() override;
  void render(RenderLock&& lock) override;
  bool isReaderActivity() const override { return true; }
  ScreenshotInfo getScreenshotInfo() const override;
  CrossPointPosition getCurrentPosition() const;
};
