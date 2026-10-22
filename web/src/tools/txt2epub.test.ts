import { describe, expect, it } from 'vitest';
import * as JSZipNS from 'jszip';
import { buildEpub, cleanText, escapeXml, splitIntoChapters, type EpubChapter } from './txt2epub';

const JSZip = ((JSZipNS as any).default ?? JSZipNS) as { loadAsync: (d: any) => Promise<any> };

describe('escapeXml', () => {
  it('escapes the five predefined entities and drops control chars', () => {
    expect(escapeXml('a & b < c > d "e" \'f\'')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
    expect(escapeXml('ok\u0000\u001Fend')).toBe('okend');
  });
});

describe('cleanText', () => {
  it('strips ad lines, collapses blanks and trims trailing space', () => {
    const raw = '第一章 开始  \r\n正文一段\r\n\r\n\r\nwww.foo.com\r\n正文二段\r\n';
    const out = cleanText(raw, { stripAds: true, collapse: true, trim: true });
    expect(out).not.toContain('www.foo.com');
    expect(out).not.toMatch(/\n\n\n/);
    expect(out).toContain('正文一段');
    expect(out).toContain('正文二段');
  });
});

describe('splitIntoChapters', () => {
  it('splits on heading lines and keeps a preamble chapter', () => {
    const text = '这是开头\n第一章 起风\n正文A\n第二章 落雨\n正文B';
    const re = /^\s*第\s*[一二三四五六七八九十]+\s*章/;
    const chapters = splitIntoChapters(text, re);
    expect(chapters.map((c) => c.title)).toEqual(['', '第一章 起风', '第二章 落雨']);
    expect(chapters[1].paragraphs).toEqual(['正文A']);
    expect(chapters[0].paragraphs).toEqual(['这是开头']);
  });

  it('returns a single chapter when no regex is given', () => {
    const chapters = splitIntoChapters('一行\n两行', null);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].paragraphs).toEqual(['一行', '两行']);
  });
});

async function unzip(bytes: Uint8Array) {
  return JSZip.loadAsync(bytes);
}

describe('buildEpub', () => {
  const chapters: EpubChapter[] = [
    { title: '第一章', paragraphs: ['正文 & 转义 <tag>', '第二段'] },
    { title: '第二章', paragraphs: ['更多正文'] },
  ];

  it('produces a valid EPUB 2 skeleton with mimetype first', async () => {
    const bytes = await buildEpub({ title: '测试书', author: '作者', language: 'zh', chapters, coverPng: null });
    const zip = await unzip(bytes);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe('mimetype');
    expect(await zip.file('mimetype').async('text')).toBe('application/epub+zip');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/toc.ncx');
    expect(names).toContain('OEBPS/chapter-001.xhtml');
    expect(names).toContain('OEBPS/chapter-002.xhtml');
    expect(names).not.toContain('OEBPS/cover.png');
  });

  it('wires container → OPF → spine/manifest consistently', async () => {
    const bytes = await buildEpub({ title: 'T', author: 'A', language: 'en', chapters, coverPng: null });
    const zip = await unzip(bytes);
    const container = await zip.file('META-INF/container.xml').async('text');
    expect(container).toContain('OEBPS/content.opf');
    const opf = await zip.file('OEBPS/content.opf').async('text');
    // one spine itemref per chapter, matching manifest items
    expect((opf.match(/<itemref /g) || []).length).toBe(2);
    expect(opf).toContain('id="c1"');
    expect(opf).toContain('id="c2"');
    expect(opf).toContain('<dc:language>en</dc:language>');
    const ch1 = await zip.file('OEBPS/chapter-001.xhtml').async('text');
    expect(ch1).toContain('正文 &amp; 转义 &lt;tag&gt;');
    expect(ch1).toContain('<h1 class="chapter">第一章</h1>');
  });

  it('includes a cover when cover bytes are provided', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // tiny stand-in
    const bytes = await buildEpub({ title: 'T', author: 'A', language: 'zh', chapters, coverPng: png });
    const zip = await unzip(bytes);
    const names = Object.keys(zip.files);
    expect(names).toContain('OEBPS/cover.png');
    expect(names).toContain('OEBPS/cover.xhtml');
    const opf = await zip.file('OEBPS/content.opf').async('text');
    expect(opf).toContain('media-type="image/png"');
    expect(opf).toContain('<itemref idref="cover" linear="no" />');
  });
});
