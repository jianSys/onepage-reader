#include <gtest/gtest.h>

#include <string>

#include "TxtPathHash.h"

// Golden vectors are the output of murmur2_32() in
// src/network/html/TxtIndexPage.html over the UTF-8 bytes of each path. They
// lock the firmware's explicit cache-directory hash to the value the web
// TXT-index generator computes, so device and browser always agree on where
// index.bin lives. If these ever fail, a browser-built index would be written
// to a directory the reader never reads (silent "re-index every time").
TEST(TxtPathHash, MatchesWebMurmur2GoldenVectors) {
  EXPECT_EQ(txthash::murmur2_32(""), 0u);
  EXPECT_EQ(txthash::murmur2_32("hello"), 3848350155u);
  EXPECT_EQ(txthash::murmur2_32("/"), 2810847099u);
  EXPECT_EQ(txthash::murmur2_32("/a.txt"), 2436461015u);
  EXPECT_EQ(txthash::murmur2_32("/foo.txt"), 1189117716u);
  EXPECT_EQ(txthash::murmur2_32("/books/foo.txt"), 962686828u);
  // Multibyte UTF-8 must hash over bytes, not code units.
  EXPECT_EQ(txthash::murmur2_32("/\xE4\xB8\x89.txt"), 3261551721u);  // /三.txt
  EXPECT_EQ(txthash::murmur2_32("/books/\xE4\xB8\x89\xE5\x9B\xBD\xE6\xBC\x94\xE4\xB9\x89.txt"),
            1610263518u);  // /books/三国演义.txt
}

TEST(TxtPathHash, IsStableAndDeterministic) {
  EXPECT_EQ(txthash::murmur2_32("/foo.txt"), txthash::murmur2_32(std::string("/foo.txt")));
  // Different paths must not collide on these samples.
  EXPECT_NE(txthash::murmur2_32("/a.txt"), txthash::murmur2_32("/b.txt"));
}
