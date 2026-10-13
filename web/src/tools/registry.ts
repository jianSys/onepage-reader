// Single source of truth for the tools hub. Adding a tool = one entry here +
// its i18n strings in ui[lang].tools.items[id] + a page. The hub grid and the
// shared ToolShell chrome both read from this list, so navigation, cards and
// breadcrumbs stay in sync automatically.

export type ToolId = 'cards' | 'fonts' | 'images';

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
    path: '/tools',
    surface: 'light',
    status: 'soon',
    // picture / convert metaphor
    icon: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M15 9h.01',
  },
];
