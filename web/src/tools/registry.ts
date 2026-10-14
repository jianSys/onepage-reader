// Single source of truth for the tools hub. Adding a tool = one entry here +
// its i18n strings in ui[lang].tools.items[id] + a page. The hub grid and the
// shared ToolShell chrome both read from this list, so navigation, cards and
// breadcrumbs stay in sync automatically.

export type ToolId = 'cards' | 'fonts' | 'images' | 'wallpaper' | 'txt' | 'epub';

export interface ToolDescriptor {
  id: ToolId;
  /** Logical path (no locale, no base) — resolved via localizedPath(). */
  path: string;
  /** Surface treatment the tool page asks for. 'dark' = workstation panel. */
  surface: 'light' | 'dark';
  /** 'ready' links to the tool; 'soon' renders a disabled placeholder. */
  status: 'ready' | 'soon';
  /** Inline SVG path data for the hub icon (24×24 viewBox, stroke). */
  icon: string;
}

export const tools: ToolDescriptor[] = [
  {
    id: 'cards',
    path: '/cards',
    surface: 'dark',
    status: 'ready',
    // a card / frame with a line of text
    icon: 'M4 5h16v14H4z M7 9h10 M7 13h6',
  },
  {
    id: 'fonts',
    path: '/fonts',
    surface: 'light',
    status: 'ready',
    // an "A" glyph in a box — type / font
    icon: 'M5 18 12 5l7 13 M8 14h8',
  },
  {
    id: 'images',
    path: '/image',
    surface: 'light',
    status: 'ready',
    // picture / convert metaphor
    icon: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M15 9h.01',
  },
  {
    id: 'wallpaper',
    path: '/wallpaper',
    surface: 'light',
    status: 'ready',
    // a phone / lock-screen frame
    icon: 'M7 2h10v20H7z M11 18h2',
  },
  {
    id: 'txt',
    path: '/txt',
    surface: 'light',
    status: 'ready',
    // a document with text lines
    icon: 'M6 2h9l3 3v17H6z M14 2v4h4 M9 12h6 M9 16h6',
  },
  {
    id: 'epub',
    path: '/epub',
    surface: 'light',
    status: 'ready',
    // an open book
    icon: 'M12 6c-2-1.5-5-1.5-8 0v12c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0V6c-3-1.5-6-1.5-8 0z M12 6v12',
  },
];
