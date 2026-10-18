#!/usr/bin/env python3
"""
Build a sorted offline Chinese dictionary for the Onepage reader.

Source: github.com/pwxcoo/chinese-xinhua (中华新华字典数据库), MIT-ish / crawled
open data. It ships four JSON datasets:

  word.json     汉字    ~16k   word/oldword/strokes/pinyin/radicals/explanation
  ci.json       词语   ~264k   ci/explanation
  idiom.json    成语    ~31k   word/pinyin/explanation/derivation/example
  xiehouyu.json 歇后语  ~14k   riddle/answer/explanation

Output format (one entry per line, UTF-8):

  词<TAB>释义

The file is SORTED by the head word in Unicode code-point order (== UTF-8 byte
order), so the firmware's DictionaryActivity can binary-search it in O(log n)
even when the file is tens of MB.

Usage:
  python3 scripts/build_chinese_dict.py
  python3 scripts/build_chinese_dict.py --out mydict.txt --no-ci
  python3 scripts/build_chinese_dict.py --data-dir ./chinese-xinhua/data

The generated file must be copied to the device's SD card as
/.dict/dictionary.txt (pio run -t uploadfs does NOT write the SD card).
"""

import argparse
import json
import os
import sys
import unicodedata
import urllib.request

# Mirror list (tried in order). raw.githubusercontent.com is sometimes blocked;
# gitcode.com mirrors the same repo and is used as the primary fallback.
RAW_BASES = (
    "https://gitcode.com/gh_mirrors/ch/chinese-xinhua/raw/master/data/",
    "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/",
)
DATASETS = ("word", "ci", "idiom", "xiehouyu")

# Processing order controls which definition wins when two datasets share the
# exact same head word. Multi-character phrases (idiom/ci) beat single-character
# 汉字 entries, so selecting "苹果" resolves to the word, not the char "苹".
PROCESS_ORDER = ("idiom", "ci", "word", "xiehouyu")


def sanitize(text):
    """Strip CR/LF/TAB and surrounding whitespace from a field."""
    if text is None:
        return ""
    return " ".join(str(text).replace("\r", " ").replace("\n", " ").replace("\t", " ").split())


