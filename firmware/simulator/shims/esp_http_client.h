#pragma once
// esp_http_client shim for the simulator, dual-backend:
//   - native: libcurl-backed. fetch_headers() streams the body into a FIFO that
//     read() drains, mirroring the device client's open/fetch_headers/read loop
//     so HttpDownloader (downloadToFile + postJson) sees incremental progress,
//     short reads and mid-transfer aborts while driving the live network.
//   - WASM:   emscripten_fetch backend. The firmware task that calls here runs
//     on a Web Worker thread (FreeRTOS-on-pthread), where a SYNCHRONOUS fetch
//     buffers the whole body into the same FIFO that read() drains. Any failure
//     (offline, DNS, CORS) degrades to the previous stub's behavior - status 0,
//     fetch_headers returns -1 - so call sites bail out exactly as before.
//
// The public surface mirrors only what HttpDownloader.cpp actually calls.

// HttpDownloader uses this to reach shim-only members. The only such member it
// touches — cancelFlag — exists solely in the native libcurl shim, so keep the
// macro undefined for the Emscripten build too, where esp_http_client_t has no
// such field. Mirrors the #ifndef __EMSCRIPTEN__ guard on the member itself.
#ifndef CROSSPOINT_SIM_HTTP_SHIM
#ifndef __EMSCRIPTEN__
#define CROSSPOINT_SIM_HTTP_SHIM 1
#endif
#endif

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "esp_err.h"

#ifndef __EMSCRIPTEN__
#include <curl/curl.h>
#else
#include <emscripten/fetch.h>
#include <emscripten/threading.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  HTTP_METHOD_GET = 0,
  HTTP_METHOD_POST,
  HTTP_METHOD_PUT,
  HTTP_METHOD_DELETE,
  HTTP_METHOD_HEAD,
} esp_http_client_method_t;

typedef int (*esp_crt_bundle_attach_fn_t)(void* conf);

typedef struct esp_http_client_config_t {
  const char* url;
  int buffer_size;
  int buffer_size_tx;
  int timeout_ms;
  esp_crt_bundle_attach_fn_t crt_bundle_attach;
  bool keep_alive_enable;
  esp_http_client_method_t method;
} esp_http_client_config_t;

struct esp_http_client_t {
  std::string url;
  esp_http_client_method_t method = HTTP_METHOD_GET;
  int timeout_ms = 0;
  bool follow_redirects = true;  // libcurl owns redirects in native, the browser in WASM; neither surfaces a 30x.

  // Outgoing headers, accumulated through esp_http_client_set_header(). Native
  // serializes them into a curl_slist at perform time; WASM passes them to
  // emscripten_fetch, skipping User-Agent (a forbidden header in browsers).
  std::vector<std::pair<std::string, std::string>> headers;

  // Outgoing body for POST/PUT (filled by esp_http_client_write).
  std::vector<char> req_body;

  // Response state, populated by fetch_headers.
  int status = 0;
  long content_length = -1;
  bool performed = false;
  bool complete = false;
  // Set by downloadToFile(): polled from curl's progress callback so a cancel
  // lands mid-transfer instead of only at the next read() boundary. Shim-only,
  // guarded like the curl handle below; ESP-IDF's client is opaque.
#ifndef __EMSCRIPTEN__
  const bool* cancelFlag = nullptr;
#endif

  // Body FIFO: curl's write callback (native) or fetch_headers' buffering
  // (WASM) appends during the transfer, read() pops the front. Kept separate
  // from the request body because a redirect-driven
  // open()/fetch_headers() pair re-enters perform() with a partially drained body.
  std::vector<char> stream_body;
  bool stream_aborted = false;  // read() returned 0 while data remained: caller gave up

#ifndef __EMSCRIPTEN__
  CURL* curl = nullptr;
#endif
};

typedef struct esp_http_client_t* esp_http_client_handle_t;

inline esp_http_client_handle_t esp_http_client_init(const esp_http_client_config_t* config) {
  if (!config || !config->url) return nullptr;
  auto* h = new esp_http_client_t();
  h->url = config->url;
  h->method = config->method;
  h->timeout_ms = config->timeout_ms;
#ifndef __EMSCRIPTEN__
  h->curl = curl_easy_init();
  if (!h->curl) {
    delete h;
    return nullptr;
  }
#endif
  return h;
}

