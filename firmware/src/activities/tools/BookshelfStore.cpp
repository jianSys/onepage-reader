#include "BookshelfStore.h"

#include <ArduinoJson.h>

#include <HalStorage.h>

namespace {
constexpr const char* kPath = "/bookshelf.json";
}  // namespace

BookshelfStore& BookshelfStore::getInstance() {
  static BookshelfStore s;
  if (!s.loaded_) {
    s.load();
    s.loaded_ = true;
  }
  return s;
}

bool BookshelfStore::isFavorite(const std::string& path) const {
  for (const auto& p : favorites_) {
    if (p == path) return true;
  }
  return false;
}

void BookshelfStore::toggle(const std::string& path) {
  for (auto it = favorites_.begin(); it != favorites_.end(); ++it) {
    if (*it == path) {
      favorites_.erase(it);
      save();
      return;
    }
  }
  favorites_.push_back(path);
  save();
}

void BookshelfStore::save() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (const auto& p : favorites_) arr.add(p);
  String json;
  serializeJson(doc, json);
  Storage.writeFile(kPath, json);
}

void BookshelfStore::load() {
  favorites_.clear();
  String content = Storage.readFile(kPath);
  if (content.length() == 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, content) != DeserializationError::Ok) return;
  const JsonArray arr = doc.as<JsonArray>();
  if (arr.isNull()) return;
  for (const JsonVariant& v : arr) {
    favorites_.push_back(v.as<std::string>());
  }
}
