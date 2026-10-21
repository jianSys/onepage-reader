// Ported from CrossMux (https://github.com/0x1abin/crossmux), MIT License; modified by
// OnePage. See firmware/NOTICE. Only the dictionary endpoint is carried here — CrossMux
// also serves fonts/OTA manifests through this module.
//
// Deviation: CrossMux picks the host from SETTINGS.contentProfile (a China/Global content
// switch it ships and OnePage does not). The UI language is the closest signal we have, and
// it is already what the manifest is localised by, so host() derives from it instead.
#pragma once

#include <I18n.h>  // pulls in I18nKeys.h: Language, LANGUAGE_CODES

namespace CrossMuxEndpoints {

inline constexpr char GLOBAL_HOST[] = "crossmux.com";
inline constexpr char CHINA_HOST[] = "crossmux.cn";
inline constexpr char DICTIONARY_MANIFEST_FORMAT[] = "https://%s/api/assets/dictionaries/manifest?version=1&lang=%s";

// The manifest body carries the per-file `baseUrl`, so nothing below the manifest URL is
// pinned here: swapping the catalogue means changing these constants only.
inline const char* host() {
  const Language language = I18n::getInstance().getLanguage();
  const char* const code = LANGUAGE_CODES[static_cast<uint8_t>(language)];
  return code && code[0] == 'Z' && code[1] == 'H' ? CHINA_HOST : GLOBAL_HOST;
}

inline const char* languageCode() {
  // CrossMux localises its catalogue with its own codes: the server only answers
  // in Chinese for exactly "ZH_CN" (verified against crossmux.cn and crossmux.com;
  // "ZH", "zh_CN" and "ZH_HANS" all fall back to English) and everything else to
  // English. Our generated LANGUAGE_CODES are "EN"/"ZH_HANS"/"ZH_HANT", so map the
  // two Chinese variants instead of sending them straight through.
  switch (I18n::getInstance().getLanguage()) {
    case Language::ZH_HANS:
      return "ZH_CN";
    case Language::ZH_HANT:
      return "ZH_TW";
    case Language::EN:
    default:
      return "EN";
  }
}

}  // namespace CrossMuxEndpoints