inline esp_err_t esp_http_client_cleanup(esp_http_client_handle_t client) {
  if (!client) return ESP_FAIL;
#ifndef __EMSCRIPTEN__
  if (client->curl) curl_easy_cleanup(client->curl);
#endif
  delete client;
  return ESP_OK;
}

inline esp_err_t esp_http_client_set_method(esp_http_client_handle_t client, esp_http_client_method_t method) {
  if (!client) return ESP_FAIL;
  client->method = method;
  return ESP_OK;
}

inline esp_err_t esp_http_client_set_header(esp_http_client_handle_t client, const char* name, const char* value) {
  if (!client || !name) return ESP_FAIL;
  client->headers.emplace_back(name, value ? value : "");
  return ESP_OK;
}

#ifndef __EMSCRIPTEN__
namespace esp_http_client_shim_detail {
// curl's progress callback: cancelFlag is the HttpDownloader abort flag (see
// runGet's read loop), so a Back press stops the transfer the same way it does
// on device. Off-curve means "don't poll"; only the download path passes a flag.
inline int abortCb(void* userdata, curl_off_t, curl_off_t, curl_off_t, curl_off_t) {
  auto* h = static_cast<esp_http_client_t*>(userdata);
  return h->cancelFlag && *h->cancelFlag ? 1 : 0;
}
inline size_t writeCb(char* ptr, size_t size, size_t nmemb, void* userdata) {
  auto* h = static_cast<esp_http_client_t*>(userdata);
  const size_t n = size * nmemb;
  if (h->stream_aborted) return 0;  // abort the transfer: read() no longer wants data
  h->stream_body.insert(h->stream_body.end(), ptr, ptr + n);
  return n;
}
}  // namespace esp_http_client_shim_detail
#endif

// open() pairs with fetch_headers/read in the device API. The shim defers the
// actual transfer to fetch_headers, since libcurl performs the whole exchange
// in one call. open() just records the (uncertain) POST body length so that
// repeated open() after set_redirection() works as a reset.
inline esp_err_t esp_http_client_open(esp_http_client_handle_t client, int /*write_len*/) {
  if (!client) return ESP_FAIL;
  client->stream_body.clear();
  client->stream_aborted = false;
  client->performed = false;
  client->complete = false;
  client->status = 0;
  client->content_length = -1;
  return ESP_OK;
}

inline int esp_http_client_write(esp_http_client_handle_t client, const char* data, int len) {
  if (!client || !data || len < 0) return -1;
  client->req_body.insert(client->req_body.end(), data, data + len);
  return len;
}

