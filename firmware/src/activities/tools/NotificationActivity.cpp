#include "NotificationActivity.h"

#include <NotificationStore.h>
#include <Utf8.h>

#include "I18n.h"  // tr() + STR_* keys
#include "MappedInputManager.h"
#include "activities/tools/ToolsUi.h"
#include "components/UITheme.h"  // defines the GUI macro (UITheme::getInstance().getTheme())
#include "fontIds.h"              // UI_12_FONT_ID, UI_10_FONT_ID

NotificationActivity* NotificationActivity::sForeground = nullptr;

NotificationActivity::NotificationActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
    : Activity("Notification", renderer, mappedInput) {}

void NotificationActivity::onEnter() {
  sForeground = this;
  selectorIndex_ = 0;
  view_ = View::List;
  detailUid_ = 0;
  requestUpdate();
}

void NotificationActivity::onExit() {
  if (sForeground == this) sForeground = nullptr;
}

void NotificationActivity::refreshForeground() {
  if (sForeground) sForeground->requestUpdate();
}

void NotificationActivity::loop() {
  using B = MappedInputManager::Button;
  if (mappedInput.wasReleased(B::Back)) {
    if (view_ == View::Detail) {
      view_ = View::List;
      requestUpdate();
    } else {
      finish();
    }
    return;
  }

  if (view_ == View::List) {
    const int n = NOTIFICATION_STORE.count();
    if (mappedInput.wasReleased(B::Up)) {
      if (selectorIndex_ > 0) {
        selectorIndex_--;
        requestUpdate();
      }
      return;
    }
    if (mappedInput.wasReleased(B::Down)) {
      if (selectorIndex_ < n - 1) {
        selectorIndex_++;
        requestUpdate();
      }
      return;
    }
    if (mappedInput.wasReleased(B::Confirm)) {
      if (n > 0) openDetail(selectorIndex_);
      return;
    }
  }

  // Left / Right are shared secondary actions in both views (see footer hints).
  if (mappedInput.wasReleased(B::Left)) {
    markAllRead();
    return;
  }
  if (mappedInput.wasReleased(B::Right)) {
    clearAll();
    return;
  }
}

void NotificationActivity::openDetail(int index) {
  if (index < 0 || index >= NOTIFICATION_STORE.count()) return;
  detailUid_ = NOTIFICATION_STORE.at(index).uid;
  NOTIFICATION_STORE.at(index).read = true;
  view_ = View::Detail;
  requestUpdate();
}

void NotificationActivity::markAllRead() {
  NOTIFICATION_STORE.markAllRead();
  requestUpdate();
}

void NotificationActivity::clearAll() {
  NOTIFICATION_STORE.clear();
  selectorIndex_ = 0;
  view_ = View::List;
  requestUpdate();
}

void NotificationActivity::render(RenderLock&& lock) {
  if (view_ == View::List)
    renderList();
  else
    renderDetail();
  displayUiBuffer();
}

