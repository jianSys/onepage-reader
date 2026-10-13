export const languages = {
  en: 'English',
  zh: '中文',
} as const;

export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

type Feature = {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  caption: string;
};

type LogEntry = { when: string; title: string; body: string; tag: string };

type FirmwareContent = {
  eyebrow: string;
  title: string;
  lede: string;
  // Browser (Web Serial) flow
  webTitle: string;
  webLede: string;
  connectBtn: string;
  browserNote: string;
  unsupported: string;
  // Live flash status
  connecting: string;
  flashing: string;
  flashDone: string;
  flashErr: string;
  noSerial: string;
  logTitle: string;
  // Serial monitor (post-flash boot log)
  monitorTitle: string;
  monitorBtn: string;
  monitorStopBtn: string;
  monitorHint: string;
  monitorClosed: string;
  // Shared safety notes
  notesTitle: string;
  notes: string[];
};

type FontsContent = {
  eyebrow: string;
  title: string;
  lede: string;
  familyLabel: string;
  familyHint: string;
  familyPlaceholder: string;
  sizesLabel: string;
  sizesHint: string;
  facesLabel: string;
  facesHint: string;
  styles: { regular: string; bold: string; italic: string; bolditalic: string };
  fallbacksLabel: string;
  fallbacksHint: string;
  fallback1: string;
  fallback2: string;
  required: string;
  optional: string;
  coverageLabel: string;
  coverageHint: string;
  presetNames: Record<string, string>;
  customLabel: string;
  customHint: string;
  buildBtn: string;
  cancelBtn: string;
  building: string;
  cancelled: string;
  complete: string;
  progressLabel: string;
  logTitle: string;
  resultsTitle: string;
  downloadAll: string;
  download: string;
  installTitle: string;
  installSteps: string[];
  errNoFont: string;
  errFileType: string;
  errTooLarge: string;
  errOom: string;
  errFailed: string;
};

type CardsContent = {
  eyebrow: string;
  title: string;
  lede: string;
  // Template picker
  templatesTitle: string;
  allLabel: string;
  categories: Record<
    'time' | 'count' | 'text' | 'list' | 'data' | 'photo' | 'office' | 'plan' | 'ink' | 'poster' | 'astro',
    string
  >;
  templates: Record<string, { name: string; hint: string }>;
  // Editor + controls
  editorTitle: string;
  contentLabel: string;
  title2Label: string;
  itemsLabel: string;
  itemsHint: string;
  photoBtn: string;
  photoHint: string;
  fetchBtn: string;
  fitLabel: string;
  ditherLabel: string;
  ditherHint: string;
  downloadBtn: string;
  pushBtn: string;
  deviceUrlLabel: string;
  // Export format switch
  formatLabel: string;
  bmpHint: string;
  pngHint: string;
  // Live status line
  ready: string;
  rendering: string;
  fetched: string;
  fetchFailed: string;
  pushed: string;
  pushFailed: string;
  offlineNote: string;
  footNote: string;
};

type ToolsContent = {
  eyebrow: string;
  title: string;
  lede: string;
  readyLabel: string;
  soonLabel: string;
  openLabel: string;
  backLabel: string;
  items: Record<'cards' | 'fonts' | 'images', { name: string; tagline: string }>;
};