def load_dataset(name, data_dir, quiet=False):
    """Return the parsed JSON list for `name`, downloading if needed."""
    fname = name + ".json"
    if data_dir:
        path = os.path.join(data_dir, fname)
        if not os.path.exists(path):
            if not quiet:
                print(f"  ! {fname} not found in {data_dir}, skipping", file=sys.stderr)
            return None
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    last_err = None
    for base in RAW_BASES:
        url = base + fname
        try:
            if not quiet:
                print(f"  downloading {url}", file=sys.stderr)
            req = urllib.request.Request(url, headers={"User-Agent": "onepage-dict-builder"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - try next mirror
            last_err = e
            if not quiet:
                print(f"    ! {url} failed: {e}", file=sys.stderr)
    if last_err:
        print(f"  ! all mirrors failed for {fname}: {last_err}", file=sys.stderr)
    return None


def compose(name, entry):
    """Build (headword, definition) from a dataset entry, or None to skip."""
    if name == "word":
        head = unicodedata.normalize("NFC", sanitize(entry.get("word") or entry.get("oldword")))
        # A 字典 only indexes single Han characters — drop noisy headwords such
        # as "岱d" that occasionally appear in the source data.
        if not (len(head) == 1 and "CJK" in unicodedata.name(head, "")):
            return None
        pinyin = sanitize(entry.get("pinyin"))
        radicals = sanitize(entry.get("radicals"))
        strokes = sanitize(entry.get("strokes"))
        expl = sanitize(entry.get("explanation"))
        if not head or not expl:
            return None
        parts = []
        if pinyin:
            parts.append(f"拼音：{pinyin}")
        if radicals:
            parts.append(f"部首：{radicals}")
        if strokes:
            parts.append(f"笔画：{strokes}")
        parts.append(expl)
        # NOTE: no newlines inside the definition — the firmware reads the
        # dictionary line-by-line, so a '\n' here would split one entry in two.
        return head, "｜".join(parts)

    if name == "ci":
        head = unicodedata.normalize("NFC", sanitize(entry.get("ci")))
        expl = sanitize(entry.get("explanation"))
        if not head or not expl:
            return None
        return head, expl

    if name == "idiom":
        head = unicodedata.normalize("NFC", sanitize(entry.get("word")))
        pinyin = sanitize(entry.get("pinyin"))
        expl = sanitize(entry.get("explanation"))
        derivation = sanitize(entry.get("derivation"))
        example = sanitize(entry.get("example"))
        if not head or not expl:
            return None
        parts = []
        if pinyin:
            parts.append(f"拼音：{pinyin}")
        parts.append(expl)
        if derivation:
            parts.append(f"出处：{derivation}")
        if example:
            parts.append(f"例：{example}")
        return head, "｜".join(parts)

    if name == "xiehouyu":
        head = unicodedata.normalize("NFC", sanitize(entry.get("riddle")))
        answer = sanitize(entry.get("answer"))
        expl = sanitize(entry.get("explanation"))
        if not head:
            return None
        body = answer or expl
        if not body:
            return None
        return head, body

    return None


def main():
    ap = argparse.ArgumentParser(description="Build a sorted Chinese dictionary for Onepage reader.")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", ".dict", "dictionary.txt"))
    ap.add_argument("--data-dir", default=None,
                    help="Use local JSON files from this directory instead of downloading.")
    ap.add_argument("--with-word", dest="word", action="store_true", default=True)
    ap.add_argument("--no-word", dest="word", action="store_false")
    ap.add_argument("--with-ci", dest="ci", action="store_true", default=True)
    ap.add_argument("--no-ci", dest="ci", action="store_false")
    ap.add_argument("--with-idiom", dest="idiom", action="store_true", default=True)
    ap.add_argument("--no-idiom", dest="idiom", action="store_false")
    ap.add_argument("--with-xiehouyu", dest="xiehouyu", action="store_true", default=False)
    ap.add_argument("--no-xiehouyu", dest="xiehouyu", action="store_false")
    ap.add_argument("--max-expl", type=int, default=0,
                    help="Truncate each definition to N chars (e.g. 256) for small e-ink screens. 0 = no limit.")
    args = ap.parse_args()

    wanted = {
        "word": args.word,
        "ci": args.ci,
        "idiom": args.idiom,
        "xiehouyu": args.xiehouyu,
    }

    # head -> definition; first wins per PROCESS_ORDER.
    entries = {}
    for name in PROCESS_ORDER:
        if not wanted.get(name):
            continue
        data = load_dataset(name, args.data_dir)
        if not data:
            continue
        print(f"[+] {name}.json: {len(data)} records", file=sys.stderr)
        added = 0
        for rec in data:
            pair = compose(name, rec)
            if not pair:
                continue
            head, definition = pair
            if args.max_expl and len(definition) > args.max_expl:
                definition = definition[: args.max_expl] + "…"
            if head not in entries:
                entries[head] = definition
                added += 1
        print(f"    -> {added} unique headwords added", file=sys.stderr)

    if not entries:
        print("Nothing to write (no datasets selected or all failed).", file=sys.stderr)
        return 1

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Sort by Unicode code point; UTF-8 byte order == code-point order, which is
    # exactly what the firmware's binary search compares against.
    heads = sorted(entries.keys())
    with open(out_path, "w", encoding="utf-8") as fh:
        for h in heads:
            fh.write(h)
            fh.write("\t")
            fh.write(entries[h])
            fh.write("\n")

    size = os.path.getsize(out_path)
    print(f"[done] {len(heads)} entries -> {out_path} ({size/1024/1024:.1f} MB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