// Drives the transfer synchronously, streaming the body into the FIFO. Native
// returns the response's Content-Length when known (libcurl exposes it via
// CURLINFO_CONTENT_LENGTH_DOWNLOAD_T), or the buffered body size on chunked
// responses. WASM buffers the whole body up front (LOAD_TO_MEMORY) and reports
// the same shape; any browser-level failure degrades to the offline-stub
// contract (status 0, return -1) so HttpDownloader maps it to HTTP_ERROR.
inline int64_t esp_http_client_fetch_headers(esp_http_client_handle_t client) {
  if (!client) return -1;
#ifdef __EMSCRIPTEN__
  // Synchronous emscripten_fetch aborts if run on the main browser thread;
  // firmware tasks are Web Workers, so that should never happen, but a
  // mis-scheduled call must not crash the page - report offline instead.
  if (emscripten_is_main_runtime_thread()) {
    client->performed = true;
    client->complete = false;
    client->status = 0;
    return -1;
  }

  emscripten_fetch_attr_t attr;
  emscripten_fetch_attr_init(&attr);
  const char* methodName = "GET";
  switch (client->method) {
    case HTTP_METHOD_POST: methodName = "POST"; break;
    case HTTP_METHOD_PUT: methodName = "PUT"; break;
    case HTTP_METHOD_DELETE: methodName = "DELETE"; break;
    case HTTP_METHOD_HEAD: methodName = "HEAD"; break;
    case HTTP_METHOD_GET:
    default: break;
  }
  snprintf(attr.requestMethod, sizeof(attr.requestMethod), "%s", methodName);
  attr.attributes = EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | EMSCRIPTEN_FETCH_SYNCHRONOUS;
  if (!client->req_body.empty()) {
    attr.requestData = client->req_body.data();
    attr.requestDataSize = client->req_body.size();
  }
  // Keep the serialized lines alive for the duration of the blocking fetch.
  std::vector<std::string> headerLines;
  headerLines.reserve(client->headers.size());
  for (const auto& kv : client->headers) {
    if (kv.first == "User-Agent") continue;  // forbidden header: XHR would drop it anyway
    headerLines.emplace_back(kv.first + ": " + kv.second);
  }
  std::vector<const char*> rawHeaders;
  rawHeaders.reserve(headerLines.size() + 1);
  for (const auto& line : headerLines) rawHeaders.push_back(line.c_str());
  if (!rawHeaders.empty()) {
    rawHeaders.push_back(nullptr);  // emscripten_fetch expects a NULL-terminated array
    attr.requestHeaders = rawHeaders.data();
  }
  // timeout_ms is a per-socket-op budget on the device (60 s); as a
  // whole-transfer cap it would cut off large dictionary downloads. The browser
  // bounds dead connections itself and surfaces that as a fetch failure here.

  emscripten_fetch_t* fetch = emscripten_fetch(&attr, client->url.c_str());
  client->performed = true;
  if (!fetch) {
    client->complete = false;
    client->status = 0;
    return -1;
  }
  client->status = fetch->status;  // 0 on DNS/CORS/transport failure
  if (client->status == 0) {
    emscripten_fetch_close(fetch);
    client->complete = false;
    return -1;
  }
  client->content_length = fetch->totalBytes > 0 ? static_cast<long>(fetch->totalBytes) : -1;
  client->stream_body.assign(fetch->data, fetch->data + fetch->numBytes);
  emscripten_fetch_close(fetch);
  client->complete = true;  // LOAD_TO_MEMORY means the body arrived in full
  return client->content_length > 0 ? client->content_length : static_cast<int64_t>(client->stream_body.size());
#else
  if (!client->curl) return -1;
  curl_easy_reset(client->curl);
  curl_easy_setopt(client->curl, CURLOPT_URL, client->url.c_str());
  if (client->timeout_ms > 0) {
    // timeout_ms is a per-socket-operation timeout on the device client, so a
    // large file may take as long as it keeps moving. CURLOPT_TIMEOUT_MS would
    // instead cut off any transfer slower than that budget (a 24 MB dictionary
    // on a home connection), so the shim only reproduces the stall case.
    // curl's stall options are whole-second only (no *_MS variant in the macOS
    // SDK headers), hence the rounding.
    curl_easy_setopt(client->curl, CURLOPT_LOW_SPEED_LIMIT, 1L);
    const long stall_seconds = (client->timeout_ms + 999) / 1000;
    curl_easy_setopt(client->curl, CURLOPT_LOW_SPEED_TIME, stall_seconds > 0 ? stall_seconds : 1L);
  }
  curl_easy_setopt(client->curl, CURLOPT_FOLLOWLOCATION, client->follow_redirects ? 1L : 0L);
  // Same trust posture as the HTTPClient shim: skip TLS verification so dev
  // machines can hit self-signed staging endpoints. The on-device build uses
  // the CA bundle; this divergence is documented in HTTPClient.h.
  curl_easy_setopt(client->curl, CURLOPT_SSL_VERIFYPEER, 0L);
  curl_easy_setopt(client->curl, CURLOPT_SSL_VERIFYHOST, 0L);
  curl_easy_setopt(client->curl, CURLOPT_WRITEFUNCTION, &esp_http_client_shim_detail::writeCb);
  curl_easy_setopt(client->curl, CURLOPT_WRITEDATA, client);
  if (client->cancelFlag) {
    curl_easy_setopt(client->curl, CURLOPT_XFERINFOFUNCTION, &esp_http_client_shim_detail::abortCb);
    curl_easy_setopt(client->curl, CURLOPT_XFERINFODATA, client);
    curl_easy_setopt(client->curl, CURLOPT_NOPROGRESS, 0L);
  }

  curl_slist* hdrs = nullptr;
  for (const auto& kv : client->headers) {
    std::string line = kv.first + ": " + kv.second;
    hdrs = curl_slist_append(hdrs, line.c_str());
  }
  if (hdrs) curl_easy_setopt(client->curl, CURLOPT_HTTPHEADER, hdrs);

  switch (client->method) {
    case HTTP_METHOD_POST:
      curl_easy_setopt(client->curl, CURLOPT_POST, 1L);
      curl_easy_setopt(client->curl, CURLOPT_POSTFIELDS, client->req_body.data());
      curl_easy_setopt(client->curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(client->req_body.size()));
      break;
    case HTTP_METHOD_PUT:
      curl_easy_setopt(client->curl, CURLOPT_CUSTOMREQUEST, "PUT");
      curl_easy_setopt(client->curl, CURLOPT_POSTFIELDS, client->req_body.data());
      curl_easy_setopt(client->curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(client->req_body.size()));
      break;
    case HTTP_METHOD_DELETE:
      curl_easy_setopt(client->curl, CURLOPT_CUSTOMREQUEST, "DELETE");
      break;
    case HTTP_METHOD_HEAD:
      curl_easy_setopt(client->curl, CURLOPT_NOBODY, 1L);
      break;
    case HTTP_METHOD_GET:
    default:
      curl_easy_setopt(client->curl, CURLOPT_HTTPGET, 1L);
      break;
  }

  const CURLcode rc = curl_easy_perform(client->curl);
  if (hdrs) curl_slist_free_all(hdrs);
  client->performed = true;
  if (rc != CURLE_OK && rc != CURLE_ABORTED_BY_CALLBACK) {
    client->complete = false;
    client->status = 0;
    return -1;
  }

  long code = 0;
  curl_easy_getinfo(client->curl, CURLINFO_RESPONSE_CODE, &code);
  client->status = static_cast<int>(code);
  client->complete = (rc == CURLE_OK);
  // CURLE_ABORTED_BY_CALLBACK with a response code means the caller stopped
  // reading a body that was still arriving: complete stays false so
  // is_complete_data_received() reports the truncation, exactly as the device
  // client does when the read loop is abandoned.
  curl_off_t cl = -1;
  curl_easy_getinfo(client->curl, CURLINFO_CONTENT_LENGTH_DOWNLOAD_T, &cl);
  client->content_length = (cl > 0) ? static_cast<long>(cl) : -1;
  client->complete = (rc == CURLE_OK);
  return client->content_length > 0 ? client->content_length : static_cast<int64_t>(client->stream_body.size());
#endif
}

