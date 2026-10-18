#pragma once

#include <string>
#include <vector>

// Persistent set of "favorited" book paths (the bookshelf / collection marker).
// Stored as a JSON array on the SD card so it is independent of the binary
// recent-books store and easy to extend with collections later.
class BookshelfStore {
 public:
  static BookshelfStore& getInstance();

  bool isFavorite(const std::string& path) const;
  void toggle(const std::string& path);
  const std::vector<std::string>& favorites() const { return favorites_; }

  void save();
  void load();

 private:
  std::vector<std::string> favorites_;
  bool loaded_ = false;
};

#define BOOKSHELF BookshelfStore::getInstance()
