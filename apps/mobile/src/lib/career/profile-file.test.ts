import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  IMPORT_TEXT_MAX,
  RESUME_FILE_MAX_BYTES,
  RESUME_PICKER_TYPES,
  ResumeFileError,
  checkResumeFile,
  docxXmlToText,
  extractDocxText,
  extractResumeFile,
  resumeFileErrorMessage,
  resumeFileKind,
  type ResumeFileReader,
} from './profile';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

async function docx(body: string, options: { mainPart?: string } = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  const part = options.mainPart ?? 'word/document.xml';
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>`,
  );
  zip.file(part, documentXml(body));
  return zip.generateAsync({ type: 'uint8array' });
}

const para = (...runs: string[]) => `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>${runs.join('')}</w:p>`;
const run = (text: string) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;

function reader(bytes: Uint8Array | null, text = ''): ResumeFileReader {
  return {
    bytes: async () => {
      if (!bytes) throw new Error('unreadable');
      return bytes;
    },
    text: async () => text,
  };
}

describe('resume file: type and size checks', () => {
  it('recognises DOCX and plain text by name or MIME type, and PDF so it can be explained', () => {
    expect(resumeFileKind({ name: 'CV.DOCX' })).toBe('docx');
    expect(resumeFileKind({ name: 'cv', mimeType: DOCX })).toBe('docx');
    expect(resumeFileKind({ name: 'cv.txt' })).toBe('text');
    expect(resumeFileKind({ name: 'cv', mimeType: 'text/plain; charset=utf-8' })).toBe('text');
    expect(resumeFileKind({ name: 'cv.pdf', mimeType: 'application/octet-stream' })).toBe('pdf');
    expect(resumeFileKind({ name: 'cv.doc', mimeType: 'application/msword' })).toBeNull();
    expect(RESUME_PICKER_TYPES).toEqual([DOCX, 'text/plain', 'application/pdf']);
  });

  it('checks the size first (5 MB, as the web), then the type', () => {
    expect(RESUME_FILE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(checkResumeFile({ name: 'cv.docx', size: RESUME_FILE_MAX_BYTES })).toEqual({ ok: true, format: 'docx' });
    expect(checkResumeFile({ name: 'cv.docx', size: RESUME_FILE_MAX_BYTES + 1 })).toEqual({ ok: false, code: 'too_large' });
    expect(checkResumeFile({ name: 'cv.png', size: RESUME_FILE_MAX_BYTES + 1 })).toEqual({ ok: false, code: 'too_large' });
    expect(checkResumeFile({ name: 'cv.pdf', size: 10 })).toEqual({ ok: false, code: 'pdf' });
    expect(checkResumeFile({ name: 'cv.png' })).toEqual({ ok: false, code: 'unsupported' });
    expect(checkResumeFile({ name: 'notes.txt' })).toEqual({ ok: true, format: 'text' });
  });

  it('uses the web wording for size, empty and unreadable files, and explains PDF', () => {
    expect(resumeFileErrorMessage('too_large')).toBe('That file is over 5 MB.');
    expect(resumeFileErrorMessage('empty')).toBe('No text could be read from that file.');
    expect(resumeFileErrorMessage('failed')).toBe('That file could not be read.');
    expect(resumeFileErrorMessage('unsupported')).toBe('Choose a DOCX or plain text (.txt) file.');
    expect(resumeFileErrorMessage('pdf')).toMatch(/PDF files can’t be read on the phone/);
    expect(resumeFileErrorMessage('pdf')).toMatch(/website/);
    expect(resumeFileErrorMessage('pdf')).toMatch(/paste/);
    expect(resumeFileErrorMessage('too_long')).toMatch(/100,000/);
  });
});

describe('resume file: DOCX text', () => {
  it('reads paragraphs like mammoth extractRawText (paragraph + blank line, tabs), keeping line breaks', () => {
    const xml = documentXml(
      para(run('Jane '), run('Doe')) +
        para(run('Senior'), '<w:r><w:tab/></w:r>', run('Engineer')) +
        para(run('Line one'), '<w:r><w:br/></w:r>', run('Line two')) +
        '<w:p/>' +
        para(run('A &amp; B &lt;C&gt; &#233;&#x00E9;')),
    );
    expect(docxXmlToText(xml)).toBe('Jane Doe\n\nSenior\tEngineer\n\nLine one\nLine two\n\n\n\nA & B <C> éé\n\n');
  });

  it('ignores tab stops, deleted text, field codes and the duplicate mc:Choice branch', () => {
    const xml = documentXml(
      para(
        run('Kept'),
        '<w:del><w:r><w:delText>Gone</w:delText></w:r></w:del>',
        '<w:r><w:instrText> HYPERLINK "x" </w:instrText></w:r>',
        '<w:hyperlink><w:r><w:t>Link</w:t></w:r></w:hyperlink>',
        '<mc:AlternateContent><mc:Choice Requires="wps"><w:r><w:t>Twice</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t>Once</w:t></w:r></mc:Fallback></mc:AlternateContent>',
      ),
    );
    expect(docxXmlToText(xml)).toBe('KeptLinkOnce\n\n');
  });

  it('reads table cells as paragraphs', () => {
    const xml = documentXml(`<w:tbl><w:tr><w:tc>${para(run('Cell 1'))}</w:tc><w:tc>${para(run('Cell 2'))}</w:tc></w:tr></w:tbl>`);
    expect(docxXmlToText(xml)).toBe('Cell 1\n\nCell 2\n\n');
  });

  it('opens the zip and follows the main part named in _rels/.rels', async () => {
    expect(await extractDocxText(await docx(para(run('Hello'))))).toBe('Hello\n\n');
    expect(await extractDocxText(await docx(para(run('Moved')), { mainPart: 'word/document2.xml' }))).toBe('Moved\n\n');
  });

  it('refuses a file that is not a DOCX zip', async () => {
    await expect(extractDocxText(new TextEncoder().encode('not a zip'))).rejects.toMatchObject({ code: 'failed' });
    const empty = await new JSZip().generateAsync({ type: 'uint8array' });
    await expect(extractDocxText(empty)).rejects.toBeInstanceOf(ResumeFileError);
  });
});

describe('resume file: extraction end to end', () => {
  it('returns cleaned DOCX text with format and file name for importResume', async () => {
    const bytes = await docx(para(run('Jane Doe   ')) + para(run('Engineer')));
    await expect(extractResumeFile({ name: 'Jane CV.docx', mimeType: DOCX, size: bytes.byteLength }, reader(bytes))).resolves.toEqual({
      text: 'Jane Doe\n\nEngineer',
      format: 'docx',
      fileName: 'Jane CV.docx',
    });
  });

  it('reads plain text as is (BOM and CRLF cleaned)', async () => {
    await expect(extractResumeFile({ name: 'cv.txt', mimeType: 'text/plain' }, reader(null, '﻿Jane\r\nDev  \n'))).resolves.toEqual({
      text: 'Jane\nDev',
      format: 'text',
      fileName: 'cv.txt',
    });
  });

  it('refuses PDF before reading it', async () => {
    let read = false;
    const spy: ResumeFileReader = {
      bytes: async () => {
        read = true;
        return new Uint8Array();
      },
      text: async () => {
        read = true;
        return '';
      },
    };
    await expect(extractResumeFile({ name: 'cv.pdf', mimeType: 'application/pdf', size: 100 }, spy)).rejects.toMatchObject({ code: 'pdf' });
    expect(read).toBe(false);
  });

  it('maps unreadable, empty, oversized and too-long files to their codes', async () => {
    await expect(extractResumeFile({ name: 'cv.docx' }, reader(null))).rejects.toMatchObject({ code: 'failed' });
    await expect(extractResumeFile({ name: 'cv.docx' }, reader(await docx('<w:p/>')))).rejects.toMatchObject({ code: 'empty' });
    await expect(extractResumeFile({ name: 'cv.txt' }, reader(null, '  \n '))).rejects.toMatchObject({ code: 'empty' });
    await expect(extractResumeFile({ name: 'cv.docx' }, reader(new Uint8Array(RESUME_FILE_MAX_BYTES + 1)))).rejects.toMatchObject({ code: 'too_large' });
    await expect(extractResumeFile({ name: 'cv.txt' }, reader(null, 'x'.repeat(IMPORT_TEXT_MAX + 1)))).rejects.toMatchObject({ code: 'too_long' });
    await expect(extractResumeFile({ name: 'cv.odt' }, reader(null, 'x'))).rejects.toMatchObject({ code: 'unsupported' });
  });
});
