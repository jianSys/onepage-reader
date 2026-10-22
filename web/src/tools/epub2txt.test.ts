import { describe, expect, it } from 'vitest';
import { buildTxt, decodeEntities, extractHeading, htmlToText } from './epub2txt';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex references', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot;')).toBe('a & b <c> "d"');
    expect(decodeEntities('&#20320;&#x597D;')).toBe('你好');
    expect(decodeEntities('&nbsp;&mdash;&unknownent;')).toBe(' —&unknownent;');
  });
});

describe('htmlToText', () => {
  it('drops head/style, keeps body paragraphs split by blank lines', () => {
    const html =
      '<?xml version="1.0"?><html><head><style>p{color:red}</style><title>T</title></head>' +
      '<body><h1>第一章</h1><p>第一段 &amp; 记号</p><p>第二段</p></body></html>';
    const text = htmlToText(html);
    expect(text).toContain('第一章');
    expect(text).toContain('第一段 & 记号');
    expect(text).toContain('第二段');
    expect(text).not.toContain('color:red');
    expect(text).not.toMatch(/\n\n\n/);
    // paragraphs are separated by a blank line
    expect(text.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });

  it('turns <br> into a line break and strips inline tags', () => {
    const text = htmlToText('<body><p>行一<br/>行二 <em>重点</em></p></body>');
    expect(text).toBe('行一\n行二 重点');
  });
});

describe('extractHeading', () => {
  it('prefers the first h1–h3 over the title', () => {
    expect(extractHeading('<html><head><title>Doc</title></head><body><h2>  章节  A </h2></body></html>')).toBe('章节 A');
    expect(extractHeading('<html><head><title>Only Title</title></head><body><p>x</p></body></html>')).toBe('Only Title');
    expect(extractHeading('<body><p>no heading</p></body>')).toBe('');
  });
});

describe('buildTxt', () => {
  const chapters = [
    { title: '第一章', body: '正文一' },
    { title: '第二章', body: '正文二' },
  ];

  it('adds a header and per-chapter titles when enabled', () => {
    const out = buildTxt({ title: '测试书', author: '作者', chapters, opts: { includeHeader: true, includeTitles: true } });
    expect(out.startsWith('测试书\n作者\n')).toBe(true);
    expect(out).toContain('第一章\n\n正文一');
    expect(out).toContain('第二章\n\n正文二');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('omits header and titles when disabled', () => {
    const out = buildTxt({ title: 'T', author: 'A', chapters, opts: { includeHeader: false, includeTitles: false } });
    expect(out).not.toContain('T');
    expect(out).not.toContain('第一章');
    expect(out).toBe('正文一\n\n正文二\n');
  });

  it('returns empty string when nothing survives', () => {
    expect(buildTxt({ title: '', author: '', chapters: [], opts: { includeHeader: true, includeTitles: true } })).toBe('');
  });
});
