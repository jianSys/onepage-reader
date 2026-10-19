# Project Vision & Scope: OnePage Reader (CrossPoint-based)

OnePage is a reading-first, open-hardware e-reader. Reading remains the anchor: the firmware must always stay fast,
legible, and dependable above all else. Beyond reading, OnePage is intentionally a **multi-function platform** — it hosts
lightweight on-device apps and on-demand services (games, tools, reading analytics, standby faces, image delivery)
alongside the reader.

## 1. Core Mission

Provide a lightweight, high-performance firmware that maximizes the OnePage C61's potential: first-class reading, plus a
curated set of offline-first apps and utilities that never compromise reading stability, legibility, or battery life.

## 2. Scope

### In-Scope

*These are features that directly improve the primary purpose of the device.*

* **User Experience:** E.g. User-friendly interfaces, and interactions, both inside the reader and navigating the
  firmware. This includes things like button mapping, book loading, and book navigation like bookmarks.
* **Document Rendering:** E.g. Support for rendering documents (primarily EPUB) and improvements to the rendering
  engine.
* **Format Optimization:** E.g. Efficiently parsing EPUB (CSS/Images) and other documents within the device's
  capabilities.
* **Typography & Legibility:** E.g. Custom font support, hyphenation engines, and adjustable line spacing.
* **E-Ink Driver Refinement:** E.g. Reducing full-screen flashes (ghosting management) and improving general rendering.
* **Library Management:** E.g. Simple, intuitive ways to organize and navigate a collection of books.
* **Local Transfer:** E.g. Simple, "pull" based book loading via a basic web-server or public and widely-used standards.
* **Language Support:** E.g. Support for multiple languages both in the reader and in the interfaces.
* **Reference Tools:** E.g. Local dictionary lookup. Providing quick, offline definitions to enhance comprehension 
  without breaking focus.
* **Apps & Utilities:** Lightweight, offline-first on-device apps — games (e.g. 2048, Sudoku, Gomoku, Minesweeper),
  calculator, reading analytics, standby faces — launched from the Tools/Apps hub. Each must respect the device's memory
  and e-ink refresh limits and persist its own state.
* **On-demand Services:** Networked features (image delivery, cloud content) run **on demand**, never as always-on
  background daemons — see the Battery & Connectivity Policy below.
* **Clock Display (device dependent):** 

| Device | Scope |
| -- | -- |
| X3 | The X3 uses a dedicated DS3231 RTC, which maintains accurate time across sleep cycles and can be treated as a reliable wall clock. |
| X4 | The X4 relies on the ESP32-C3's internal RTC, which drifts significantly during deep sleep. NTP sync could correct this, with an appropriate user experience around connecting to the internet on wake or on demand. This interacts with the **Battery & Connectivity Policy** below, so please open a discussion about this UX if it's a feature you would find useful. |

### Out-of-Scope

*These items are rejected because they compromise the device's stability, battery life, or mission.*

* **Media Playback:** No Audio players or Audio-books.
* **Complex Annotation:** No typed out notes. These features are better suited for devices with better input
  capabilities and more powerful chips.
* **Always-on Background Services:** No RSS readers, news aggregators, or general web browsers, and no persistent
  background network daemons. Apps may use the network on demand, but idle Wi-Fi/modem wake must not run continuously
  (see the Battery & Connectivity Policy).

> **Repositioning note:** Interactive apps, calculators, games, and on-demand connectivity are **no longer out of scope**.
> OnePage has repositioned as a multi-function platform; these are governed by the Battery & Connectivity Policy rather
> than banned outright.

### In-scope — Technically Unsupported

*These features align with CrossPoint's goals but are impractical on the current hardware or produce poor UX.*

* **PDF Rendering:** PDFs are fixed-layout documents, so rendering them requires displaying pages as images rather than reflowable text — resulting in constant panning and zooming that makes for a poor reading experience on e-ink.

## 3. Battery & Connectivity Policy

Repositioning to a multi-function platform does not relax the device's hardest constraint: battery. On the OnePage C61,
system light-sleep / power management is still immature, so continuous radio/network use is disproportionately expensive.

* **Offline-first by default:** Apps and tools must work with no network and consume no radio unless the user invokes it.
* **On-demand network only:** Features such as AirPage image delivery and WeRead connect on demand and must tear the
  connection down promptly; always-on MQTT / keep-alive requires an explicit user opt-in and a visible battery cost.
* **No idle radio wake:** Background polling, timers, or sync that keep the radio or CPU awake between user actions is
  rejected unless it demonstrably fits the power budget.
* **E-ink discipline:** App repaints must respect refresh-frequency and ghosting limits (reuse the reader's refresh
  policy); avoid per-second repaints.

## 4. Idea Evaluation

OnePage welcomes new apps and utilities, but every addition must stay lightweight, reliable, and performant and must
respect the Battery & Connectivity Policy above. The guiding questions: does the idea fit the device's memory, e-ink
refresh, and power budget — and does it avoid degrading the reading experience that anchors the platform?

> **Note to Contributors:** If you are unsure if your idea fits the scope, please open a **Discussion** before you start
> coding!