type Content = {
  nav: {
    features: string;
    notes: string;
    firmware: string;
    fontTool: string;
    cards: string;
    tools: string;
    github: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lede: string;
    caption: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  features: {
    reading: Feature;
    hardware: Feature;
    webconfig: Feature;
    controls: Feature;
  };
  materials: {
    eyebrow: string;
    title: string;
    lede: string;
    items: { label: string; body: string }[];
    simLaunch: string;
    simNote: string;
  };
  log: {
    eyebrow: string;
    title: string;
    lede: string;
    entries: LogEntry[];
    nextLabel: string;
    next: { items: string; status: string }[];
  };
  about: {
    eyebrow: string;
    title: string;
    body: string[];
  };
  footer: {
    tagline: string;
    openSource: string;
    rights: string;
  };
  specs: {
    eyebrow: string;
    title: string;
    groups: { label: string; rows: { k: string; v: string }[] }[];
  };
  gallery: {
    eyebrow: string;
    title: string;
    dotLabel: string;
    photos: { src: string; alt: string; title: string; sub: string }[];
  };
  fonts: FontsContent;
  firmware: FirmwareContent;
  cards: CardsContent;
  tools: ToolsContent;
};

export const ui: Record<Lang, Content> = {
  en: {
    nav: {
      features: 'The build',
      notes: 'Log',
      firmware: 'Firmware',
      fontTool: 'Font Tool',
      cards: 'Card Studio',
      tools: 'Tools',
      github: 'GitHub',
    },
    hero: {
      eyebrow: 'Build log · 4.26-inch e-ink reader',
      title: 'OnePage — a little e-reader I’m building for myself.',
      lede: 'An open notebook for a 4.26″ e-ink reader on an ESP32-C61. Reflowable text, careful CJK typography, a phone-friendly setup. No roadmap promises — just what works so far, written down as it does.',
      caption: 'OnePage · 壹頁 — seen edge-on. It’s genuinely thin.',
      ctaPrimary: 'Read the log',
      ctaSecondary: 'GitHub',
    },
    features: {
      reading: {
        eyebrow: 'Reading',
        title: 'Getting the text to lay out properly.',
        body: 'Plain TXT and EPUB are reflowed by CrossPoint’s engine and rendered with FreeType, so glyphs stay crisp at 219 DPI. Most of my work is in the Chinese typography — line-breaking and justification that don’t look wrong.',
        points: [
          'TXT and EPUB reflow already working (HTML / Markdown ride the same path)',
          'CJK line-breaking, punctuation squeezing, and full justification',
          'Reading position kept across sleep and reboots',
        ],
        caption: 'Narrow bezels up top.',
      },
      hardware: {
        eyebrow: 'Hardware',
        title: 'Quiet, paper-like, daylight-loving.',
        body: 'A 4.26″ 800×480 panel at 219 DPI, driven 1-bit black & white for crisp text, with 4-level gray kept for covers and images. Battery-powered with deep sleep — and no frontlight, which is a choice, not an oversight.',
        points: [
          'ESP32-C61 · 16 MB flash · 2 MB PSRAM · microSD over SPI',
          '1-bit B/W for text, 4-gray for covers and pictures',
          'No frontlight: happiest in daylight — night reading needs a lamp',
        ],
        caption: 'Front — quiet, and paper-like.',
      },
      webconfig: {
        eyebrow: 'Setup',
        title: 'Configure it from your phone.',
        body: 'Seven buttons and no touchscreen make typing a WiFi password on-device miserable. So the reader hosts its own little web page — open it from any browser to set things up and push books across.',
        points: [
          'Starts its own hotspot for first-time WiFi setup, or join over your LAN',
          'Upload EPUB / TXT straight from the browser to the SD card',
          'Enter WiFi, API keys, and sync settings without the on-screen keyboard',
        ],
        caption: 'microSD slot, USB-C, and a mic hole — all in one row.',
      },
      controls: {
        eyebrow: 'Controls',
        title: 'Built for pockets and commutes.',
        body: 'Seven physical keys, no touch. A long-press key-lock stops it flipping pages in your bag, and an optional Bluetooth page-turner means your hands can stay under the blanket.',
        points: [
          'Long-press to lock; wakes locked so it won’t flip pages in a bag',
          'Optional BLE page-turner with learn-to-map buttons',
          'Page-turn direction follows the screen orientation',
        ],
        caption: 'Wake key — restrained, but easy to reach.',
      },
    },
    materials: {
      eyebrow: 'The object',
      title: 'Built to be held, not just used.',
      lede: 'An aluminium mid-frame between a white front and a white acrylic back. Light, flat, quiet in the hand — it should feel like a notebook you keep, not a gadget you charge.',
      items: [
        { label: 'Aluminium mid-frame', body: 'A thin milled frame carries the structure and the keys, and gives it a flat, sturdy edge.' },
        { label: 'White front', body: 'A clean white face around the e-ink screen. Narrow bezels, nothing blinking back at you.' },
        { label: 'White acrylic back', body: 'A smooth white acrylic shell — warm to hold, and quietly unlike the usual black slab.' },
      ],
      simLaunch: 'Try it live',
      simNote: 'The real firmware, running in your browser — my port of CrossPoint (open-source), the same reader the device runs.',
    },
    log: {
      eyebrow: 'Build log',
      title: 'What’s happened so far.',
      lede: 'Rough notes from bring-up. Newest first. Dates are approximate — this is a side project, not a release schedule.',
      entries: [
        {
          when: 'Now',
          title: 'Porting CrossPoint',
          body: 'Rather than write a reader from scratch, I’m porting CrossPoint — open-source, and already solid at TXT/EPUB reflow and CJK typography. Much faster path to something I can actually read on.',
          tag: 'In progress',
        },
        {
          when: 'Earlier',
          title: 'The mic records now',
          body: 'That PDM mic that “wouldn’t clock right” wasn’t a silicon erratum after all — it was an IDF 5.5.x driver bug in the C61’s PDM-RX clock path, and 6.1-dev fixed it. Long-press to record, software CIC down to 16 kHz, WAV to the SD card. Still a side feature, not part of reading.',
          tag: 'Done',
        },
        {
          when: 'Earlier',
          title: 'Web setup decided',
          body: 'With seven keys and no touch, typing passwords on-screen is awful. Settled on a self-hosted web page over hotspot / LAN as the real way to configure and load books.',
          tag: 'Decided',
        },
        {
          when: 'Bring-up',
          title: 'Panel drawing, screen-corruption fixed',
          body: 'Got the 4.26″ SSD1677 panel refreshing, then tracked down a tearing bug to an SPI per-transfer size limit on the C61. One bad assumption, a lot of garbled screens.',
          tag: 'Done',
        },
      ],
      nextLabel: 'On the list, roughly in order',
      next: [
        { items: 'TXT and EPUB', status: 'Stage 1' },
        { items: 'HTML & Markdown (same reflow engine)', status: 'Stage 2' },
        { items: 'CBZ comics, MOBI / AZW3 (no DRM)', status: 'Stage 3' },
        { items: 'PDF, read-only (crop + columns) — tight on memory', status: 'Maybe' },
      ],
    },
    about: {
      eyebrow: 'About this',
      title: 'A personal project, not a product.',
      body: [
        'OnePage is something I’m building for the fun of it — to read the way I like, on hardware I understand. It isn’t a startup and it isn’t chasing a market.',
        'I’m keeping the notes in the open: the decisions, the dead ends, and the occasional thing that finally works. If that’s your kind of thing, follow along.',
      ],
    },
    footer: {
      tagline: 'OnePage · 壹頁 — a 4.26″ e-ink reader.',
      openSource: 'Built on CrossPoint (MIT). My port and these notes are shared openly.',
      rights: 'A personal build log. Names and brand are still settling.',
    },
    specs: {
      eyebrow: 'Tech specs',
      title: 'The details, for the curious.',
      groups: [
        { label: 'Size & weight', rows: [
          { k: 'Dimensions', v: '66.5 × 116 × 5 mm' },
          { k: 'Weight', v: '64 g' },
        ] },
        { label: 'Display', rows: [
          { k: 'Panel', v: '4.26″ e-ink · 800×480 · 219 dpi' },
          { k: 'Rendering', v: '1-bit B/W text · 4-gray covers' },
          { k: 'Frontlight', v: 'None — on purpose' },
          { k: 'Controller', v: 'SSD1677 (SPI)' },
        ] },
        { label: 'Chip & memory', rows: [
          { k: 'SoC', v: 'ESP32-C61' },
          { k: 'Flash', v: '16 MB' },
          { k: 'PSRAM', v: '2 MB' },
        ] },
        { label: 'Storage', rows: [
          { k: 'Card', v: 'microSD over SPI' },
          { k: 'Filesystem', v: 'FAT32 only' },
        ] },
        { label: 'Controls', rows: [
          { k: 'Keys', v: '7 physical · no touch' },
          { k: 'Page-turner', v: 'Optional Bluetooth LE' },
        ] },
        { label: 'Connectivity', rows: [
          { k: 'Wireless', v: 'Wi-Fi 6 · Bluetooth LE' },
          { k: 'Port', v: 'USB-C' },
        ] },
        { label: 'Power', rows: [
          { k: 'Battery', v: '1000 mAh · rechargeable' },
          { k: 'Charging', v: 'Over USB-C' },
        ] },
      ],
    },
    gallery: {
      eyebrow: 'Renders',
      title: 'A first look at the design.',
      dotLabel: 'View photo',
      photos: [
        { src: '/gallery/OnePage-3D-a1.jpg', alt: 'OnePage — seen edge-on', title: 'Genuinely thin', sub: 'Seen edge-on' },
        { src: '/gallery/OnePage-3D-a2.jpg', alt: 'OnePage — top bezel', title: 'The top quarter', sub: 'Bezels pulled in tight' },
        { src: '/gallery/OnePage-3D-a3.jpg', alt: 'OnePage — bottom at 45°', title: 'Bottom, at 45°', sub: 'Keys and ports, all in a row' },
        { src: '/gallery/OnePage-3D-a4.jpg', alt: 'OnePage — wake key', title: 'The wake key', sub: 'Restrained, but easy to reach' },
        { src: '/gallery/OnePage-3D-a5.jpg', alt: 'OnePage — microSD slot', title: 'A little surprise', sub: 'The microSD slot has a face' },
      ],
    },
    fonts: {
      eyebrow: 'Font tool',
      title: 'Build fonts for OnePage.',
      lede: 'Build CrossPoint-compatible .cpfont files for OnePage, entirely in your browser. Your source fonts never leave this device.',
      familyLabel: 'Font family',
      familyHint: 'Used for the output folder and filenames. Use ASCII letters, numbers, underscores, or hyphens.',
      familyPlaceholder: 'e.g. LXGW_WenKai',
      sizesLabel: 'Font sizes',
      sizesHint: 'Comma-separated point sizes from 6 to 48. CJK coverage also adds firmware UI sizes 8 and 10.',
      facesLabel: 'Style fonts',
      facesHint: 'Choose TTF or OTF files. Regular is required; each selected style is stored in every output.',
      styles: { regular: 'Regular', bold: 'Bold', italic: 'Italic', bolditalic: 'Bold Italic' },
      fallbacksLabel: 'Regular fallbacks',
      fallbacksHint: 'Optional TTF/OTF fonts used in order when a glyph is missing from a style font.',
      fallback1: 'Fallback 1',
      fallback2: 'Fallback 2',
      required: 'required',
      optional: 'optional',
      coverageLabel: 'Character coverage',
      coverageHint: 'Choose the official CrossPoint sets you need. Base ASCII, common punctuation, and U+FFFD are always included.',
      presetNames: {
        reading: 'Reading',
        default: 'Default multilingual',
        'latin-ext': 'Latin Extended',
        greek: 'Greek',
        cyrillic: 'Cyrillic',
        vietnamese: 'Vietnamese',
        hebrew: 'Hebrew',
        arabic: 'Arabic',
        armenian: 'Armenian',
        georgian: 'Georgian',
        ethiopic: 'Ethiopic',
        cherokee: 'Cherokee',
        tifinagh: 'Tifinagh',
        bengali: 'Bengali',
        thai: 'Thai',
        hangul: 'Korean (Hangul)',
        'cjk-sc': 'Simplified Chinese',
        'cjk-tc': 'Traditional Chinese',
        'cjk-jp': 'Japanese',
        symbols: 'Symbols',
        'ipa-chars': 'IPA characters',
      },
      customLabel: 'Custom Unicode ranges',
      customHint: 'Optional strict ranges, comma-separated: (0x2900-0x29FF),(0x2E00-0x2EFF)',
      buildBtn: 'Build .cpfont',
      cancelBtn: 'Cancel',
      building: 'Building fonts…',
      cancelled: 'Build cancelled.',
      complete: 'Build complete.',
      progressLabel: 'Font build progress',
      logTitle: 'Build details',
      resultsTitle: 'Generated files',
      downloadAll: 'Download all (.zip)',
      download: 'Download',
      installTitle: 'How to install',
      installSteps: [
        'Keep the generated names in the form <Family>_<size>.cpfont.',
        'Place the files under /.fonts/<Family>/ or /fonts/<Family>/ on the SD card.',
        'Reboot OnePage or rescan fonts, then select the family in the reader.',
      ],
      errNoFont: 'Choose a Regular TTF or OTF font first.',
      errFileType: 'Only TTF and OTF source fonts are supported in this release.',
      errTooLarge: 'Selected source fonts exceed the 128 MB limit.',
      errOom: 'Not enough browser memory. Try fewer character sets, font sizes, or styles.',
      errFailed: 'Could not build the font.',
    },
    firmware: {
      eyebrow: 'Firmware',
      title: 'Flash OnePage onto your device.',
      lede: 'OnePage runs my port of CrossPoint. Plug the reader in over USB and flash the latest build straight from this page — no tools to install.',
      webTitle: 'Flash from the browser',
      webLede: 'Plug the reader in over USB, then connect and flash. Works in Chrome, Edge, and other Chromium browsers that support Web Serial.',
      connectBtn: 'Connect & flash',
      browserNote: 'Your browser talks to the chip directly — nothing is uploaded to a server.',
      unsupported: 'This browser can’t flash over USB (no Web Serial). Use Chrome or Edge on desktop.',
      connecting: 'Connecting — pick your device’s serial port…',
      flashing: 'Flashing… keep the cable connected.',
      flashDone: 'Done. The reader is rebooting into the new firmware.',
      flashErr: 'Flash failed. Check the cable, or hold Next Page and press Reset to retry.',
      noSerial: 'This browser has no Web Serial. Use Chrome or Edge on desktop.',
      logTitle: 'Flash log',
      monitorTitle: 'Serial monitor',
      monitorBtn: 'Connect monitor',
      monitorStopBtn: 'Stop monitor',
      monitorHint: 'Boots logs after the flashing. If it stops working, press the reset button on the device to get output started again.',
      monitorClosed: 'Serial port disconnected — stop and reconnect the monitor if you replug the device.',
      notesTitle: 'Before you flash',
      notes: [
        'Wake the device from sleep before flashing.',
        'This replaces whatever firmware is currently on the device. Your books and settings live on the SD card and are untouched.',
        'If the flash fails, hold the Next Page button, short-press Reset once, then release the Reset button first to force download mode, and retry.',
        'A wrong-chip image won’t brick the board — it just won’t boot. Reflash the correct one.',
      ],
    },
    cards: {
      eyebrow: 'Card Studio',
      title: 'Design e-ink cards for AirPage.',
      lede: 'Pick from 38 ready layouts — photo, clock, weather, badges, ink-wash, posters, lists and more — dithered to the reader’s 480×800 black-and-white panel exactly as the device would, then download it or push it to OnePage over USB-less Wi-Fi.',
      templatesTitle: 'Template',
      allLabel: 'All',
      categories: { time: 'Time', count: 'Counting', text: 'Words', list: 'Lists', data: 'Data', photo: 'Photo', office: 'Office', plan: 'Plan', ink: 'Ink', poster: 'Poster', astro: 'Sky' },
      templates: {
        quote: { name: 'Quote', hint: 'One calm line of text. “Fetch” pulls a live hitokoto.' },
        poem: { name: 'Poem', hint: 'Verses in the main box (one per line); title · author in the subtitle.' },
        bigtype: { name: 'Big type', hint: 'A single word or short phrase, blown up to fill the page.' },
        word: { name: 'Word of the day', hint: 'Term + pronunciation · part of speech; meanings/examples one per line.' },
        clock: { name: 'Clock', hint: 'Snapshot of the current time and date (updates live in preview).' },
        date: { name: 'Calendar', hint: 'This month’s grid with today highlighted.' },
        countdown: { name: 'Countdown', hint: 'Label in main box; target date (2027-01-01) in the subtitle.' },
        progress: { name: 'Progress', hint: 'Label + a percent number in the subtitle; extra lines optional.' },
        habit: { name: 'Habit streak', hint: 'What you’re tracking; the streak count in the subtitle.' },
        todo: { name: 'To-do', hint: 'Title in the main box; items one per line, prefix [x] for done.' },
        checklist: { name: 'Checklist', hint: 'Title in the main box; numbered list items one per line.' },
        weather: { name: 'Weather', hint: 'Place in the subtitle, then “Fetch” for live temperature + forecast.' },
        status: { name: 'Status', hint: 'A big number; caption above; “key : value” rows one per line.' },
        reading: { name: 'Now reading', hint: 'Book title + author; “Progress : 62%” and page rows one per line.' },
        moon: { name: 'Moon phase', hint: 'Today’s lunar phase, drawn from the date; optional label.' },
        greet: { name: 'Greeting', hint: 'Time-of-day greeting that changes live; override the text if you like.' },
        week: { name: 'This week', hint: 'The ISO week number with a year-progress bar underneath.' },
        haiku: { name: 'Haiku', hint: 'Three short lines (one per line in the main box); author in the subtitle.' },
        lyric: { name: 'Lyric', hint: 'A line of a song or verse, set large; song name in the subtitle.' },
        note: { name: 'Note', hint: 'A single thought on a bordered note; footer shows date unless you type one.' },
        blessing: { name: 'Daily fortune', hint: 'A word in a seal; caption below; extra blessing lines one per line.' },
        ring: { name: 'Goal ring', hint: 'A circular progress ring; percent number in the subtitle.' },
        pomodoro: { name: 'Pomodoro', hint: 'Completed focus sessions as dots; the count in the subtitle.' },
        numbered: { name: 'Numbered list', hint: 'Title in the main box; numbered priority items one per line.' },
        groceries: { name: 'Shopping list', hint: 'A two-column list; prefix [x] for done items.' },
        sun: { name: 'Sun times', hint: 'Sunrise / sunset arc; put the two times on the lines (06:12, 18:45).' },
        water: { name: 'Water intake', hint: 'Glasses filled today; the count in the subtitle.' },
        battery: { name: 'Battery', hint: 'A battery gauge; percent in the subtitle; “key : value” rows optional.' },
        photo: { name: 'Upload photo', hint: 'Pick any photo — it’s cropped to fill and dithered to 1-bit for the panel.' },
        yearprog: { name: 'Year progress', hint: 'A dot grid of the whole year with elapsed days filled in.' },
        letter: { name: 'Letter', hint: 'A vertical, right-to-left letter; signature in the subtitle.' },
        verse: { name: 'Verse', hint: 'A classical poem in vertical columns; author in the subtitle.' },
        ink: { name: 'Ink landscape', hint: 'Layered ink-wash mountains; a short title in the main box.' },
        poster: { name: 'Concert poster', hint: 'Title + rule; program lines one per line; venue in the subtitle.' },
        starmap: { name: 'Star chart', hint: 'A night-sky field with a constellation; title + date.' },
        weekplan: { name: 'This week', hint: 'A weekly schedule; “Day · time · plan” one per line.' },
        social: { name: 'Social battery', hint: 'A segmented battery; the percentage in the subtitle.' },
        badge: { name: 'ID badge', hint: 'Name in the main box; role in the subtitle; employee ID on the first line.' },
      },
      editorTitle: 'Content',
      contentLabel: 'Main text',
      title2Label: 'Subtitle / source',
      itemsLabel: 'Lines',
      itemsHint: 'One per line (to-do & status details)',
      photoBtn: 'Choose image…',
      photoHint: 'Stays on your device — nothing is uploaded.',
      fetchBtn: 'Fetch live data',
      fitLabel: 'Auto-fit text',
      ditherLabel: 'E-ink preview (1-bit dither)',
      ditherHint: 'Toggle to see the true black-and-white result the panel shows.',
      downloadBtn: 'Download',
      pushBtn: 'Push to device',
      deviceUrlLabel: 'Device address',
      formatLabel: 'Format',
      bmpHint: '1-bit BMP — drop it on the SD card or push it, the device shows it as-is.',
      pngHint: 'PNG — for sharing; the device converts it on open.',
      ready: 'Ready.',
      rendering: 'Rendering…',
      fetched: 'Live data loaded.',
      fetchFailed: 'Could not fetch (offline on the hotspot?). Edit the text by hand.',
      pushed: 'Pushed to the device.',
      pushFailed: 'Push failed — check the device address, or download and import instead.',
      offlineNote: 'The device runs its own hotspot; your phone can still use mobile data to fetch. If both are offline, edit manually.',
      footNote: 'Card layouts are inspired by the CrossMux AirPage community project (MIT).',
    },
    tools: {
      eyebrow: 'Toolbox',
      title: 'Browser tools for your reader.',
      lede: 'Small, private utilities that run entirely in your browser — nothing is uploaded. Generate fonts, design e-ink cards, and more to come.',
      readyLabel: 'Open',
      soonLabel: 'Coming soon',
      openLabel: 'Open tool',
      backLabel: 'All tools',
      items: {
        cards: { name: 'Card Studio', tagline: 'Design 480×800 e-ink cards, export ready-to-use BMP.' },
        fonts: { name: 'Font Tool', tagline: 'Convert TTF / OTF into CrossPoint .cpfont, offline.' },
        images: { name: 'Image → BMP', tagline: 'Turn any photo into a dithered e-ink bitmap.' },
      },
    },
  },
  zh: {
    nav: {
      features: '在做什么',
      notes: '手记',
      firmware: '固件',
      fontTool: '字体工具',
      cards: '卡片工坊',
      tools: '工具台',
      github: 'GitHub',
    },
    hero: {
      eyebrow: '开发手记 · 4.26 英寸墨水屏阅读器',
      title: '壹頁 —— 给自己折腾的一台小阅读器。',
      lede: '一台基于 ESP32-C61 的 4.26″ 墨水屏阅读器的公开笔记本。可重排的正文、用心的中文排版、配套手机配置。不画大饼 —— 只记录目前真正跑通的东西。',
      caption: '壹頁 · OnePage —— 侧面看过去，它真的很薄。',
      ctaPrimary: '看手记',
      ctaSecondary: 'GitHub',
    },
    features: {
      reading: {
        eyebrow: '阅读',
        title: '把字排好这件事。',
        body: '纯文本和 EPUB 由移植来的 CrossPoint 引擎重排，用 FreeType 渲染，219 DPI 下字形依然锐利。我花力气最多的是中文排版 —— 让断行和两端对齐不至于看着别扭。',
        points: [
          'TXT 和 EPUB 重排都已跑通（HTML / Markdown 同一套）',
          '中文避头尾、标点挤压、两端对齐',
          '休眠和重启后都记得读到哪',
        ],
        caption: '上方边框，收得很窄。',
      },
      hardware: {
        eyebrow: '硬件',
        title: '安静、像纸、爱阳光。',
        body: '4.26″ 800×480 面板，219 DPI，正文走 1-bit 纯黑白保证字锐，封面和图片留给 4 级灰阶。电池供电 + 深度睡眠 —— 而且故意不做前光，是选择，不是疏忽。',
        points: [
          'ESP32-C61 · 16 MB Flash · 2 MB PSRAM · microSD（SPI）',
          '正文 1-bit 黑白，封面图片 4 级灰阶',
          '没有前光：白天最舒服，夜里读书得自己点盏灯',
        ],
        caption: '正面 —— 安静，像纸。',
      },
      webconfig: {
        eyebrow: '配置',
        title: '用手机来配。',
        body: '七个按键、没有触摸，在屏上敲 WiFi 密码太难受。于是阅读器自己托管了一个网页 —— 用任何浏览器打开就能配置、传书。',
        points: [
          '首次配网自己开热点，或联网后走局域网地址',
          '浏览器里直接把 EPUB / TXT 传到 SD 卡',
          'WiFi、API Key、同步设置都不用屏上软键盘',
        ],
        caption: 'microSD 卡槽、USB-C、麦克风孔 —— 一排排开。',
      },
      controls: {
        eyebrow: '操作',
        title: '为口袋和通勤而做。',
        body: '七个实体键，无触摸。长按锁键，免得在包里乱翻页；还能选配蓝牙翻页器，手不用伸出被窝。',
        points: [
          '长按锁定；唤醒后保持锁定，包里不会乱翻页',
          '可选蓝牙翻页器，学习式按键映射',
          '翻页方向跟随屏幕朝向',
        ],
        caption: '唤醒键 —— 克制，但顺手。',
      },
    },
    materials: {
      eyebrow: '这个物件',
      title: '是拿在手里的东西，不只是个设备。',
      lede: '白色正面与白色亚克力背面之间，夹着一圈铝合金中框。轻、薄、安静 —— 想让它握起来像一本随身的本子，而不是一个要充电的数码产品。',
      items: [
        { label: '铝合金中框', body: '一圈铣削的薄中框撑起结构、也承载按键，带来平整扎实的边缘手感。' },
        { label: '白色正面', body: '墨水屏四周是干净的白色面板，窄边框，不会有任何东西朝你闪烁。' },
        { label: '白色亚克力背面', body: '光滑的白色亚克力背壳 —— 握着温润，安静地区别于一众黑色板砖。' },
      ],
      simLaunch: '让它跑起来',
      simNote: '浏览器里跑的就是设备上的固件 —— 我移植的开源 CrossPoint，直接拿来用，没有从头再写一套。',
    },
    log: {
      eyebrow: '开发手记',
      title: '到目前为止发生了什么。',
      lede: '点屏阶段的零散笔记，新的在上。日期是大概 —— 这是个副业项目，不是发布计划。',
      entries: [
        {
          when: '现在',
          title: '移植 CrossPoint',
          body: '与其从头写一套阅读器，不如直接移植开源的 CrossPoint —— 它的 TXT/EPUB 重排和中文排版都已经很成熟。这样能最快让它变成一台真能读书的机器。',
          tag: '进行中',
        },
        {
          when: '之前',
          title: '麦克风能录了',
          body: '那个「一直时钟不对」的 PDM 麦克风，最后不是硅片 erratum —— 是 IDF 5.5.x 在 C61 PDM-RX 时钟路径上的驱动 bug，换到 6.1-dev 就修好了。长按录音、软件 CIC 抽到 16kHz、存成 WAV。仍是支线功能，不进阅读主线。',
          tag: '完成',
        },
        {
          when: '之前',
          title: '定了网页配置',
          body: '七个键、没触摸，在屏上敲密码太痛苦。最终定下自托管网页，走热点 / 局域网，作为配置和传书的正经入口。',
          tag: '已定',
        },
        {
          when: '点屏期',
          title: '屏点亮了，花屏修好了',
          body: '先让 4.26″ 的 SSD1677 面板刷起来，又把撕裂花屏的 bug 追到 C61 单次 SPI 传输大小的限制上。一个错误假设，换来一堆花屏。',
          tag: '完成',
        },
      ],
      nextLabel: '待办，大致按顺序',
      next: [
        { items: 'TXT 和 EPUB', status: '阶段一' },
        { items: 'HTML 与 Markdown（同一套重排引擎）', status: '阶段二' },
        { items: 'CBZ 漫画、MOBI / AZW3（无 DRM）', status: '阶段三' },
        { items: 'PDF 只读（裁边 + 分栏）—— 内存吃紧', status: '也许' },
      ],
    },
    about: {
      eyebrow: '关于',
      title: '一个个人项目，不是产品。',
      body: [
        '壹頁是我纯为兴趣做的东西 —— 想按自己喜欢的方式读书，在自己摸得透的硬件上。它不是创业，也不在抢什么市场。',
        '我会把笔记一直放在明处：那些决定、走过的死胡同、偶尔终于跑通的小确幸。要是你也喜欢这种，就一起围观吧。',
      ],
    },
    footer: {
      tagline: '壹頁 · OnePage —— 一台 4.26″ 墨水屏阅读器。',
      openSource: '基于开源的 CrossPoint（MIT）。我的移植和这些笔记都公开分享。',
      rights: '一份个人开发记录。名字和品牌还在慢慢定。',
    },
    specs: {
      eyebrow: '参数',
      title: '给好奇的人，写在最后。',
      groups: [
        { label: '尺寸与重量', rows: [
          { k: '尺寸', v: '66.5 × 116 × 5 mm' },
          { k: '重量', v: '64 g' },
        ] },
        { label: '显示', rows: [
          { k: '面板', v: '4.26″ 墨水屏 · 800×480 · 219 dpi' },
          { k: '渲染', v: '正文 1-bit 黑白 · 封面 4 灰阶' },
          { k: '前光', v: '没有 —— 故意的' },
          { k: '控制器', v: 'SSD1677（SPI）' },
        ] },
        { label: '芯片与内存', rows: [
          { k: '主控', v: 'ESP32-C61' },
          { k: 'Flash', v: '16 MB' },
          { k: 'PSRAM', v: '2 MB' },
        ] },
        { label: '存储', rows: [
          { k: '卡', v: 'microSD（SPI）' },
          { k: '文件系统', v: '仅 FAT32' },
        ] },
        { label: '操作', rows: [
          { k: '按键', v: '7 个实体键 · 无触摸' },
          { k: '翻页器', v: '可选蓝牙 LE' },
        ] },
        { label: '连接', rows: [
          { k: '无线', v: 'Wi-Fi 6 · 蓝牙 LE' },
          { k: '接口', v: 'USB-C' },
        ] },
        { label: '电源', rows: [
          { k: '电池', v: '1000 mAh · 可充电' },
          { k: '充电', v: '经 USB-C' },
        ] },
      ],
    },
    gallery: {
      eyebrow: '渲染',
      title: '先看看它的样子。',
      dotLabel: '查看照片',
      photos: [
        { src: '/gallery/OnePage-3D-a1.jpg', alt: '壹頁 —— 侧面', title: '它真的很薄', sub: '立起来给你看' },
        { src: '/gallery/OnePage-3D-a2.jpg', alt: '壹頁 —— 上边框', title: '上方那 1/4', sub: '边框收得很窄' },
        { src: '/gallery/OnePage-3D-a3.jpg', alt: '壹頁 —— 底部 45°', title: '底部 45° 视角', sub: '三段式按键和接口，一排排开' },
        { src: '/gallery/OnePage-3D-a4.jpg', alt: '壹頁 —— 唤醒键', title: '唤醒键特写', sub: '克制，但顺手' },
        { src: '/gallery/OnePage-3D-a5.jpg', alt: '壹頁 —— microSD 卡槽', title: '意外惊喜', sub: 'micro SD 那块，长了一张脸' },
      ],
    },
    fonts: {
      eyebrow: '字体工具',
      title: '生成 OnePage 字体。',
      lede: '在浏览器里生成 OnePage 可直接读取的 CrossPoint .cpfont 字体。源字体始终留在你的设备上。',
      familyLabel: '字体家族名',
      familyHint: '用于输出目录和文件名，仅使用 ASCII 字母、数字、下划线或连字符。',
      familyPlaceholder: '例如 LXGW_WenKai',
      sizesLabel: '字体字号',
      sizesHint: '输入 6–48 的整数，用英文逗号分隔。包含中日韩文字时会自动补充固件 UI 所需的 8、10 号。',
      facesLabel: '字形字体',
      facesHint: '请选择 TTF 或 OTF 文件。常规体必填；每个已选字形都会写入所有输出文件。',
      styles: { regular: '常规', bold: '粗体', italic: '斜体', bolditalic: '粗斜体' },
      fallbacksLabel: '常规回退字体',
      fallbacksHint: '可选；字形字体缺字时，会按顺序从这些 TTF/OTF 字体中查找。',
      fallback1: '回退字体 1',
      fallback2: '回退字体 2',
      required: '必填',
      optional: '可选',
      coverageLabel: '字符覆盖',
      coverageHint: '按需选择 CrossPoint 官方字符集。基础 ASCII、常用标点和 U+FFFD 始终包含。',
      presetNames: {
        reading: '阅读常用',
        default: '默认多语言',
        'latin-ext': '拉丁扩展',
        greek: '希腊文',
        cyrillic: '西里尔文',
        vietnamese: '越南文',
        hebrew: '希伯来文',
        arabic: '阿拉伯文',
        armenian: '亚美尼亚文',
        georgian: '格鲁吉亚文',
        ethiopic: '埃塞俄比亚文',
        cherokee: '切罗基文',
        tifinagh: '提非纳文',
        bengali: '孟加拉文',
        thai: '泰文',
        hangul: '韩文（谚文）',
        'cjk-sc': '简体中文',
        'cjk-tc': '繁体中文',
        'cjk-jp': '日文',
        symbols: '符号',
        'ipa-chars': '国际音标字符',
      },
      customLabel: '自定义 Unicode 区间',
      customHint: '可选，使用严格格式并以英文逗号分隔：(0x2900-0x29FF),(0x2E00-0x2EFF)',
      buildBtn: '生成 .cpfont',
      cancelBtn: '取消',
      building: '正在生成字体…',
      cancelled: '已取消生成。',
      complete: '字体生成完成。',
      progressLabel: '字体生成进度',
      logTitle: '生成详情',
      resultsTitle: '生成的文件',
      downloadAll: '全部下载（.zip）',
      download: '下载',
      installTitle: '怎么安装',
      installSteps: [
        '保留 <Family>_<size>.cpfont 格式的文件名。',
        '把文件放进 SD 卡的 /.fonts/<Family>/ 或 /fonts/<Family>/ 目录。',
        '重启 OnePage 或重新扫描字体，然后在阅读器中选择这个字体家族。',
      ],
      errNoFont: '请先选择常规体 TTF 或 OTF 字体。',
      errFileType: '当前版本只支持 TTF 和 OTF 源字体。',
      errTooLarge: '所选源字体总大小超过 128 MB 限制。',
      errOom: '浏览器内存不足，请减少字符集、字号或字形样式后重试。',
      errFailed: '无法生成字体。',
    },
    firmware: {
      eyebrow: '固件',
      title: '把 OnePage 烧进你的设备。',
      lede: 'OnePage 跑的是我移植的 CrossPoint。用 USB 接上阅读器，直接在这个页面烧最新固件 —— 不用装任何工具。',
      webTitle: '浏览器直接烧录',
      webLede: '用 USB 把阅读器接上，然后点连接并烧录。支持 Web Serial 的浏览器（Chrome、Edge 等 Chromium 内核）可用。',
      connectBtn: '连接并烧录',
      browserNote: '浏览器直接和芯片通信 —— 不会上传到任何服务器。',
      unsupported: '当前浏览器不支持 USB 烧录（无 Web Serial）。请在桌面版 Chrome / Edge 使用。',
      connecting: '连接中 —— 请选择设备对应的串口…',
      flashing: '烧录中…… 请保持数据线连接。',
      flashDone: '完成。阅读器正在重启进入新固件。',
      flashErr: '烧录失败。检查数据线，或按住下一页键并短按 Reset 重试。',
      noSerial: '此浏览器不支持 Web Serial。请用桌面版 Chrome / Edge。',
      logTitle: '烧录日志',
      monitorTitle: '串口监视',
      monitorBtn: '连接监视器',
      monitorStopBtn: '停止监视',
      monitorHint: '烧录完成后自动接上，直接看设备启动/运行日志。没输出就按一下设备的 Reset 键。',
      monitorClosed: '串口已断开 —— 重新插拔后请停止再连接监视器。',
      notesTitle: '烧录前须知',
      notes: [
        '请退出休眠状态下烧录固件。',
        '这会覆盖设备上现有的固件。你的书和设置都在 SD 卡里，不受影响。',
        '烧录失败的话，按住下一页按键，短按一次 Reset，随后先松开 Reset 键强制进入下载模式，再重试。',
        '烧错芯片的镜像不会变砖 —— 只是开不了机，重新烧对的即可。',
      ],
    },
    cards: {
      eyebrow: '卡片工坊',
      title: '为 AirPage 设计墨水屏卡片。',
      lede: '从 38 种现成模板中挑选——照片、时钟、天气、工牌、水墨、海报、清单等，按阅读器的 480×800 黑白屏抖动成设备真实显示的效果，然后下载图片或通过 Wi-Fi 推到 OnePage。',
      templatesTitle: '模板',
      allLabel: '全部',
      categories: { time: '时间', count: '倒数与进度', text: '文字', list: '清单', data: '数据', photo: '照片', office: '办公', plan: '计划', ink: '水墨', poster: '海报', astro: '天文' },
      templates: {
        quote: { name: '一言', hint: '一行安静的文字；点“拉取”随机取一句。' },
        poem: { name: '古诗词', hint: '诗句放主文字（每行一句）；标题·作者在副标题。' },
        bigtype: { name: '大字报', hint: '一个词或短句，撑满整页。' },
        word: { name: '每日一词', hint: '词条 + 拼音·词性；释义/例句每行一条。' },
        clock: { name: '时钟', hint: '当前时间与日期的快照（预览里实时走）。' },
        date: { name: '日历', hint: '本月月历，高亮今天。' },
        countdown: { name: '倒数日', hint: '主文字填事项；副标题填目标日期 2027-01-01。' },
        progress: { name: '进度条', hint: '事项名称 + 副标题填百分比数字；额外行可选。' },
        habit: { name: '习惯打卡', hint: '打卡事项；副标题填连续天数。' },
        todo: { name: '待办', hint: '主文字填标题；事项每行一条，行首 [x] 表示完成。' },
        checklist: { name: '清单', hint: '主文字填标题；编号清单项每行一条。' },
        weather: { name: '天气', hint: '副标题填城市，点“拉取”取实时温度与预报。' },
        status: { name: '状态', hint: '一个大数字；上方标题；“名称 : 值”每行一条。' },
        reading: { name: '在读', hint: '书名 + 作者；“进度 : 62%”与页数每行一条。' },
        moon: { name: '月相', hint: '根据日期画出今天的月相；可选标签。' },
        greet: { name: '问候', hint: '随时段变化的问候（预览里实时更新）；也可自己填文字。' },
        week: { name: '本周', hint: '本周是第几周（ISO 周数），下方带今年进度条。' },
        haiku: { name: '俳句', hint: '三行短诗（主文字每行一句）；作者在副标题。' },
        lyric: { name: '歌词', hint: '一句歌词或诗句，大字排版；歌名放副标题。' },
        note: { name: '便签', hint: '一个想法写进带框便签；不填副标题则页脚显示日期。' },
        blessing: { name: '每日一签', hint: '印章里放一个字；下方说明；祝福语每行一条。' },
        ring: { name: '目标环', hint: '圆形进度环；百分比数字放副标题。' },
        pomodoro: { name: '专注钟', hint: '已完成的番茄钟用圆点表示；数量放副标题。' },
        numbered: { name: '编号清单', hint: '标题放主文字；带序号的优先事项每行一条。' },
        groceries: { name: '购物清单', hint: '双列清单；完成项前加 [x]。' },
        sun: { name: '日出日落', hint: '日出/日落弧线；两行分别填时间（06:12、18:45）。' },
        water: { name: '今日饮水', hint: '今天喝了几杯；数量放副标题。' },
        battery: { name: '设备电量', hint: '电量表；百分比放副标题；可加“键 : 值”行。' },
        photo: { name: '上传图片', hint: '选任意照片——会自动裁切铺满并抖动成 1-bit。' },
        yearprog: { name: '年度进度', hint: '一整年的点阵，已过天数会填上。' },
        letter: { name: '侨批家书', hint: '从右往左的竖排家书；落款放副标题。' },
        verse: { name: '唐诗', hint: '竖排古诗；作者放副标题。' },
        ink: { name: '水墨山水', hint: '层层渲染的水墨山峦；主文字放一个短题。' },
        poster: { name: '音乐海报', hint: '标题 + 分隔线；节目名单每行一条；场馆放副标题。' },
        starmap: { name: '星图', hint: '带星座的夜空；标题 + 日期。' },
        weekplan: { name: '本周计划', hint: '一周日程；“星期 · 时间 · 安排”每行一条。' },
        social: { name: '社交电量', hint: '分格电量条；百分比放副标题。' },
        badge: { name: '员工工牌', hint: '姓名放主文字；职位放副标题；工号放第一行。' },
      },
      editorTitle: '内容',
      contentLabel: '主文字',
      title2Label: '副标题 / 出处',
      itemsLabel: '行',
      itemsHint: '每行一条（待办与状态明细）',
      photoBtn: '选择图片…',
      photoHint: '只存在你本地 — 不会上传。',
      fetchBtn: '拉取实时数据',
      fitLabel: '自动适配字号',
      ditherLabel: '墨水屏预览（1-bit 抖动）',
      ditherHint: '切换查看屏幕真正显示的黑白效果。',
      downloadBtn: '下载',
      pushBtn: '推送到设备',
      deviceUrlLabel: '设备地址',
      formatLabel: '格式',
      bmpHint: '1-bit BMP —— 放进 SD 卡或直接推送，设备无需转换即可显示。',
      pngHint: 'PNG —— 便于分享；设备打开时再转换。',
      ready: '就绪。',
      rendering: '渲染中……',
      fetched: '实时数据已加载。',
      fetchFailed: '无法拉取（热点下未联网？）。请手动编辑文字。',
      pushed: '已推送到设备。',
      pushFailed: '推送失败 —— 检查设备地址，或改为下载后导入。',
      offlineNote: '设备开自己的热点；手机仍可用移动数据拉取。若都离线，请手动编辑。',
      footNote: '卡片布局灵感来自 CrossMux AirPage 社区项目（MIT）。',
    },
    tools: {
      eyebrow: '工具台',
      title: '跑在浏览器里的阅读器小工具。',
      lede: '小巧、隐私的本地工具 —— 全部在你的浏览器里运行，什么都不上传。生成字体、设计墨水屏卡片，更多在路上。',
      readyLabel: '打开',
      soonLabel: '即将推出',
      openLabel: '进入工具',
      backLabel: '全部工具',
      items: {
        cards: { name: '卡片工坊', tagline: '设计 480×800 墨水屏卡片，导出即用的 BMP。' },
        fonts: { name: '字体工具', tagline: '本地把 TTF / OTF 转成 CrossPoint .cpfont，不上传。' },
        images: { name: '图片转 BMP', tagline: '把任意照片变成抖动后的墨水屏位图。' },
      },
    },
  },
};

/** Site base path (e.g. '/onepage-reader-web/'); '/' in dev. Always ends with '/'. */
const BASE = import.meta.env.BASE_URL;

/** Build a locale-aware, base-prefixed href. en is the default (no locale prefix); zh is /zh/. */
export function localizedPath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  let locale = lang === 'en' ? (clean === '/' ? '/' : clean) : clean === '/' ? '/zh/' : `/zh${clean}`;
  // Astro emits dir-style pages (dist/log/index.html), so keep a trailing slash to
  // avoid a 301 hop on every internal link. Skip files that carry an extension.
  if (!locale.endsWith('/') && !locale.slice(locale.lastIndexOf('/') + 1).includes('.')) locale += '/';
  // BASE ends with '/', so drop the leading slash of the locale path when joining.
  return BASE + locale.slice(1);
}
