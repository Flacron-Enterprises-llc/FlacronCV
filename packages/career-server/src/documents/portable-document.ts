import {
  DOCUMENT_FONT_STACK,
  PDF_EDITORIAL_RAIL,
  PDF_MARGIN,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  PDF_SIDEBAR_WIDTH,
  PDF_STRUCTURED_RULE_X,
  RESUME_WATERMARK,
  hexToRgb01,
  resumeLanguage,
} from '@flacroncv/career-shared';
import type { ResumeLayoutFamily } from '@flacroncv/career-shared';

export type PdfRole = 'name' | 'role' | 'contact' | 'heading' | 'job' | 'meta' | 'bullet' | 'body' | 'watermark';

export interface PdfLine {
  role: PdfRole;
  text: string;
  /** Lines with the same paragraph id belong together (a letter paragraph's own line breaks). */
  paragraph?: number;
}

export interface PageChrome {
  family: ResumeLayoutFamily | 'letter';
  accent: string;
  letterHeader?: 'letterhead' | 'band' | 'plain' | 'rail' | 'block' | 'rule' | 'masthead' | 'split';
}

/** Windows-1252 code points 0x80–0x9F (Helvetica's WinAnsiEncoding). Includes French œ/Œ and bullets. */
const WINANSI_PUNCTUATION: Record<string, number> = {
  '\u20AC': 128,
  '\u201A': 130,
  '\u0192': 131,
  '\u201E': 132,
  '\u2026': 133,
  '\u2020': 134,
  '\u2021': 135,
  '\u02C6': 136,
  '\u2030': 137,
  '\u0160': 138,
  '\u2039': 139,
  '\u0152': 140,
  '\u017D': 142,
  '\u2018': 145,
  '\u2019': 146,
  '\u201C': 147,
  '\u201D': 148,
  '\u2022': 149,
  '\u2013': 150,
  '\u2014': 151,
  '\u02DC': 152,
  '\u2122': 153,
  '\u0161': 154,
  '\u203A': 155,
  '\u0153': 156,
  '\u017E': 158,
  '\u0178': 159,
  '\u00A0': 160,
};

export function pdfString(value: string): string {
  let out = '';
  for (const char of value) {
    const mapped = WINANSI_PUNCTUATION[char];
    const code = mapped ?? char.codePointAt(0) ?? 63;
    if (char === '\\' || char === '(' || char === ')') out += `\\${char}`;
    else if (code >= 32 && code <= 126) out += char;
    else if (code <= 255) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

export function wrapPdfLines(lines: string[], maxChars: number): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= maxChars) {
      wrapped.push(line);
      continue;
    }
    let rest = line;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars + 1);
      let cut = window.lastIndexOf(' ');
      // Break at a space unless it would leave a very short line; narrow columns used to cut mid-word.
      if (cut < Math.min(40, Math.floor(maxChars / 2))) cut = maxChars;
      wrapped.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) wrapped.push(rest);
  }
  return wrapped;
}

function sizeFor(role: PdfRole): number {
  if (role === 'name') return 16;
  if (role === 'heading') return 10;
  if (role === 'role') return 10;
  if (role === 'contact' || role === 'meta' || role === 'watermark') return 9;
  if (role === 'bullet') return 10;
  return 11;
}

/** Space above each heading after the first line of a page, and the bottom margin pages stop at. */
const HEADING_GAP = 8;
const PDF_BOTTOM = 56;

function leadingFor(role: PdfRole): number {
  if (role === 'heading') return 18;
  if (role === 'name') return 20;
  return 14;
}

/** Extra space between letter paragraphs. */
const PARAGRAPH_GAP = 8;

function wrapFor(role: PdfRole, text: string, maxChars: number): string[] {
  const width = role === 'heading' || role === 'name' ? Math.max(40, maxChars - 8) : maxChars;
  // A date range in a narrow column breaks at its dash: "janv. 2021 –" / "juin 2024".
  if (role === 'meta' && text.length > width && text.includes(' – ')) {
    const [from, ...to] = text.split(' – ');
    return [...wrapPdfLines([`${from} –`], width), ...wrapPdfLines([to.join(' – ')], width)];
  }
  return wrapPdfLines([text], width);
}