void NotificationActivity::renderList() {
  GfxRenderer& r = renderer;
  r.clearScreen();
  const auto& metrics = UITheme::getInstance().getMetrics();
  const int pageW = r.getScreenWidth();
  const int pageH = r.getScreenHeight();

  GUI.drawHeader(r, Rect{0, metrics.topPadding, pageW, metrics.headerHeight}, tr(STR_NOTIFICATIONS));

  const int n = NOTIFICATION_STORE.count();
  if (n == 0) {
    GUI.drawEmptyState(r, Rect{0, metrics.topPadding + metrics.headerHeight, pageW,
                               pageH - metrics.topPadding - metrics.headerHeight - metrics.buttonHintsHeight},
                       UIIcon::None, tr(STR_NO_NOTIFICATIONS));
    const auto labels = mappedInput.mapLabels(tr(STR_BACK), "", "", "");
    GUI.drawButtonHints(r, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
    return;
  }

  const int contentTop = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  const int footerH = 18;
  const int contentBottom = pageH - (metrics.buttonHintsHeight + metrics.verticalSpacing + footerH);
  GUI.drawList(r, Rect{0, contentTop, pageW, contentBottom - contentTop}, n, selectorIndex_,
               [&](int i) {
                 const PhoneNotification& note = NOTIFICATION_STORE.at(i);
                 return std::string(note.title[0] ? note.title : note.app);
               },
               [&](int i) {
                 const PhoneNotification& note = NOTIFICATION_STORE.at(i);
                 return std::string(note.app) + std::string("   ") + std::string(note.date);
               },
               [](int) { return UIIcon::None; }, [](int) { return std::string(); }, false,
               [&](int i) { return NOTIFICATION_STORE.at(i).read; });

  // Secondary actions (Left / Right) explained in a footer above the button hints.
  const int fy = contentBottom + 4;
  r.drawText(UI_10_FONT_ID, metrics.contentSidePadding, fy, (std::string("◀ ") + tr(STR_MARK_READ)).c_str(), true);
  const std::string cr = tr(STR_CLEAR_ALL) + std::string(" ▶");
  r.drawText(UI_10_FONT_ID, pageW - metrics.contentSidePadding - r.getTextWidth(UI_10_FONT_ID, cr.c_str()), fy,
             cr.c_str(), true);

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), tr(STR_OPEN), tr(STR_DIR_UP), tr(STR_DIR_DOWN));
  GUI.drawButtonHints(r, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
}

void NotificationActivity::renderDetail() {
  GfxRenderer& r = renderer;
  r.clearScreen();
  const auto& metrics = UITheme::getInstance().getMetrics();
  const int pageW = r.getScreenWidth();
  const int pageH = r.getScreenHeight();
  const int left = metrics.contentSidePadding;
  const int right = pageW - metrics.contentSidePadding;
  const int maxW = right - left;

  const int idx = NOTIFICATION_STORE.findUid(detailUid_);
  if (idx < 0) {  // cleared or gone while we were open
    view_ = View::List;
    renderList();
    return;
  }
  const PhoneNotification& note = NOTIFICATION_STORE.at(idx);

  GUI.drawHeader(r, Rect{0, metrics.topPadding, pageW, metrics.headerHeight}, tr(STR_NOTIFICATIONS));

  int y = metrics.topPadding + metrics.headerHeight + metrics.verticalSpacing;
  std::string app = note.app[0] ? std::string(note.app) : std::string("-");
  r.drawText(UI_12_FONT_ID, left, y, app.c_str(), true);
  if (note.date[0]) {
    const std::string date(note.date);
    r.drawText(UI_12_FONT_ID, right - r.getTextWidth(UI_12_FONT_ID, date.c_str()), y, date.c_str(), true);
  }

  y += 22;
  if (note.title[0]) {
    y = ToolsUi::drawWrappedText(r, UI_12_FONT_ID, std::string(note.title), left, y, maxW,
                                 pageH - metrics.buttonHintsHeight - 70, 20) +
        8;
  }
  ToolsUi::drawWrappedText(r, UI_12_FONT_ID, std::string(note.body), left, y, maxW,
                           pageH - metrics.buttonHintsHeight - 4, 18);

  // Back returns to the list; Left/Right act on the whole store (footer hint).
  const int fy = pageH - metrics.buttonHintsHeight - 16;
  r.drawText(UI_10_FONT_ID, left, fy, (std::string("◀ ") + tr(STR_MARK_READ)).c_str(), true);
  const std::string cr = tr(STR_CLEAR_ALL) + std::string(" ▶");
  r.drawText(UI_10_FONT_ID, right - r.getTextWidth(UI_10_FONT_ID, cr.c_str()), fy, cr.c_str(), true);

  const auto labels = mappedInput.mapLabels(tr(STR_BACK), tr(STR_MARK_READ), "", "");
  GUI.drawButtonHints(r, labels.btn1, labels.btn2, labels.btn3, labels.btn4);
}
