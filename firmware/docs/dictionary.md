# Dictionaries (StarDict)

The reader can look up words while you read using [StarDict](https://stardict.sourceforge.net/)
dictionaries. There are two ways to get one onto the device: download it over Wi-Fi from the
CrossMux catalogue, or copy a dictionary folder onto the SD card by hand.

## Installing a Dictionary

### Option 1: Download from the device (recommended)

1. Go to **Settings → Reader → Manage Dictionaries**.
2. Connect to Wi-Fi when prompted. The device fetches the CrossMux catalogue and lists the
   available StarDict dictionaries (localised to your UI language).
3. Highlight a dictionary and press **Confirm**. It downloads with a progress bar, is verified
   against the catalogue's CRC32, installed atomically, and set as the active dictionary.

A cancelled or corrupt transfer never damages the dictionary you already have: files land in a
staging folder (`/.dictionaries/.install-<id>/`) and are only swapped into place once every file
passes its CRC32 check. The previously installed version is kept as a backup until the commit
succeeds, so the update is safe to interrupt at any point.

### Option 2: Manual SD card copy

If you already have a StarDict dictionary (e.g. exported from the desktop StarDict tools), copy
its folder into one of two roots on your SD card:

- `/.dictionaries/` — hidden directory (preferred; keeps the SD root tidy when mounted on a
  desktop, and it is the same root the on-device downloader writes to)
- `/dictionaries/` — visible directory (use this if your OS hides dot-files and you would rather
  see the folder in your file manager)

Both roots are scanned and merged, exactly like the font roots: a dictionary in either one shows
up in the picker. If the same folder name appears in both, `/.dictionaries/` wins.

    SD Card Root/
    ├── .dictionaries/              ← Hidden root (preferred)
    │   └── century-en-zh/
    │       ├── century-en-zh.idx
    │       ├── century-en-zh.ifo
    │       ├── century-en-zh.dict      (or century-en-zh.dict.dz)
    │       └── century-en-zh.syn       (optional synonym index)
    └── dictionaries/               ← Visible root (equally valid)
        └── ...

Each dictionary lives in its **own subfolder**, and that folder must contain exactly one index
stem (one `<stem>.idx`). Folders with no `.idx`, or with more than one distinct stem, are treated
as ambiguous and skipped. Insert the SD card and power on; the dictionary then appears in the
picker under **Settings → Reader**.

## Looking a Word Up

Once a dictionary is active (either from the download or picked manually), hold **Confirm** for
about half a second inside a book. The current word is highlighted; use the four buttons to move
the highlight onto the word you want, then press **Confirm** to open its definition. Page through
a long entry with the next/previous buttons and press **Back** to return to the text.

The long-press gesture is bound under **Settings → Controls → Long-press Menu**; choose
**Dictionary** (the default is *Disabled*, so long-press does nothing until you set it).

If no StarDict dictionary is selected, the lookup falls back to the built-in flat word list
(`data/.dict/dictionary.txt`) — a plain, line-oriented list useful for quick glossaries but
without full definitions.

## Format Constraints

The reader ships a slim StarDict reader. Its constraints:

- **`.idx` must be uncompressed.** The index is binary-searched with a lazily built sampled-offset
  sidecar (`<stem>.qidx`, the byte offset of every 256th `.idx` entry), then linear-scanned within
  at most one sample interval. A gzipped `.idx` is rejected.
- **`.dict` may be compressed.** Either `<stem>.dict` or `<stem>.dict.dz` (gzip) is accepted; the
  folder is only offered as selectable when one of them sits next to the `.idx`.
- **64-bit index offsets are not supported.** If the `.ifo` declares `idxoffsetbits=64`, the
  dictionary is rejected at open time. 32-bit offsets cover every dictionary in the catalogue.
- **Optional `.syn`.** A present `<stem>.syn` synonym index gets its own parallel `.sidx` sidecar
  and is consulted when an exact match misses, alongside light mini-stemming.
- **HTML definitions.** When the `.ifo` declares `sametypesequence=h`, definitions are laid out as
  styled pages; otherwise they render as wrapped plain text.

## Catalogue Endpoint (reference)

The on-device downloader talks to the CrossMux manifest service:

    https://<host>/api/assets/dictionaries/manifest?version=1&lang=<CODE>

- `<host>` is chosen from the UI language: a Chinese locale uses `crossmux.cn` (whose `baseUrl`
  points at Gitee mirrors), everything else uses `crossmux.com` (GitHub). The manifest body carries
  the per-file `baseUrl`, so nothing below the manifest URL is hardcoded — swapping the catalogue
  means changing the constants in `src/network/CrossMuxEndpoints.h`.
- `<CODE>` is mapped to the codes the server understands: `ZH_HANS → ZH_CN`, `ZH_HANT → ZH_TW`,
  otherwise `EN`. (The server only returns Chinese names for exactly `ZH_CN`.)

The installed marker file `.crossmux-resource` (written inside each installed folder) holds
`"1:<revision>"` — a fixed `1` marker-format version, then the catalogue revision the folder was
installed at. The picker reads it back to decide whether an installed dictionary is current or has
an update available in the catalogue.