export function renderPdf(lines: PdfLine[], chrome: PageChrome): Buffer {
  const sidebar = chrome.family === 'sidebar' || chrome.letterHeader === 'rail';
  const topbar = chrome.family === 'topbar' || chrome.letterHeader === 'band';
  const editorial = chrome.family === 'editorial' || chrome.letterHeader === 'masthead';
  const structured = chrome.family === 'structured' || chrome.letterHeader === 'split';
  const left = sidebar
    ? PDF_SIDEBAR_WIDTH + 28
    : editorial
      ? PDF_EDITORIAL_RAIL + 22
      : structured
        ? PDF_STRUCTURED_RULE_X + 14
        : PDF_MARGIN;
  // Band templates paint 720–792; the white name sits inside the band and the body starts below it at 690.
  const startY = topbar ? 690 : chrome.family === 'slate-gold' ? 730 : 748;
  const bandNameY = 748;
  const accent = hexToRgb01(chrome.accent);
  const letter = chrome.family === 'letter' || chrome.letterHeader !== undefined;
  const expanded: Array<PdfLine & { group: number }> = [];
  lines.forEach((line, sourceIndex) => {
    const group = line.paragraph ?? sourceIndex;
    const maxChars =
      structured && line.role === 'meta'
        ? 16
        : sidebar
          ? 64
          : structured
            ? 72
            : editorial
              ? 82
              : 90;
    for (const text of wrapFor(line.role, line.text, maxChars)) expanded.push({ ...line, text, group });
  });
  // Paginate by measured height, not a fixed line count. Band and top-rule chrome sit on page 1 only,
  // so continuation pages start near the top.
  const continuationTop = topbar || chrome.family === 'slate-gold' ? 748 : startY;
  const inBand = (line: PdfLine, pageIndex: number, lineIndex: number) =>
    topbar && pageIndex === 0 && lineIndex === 0 && (line.role === 'name' || line.role === 'role' || line.role === 'contact');
  const gapBefore = (line: (typeof expanded)[number], previous: (typeof expanded)[number] | undefined) => {
    if (!previous) return 0;
    if (line.role === 'heading') return HEADING_GAP;
    if (letter && line.role === 'body' && previous.group !== line.group) return PARAGRAPH_GAP;
    return 0;
  };
  const heightOf = (line: (typeof expanded)[number], previous: (typeof expanded)[number] | undefined, banded: boolean) => {
    if (banded) return 0;
    if (structured && line.role === 'meta' && line.text.length <= 18) return 0;
    return gapBefore(line, previous) + leadingFor(line.role);
  };
  // Units keep wrapped lines of one item together, and a heading or entry title with the dates and text after it.
  const units: Array<typeof expanded> = [];
  for (let i = 0; i < expanded.length; ) {
    const unit: typeof expanded = [];
    let open = true;
    while (i < expanded.length && open) {
      const group = expanded[i]?.group;
      while (i < expanded.length && expanded[i]?.group === group) unit.push(expanded[i++]!);
      const role = unit[unit.length - 1]?.role;
      // Dates only pull in their own description, never the next entry's title.
      open = role === 'heading' || role === 'job' || role === 'name' || (role === 'meta' && expanded[i]?.role === 'body');
    }
    units.push(unit);
  }
  const pageRoom = continuationTop - PDF_BOTTOM;
  const chunks: Array<typeof expanded> = [];
  let current: typeof expanded = [];
  let room = startY - PDF_BOTTOM;
  const place = (line: (typeof expanded)[number]) => {
    room -= heightOf(line, current[current.length - 1], inBand(line, chunks.length, current.length));
    current.push(line);
  };
  for (const unit of units) {
    const unitHeight = unit.reduce((sum, line, k) => sum + heightOf(line, k === 0 ? current[current.length - 1] : unit[k - 1], false), 0);
    // Move a whole unit when it fits on a fresh page; only very long items are split line by line.
    if (current.length > 0 && unitHeight > room && unitHeight <= pageRoom * 0.5) {
      chunks.push(current);
      current = [];
      room = pageRoom;
    }
    for (const line of unit) {
      if (current.length > 0 && heightOf(line, current[current.length - 1], false) > room) {
        chunks.push(current);
        current = [];
        room = pageRoom;
      }
      place(line);
    }
  }
  if (current.length > 0) chunks.push(current);
  if (chunks.length === 0) chunks.push([{ role: 'body', text: '', group: 0 }]);

  const objects: Buffer[] = [];
  const pageIds: number[] = [];
  const fontId = 3 + chunks.length * 2;
  const boldId = fontId + 1;
  objects.push(Buffer.from('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'));
  chunks.forEach((chunk, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const chromeCmds: string[] = [];
    if (sidebar) {
      chromeCmds.push(`${fmt(accent.r)} ${fmt(accent.g)} ${fmt(accent.b)} rg`, `0 0 ${PDF_SIDEBAR_WIDTH} ${PDF_PAGE_HEIGHT} re`, 'f');
    }
    if (editorial) {
      chromeCmds.push(`${fmt(accent.r)} ${fmt(accent.g)} ${fmt(accent.b)} rg`, `0 0 ${PDF_EDITORIAL_RAIL} ${PDF_PAGE_HEIGHT} re`, 'f');
    }
    if (structured) {
      chromeCmds.push('0.82 0.86 0.9 rg', `${PDF_STRUCTURED_RULE_X} 48 1.1 700 re`, 'f');
    }
    if (topbar && index === 0) {
      chromeCmds.push(
        `${fmt(accent.r)} ${fmt(accent.g)} ${fmt(accent.b)} rg`,
        `0 720 ${PDF_PAGE_WIDTH} 72 re`,
        'f',
        '1 0.29 0 rg',
        `0 716 ${PDF_PAGE_WIDTH} 4 re`,
        'f',
      );
    }
    if ((chrome.family === 'slate-gold' || chrome.letterHeader === 'rule') && index === 0) {
      chromeCmds.push(`${fmt(accent.r)} ${fmt(accent.g)} ${fmt(accent.b)} rg`, `${PDF_MARGIN} 748 504 1.5 re`, 'f');
    }
    const commands = [...chromeCmds];
    let y = index === 0 ? startY : continuationTop;
    let lastJobY: number | null = null;
    let metaOffset = 0;
    chunk.forEach((line, lineIndex) => {
      const size = sizeFor(line.role);
      const bold = line.role === 'name' || line.role === 'heading' || line.role === 'job';
      // White text only inside the coloured band. Sidebar templates draw the name in the white main column.
      const white = inBand(line, index, lineIndex);
      const color = white
        ? '1 1 1 rg'
        : line.role === 'heading' || (editorial && line.role === 'name')
          ? `${fmt(accent.r)} ${fmt(accent.g)} ${fmt(accent.b)} rg`
          : '0 0 0 rg';
      const leading = leadingFor(line.role);
      y -= gapBefore(line, chunk[lineIndex - 1]);
      const dateColumn = structured && line.role === 'meta' && lastJobY != null && line.text.length <= 18;
      const x = dateColumn ? PDF_MARGIN : left;
      const lineY = dateColumn && lastJobY != null ? lastJobY - metaOffset : topbar && white ? bandNameY : y;
      commands.push('BT', bold ? `/F2 ${size} Tf` : `/F1 ${size} Tf`, color, `${x} ${lineY} Td`, `(${pdfString(line.text)}) Tj`, 'ET');
      if (line.role === 'job') {
        lastJobY = y;
        metaOffset = 0;
      }
      if (dateColumn) metaOffset += 11;
      else if (!(topbar && white)) y -= leading;
    });
    const stream = commands.join('\n');
    objects.push(
      Buffer.from(
        `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> >> endobj\n`,
      ),
    );
    objects.push(Buffer.from(`${contentId} 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj\n`));
  });
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const pages = Buffer.from(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >> endobj\n`);
  objects.push(
    Buffer.from(`${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n`),
  );
  objects.push(
    Buffer.from(`${boldId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj\n`),
  );
  const header = Buffer.from('%PDF-1.4\n');
  const ordered = [objects[0], pages, ...objects.slice(1)];
  let offset = header.length;
  const offsets: number[] = [];
  const body = ordered.map((object) => {
    offsets.push(offset);
    offset += object.length;
    return object;
  });
  let xref = `xref\n0 ${ordered.length + 1}\n0000000000 65535 f \n`;
  for (const start of offsets) xref += `${start.toString().padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer << /Size ${ordered.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.concat([header, ...body, Buffer.from(xref + trailer)]);
}

function fmt(value: number): string {
  return value.toFixed(2);
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderDocx(lines: PdfLine[], watermark: boolean, language?: string): Buffer {
  const extra = watermark ? [...lines, { role: 'watermark' as const, text: RESUME_WATERMARK[resumeLanguage(language)] }] : lines;
  const paragraphs = extra
    .map((line, index) => {
      const size = sizeFor(line.role) * 2;
      const bold = line.role === 'name' || line.role === 'heading' || line.role === 'job';
      const previous = index > 0 ? extra[index - 1] : undefined;
      // Space above headings, and between letter paragraphs, but not inside one (e.g. sign-off and name).
      const newParagraph = line.role === 'body' && previous?.role === 'body' && line.paragraph !== undefined && previous.paragraph !== line.paragraph;
      const before = previous && (line.role === 'heading' || newParagraph) ? 160 : 0;
      const props = before ? `<w:pPr><w:spacing w:before="${before}"/></w:pPr>` : '';
      const run = `<w:r><w:rPr><w:sz w:val="${size}"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(line.text)}</w:t></w:r>`;
      return `<w:p>${props}${run}</w:p>`;
    })
    .join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      ),
    },
    { name: 'word/document.xml', data: Buffer.from(document) },
    {
      name: 'word/_rels/document.xml.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
      ),
    },
  ]);
}

export function exportFileName(title: string, extension: 'pdf' | 'docx' | 'txt'): string {
  const base = title.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  return `${base.slice(0, 80)}.${extension}`;
}

export function zipStore(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}

export { DOCUMENT_FONT_STACK };