inline int esp_http_client_get_status_code(esp_http_client_handle_t client) {
  if (!client) return 0;
  return client->status;
}

// Pops the FIFO (identical in both builds now that WASM fills it). Returns 0
// at end of body, -1 on a transport error (the transfer failed before a body
// existed) or when the caller stopped reading a body that still had data left
// - HttpDownloader maps both to HTTP_ERROR.
inline int esp_http_client_read(esp_http_client_handle_t client, char* buffer, int len) {
  if (!client || !buffer || len <= 0) return -1;
  if (client->stream_body.empty()) {
    if (client->performed && !client->complete) return -1;
    return 0;  // EOF
  }
  if (!client->complete) client->stream_aborted = true;
  const size_t chunk = std::min(static_cast<size_t>(len), client->stream_body.size());
  std::memcpy(buffer, client->stream_body.data(), chunk);
  // Front pop: cheap enough at simulator scale (READ_CHUNK-sized pulls), and it
  // keeps the FIFO's head where the transfer appends, so no wrap-around bookkeeping.
  client->stream_body.erase(client->stream_body.begin(), client->stream_body.begin() + chunk);
  return static_cast<int>(chunk);
}

inline bool esp_http_client_is_complete_data_received(esp_http_client_handle_t client) {
  if (!client) return false;
  return client->complete;
}

// libcurl already followed redirects internally during fetch_headers, so any
// 30x the caller might still see is "redirects exhausted" — reject the
// re-open attempt to short-circuit the device-side loop.
inline esp_err_t esp_http_client_set_redirection(esp_http_client_handle_t /*client*/) { return ESP_FAIL; }

#ifdef __cplusplus
}
#endif
