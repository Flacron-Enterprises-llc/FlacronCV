import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CVService } from '../cv/cv.service';
import { CoverLetterService } from '../cover-letter/cover-letter.service';
import { UsersService } from '../users/users.service';
import { AbuseService } from '../abuse/abuse.service';
import {
  PLAN_CONFIGS,
  PlanLimits,
  SubscriptionPlan,
  resolveEffectivePlan,
  type User,
} from '@flacroncv/shared-types';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  allowPrintSubresource,
  safeColor,
  safeFontFamily,
  safeFontSize,
  sanitizePrintHtml,
} from './print-html';
import {
  type CvPhoto,
  cvPhotoDataUri,
  cvPhotoDimensions,
  fetchCvPhoto,
} from './cv-photo';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Same as the web's `formatCVDate`: "2021-01" → "Jan 2021"; other text unchanged. */
export function formatCVDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present') return 'Present';
  const ym = /^(\d{4})-(\d{2})$/.exec(s);
  if (ym) {
    const m = parseInt(ym[2], 10);
    if (m >= 1 && m <= 12) return `${MONTH_NAMES[m - 1]} ${ym[1]}`;
  }
  return s;
}

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Address, "city postal" and country — the web's `locationLine`. Returns null
 * when the CV has neither address nor postal code, so callers keep the old
 * "city, country" text byte-for-byte for those CVs.
 */
function extendedLocation(pi: Record<string, unknown> | undefined): string | null {
  if (!pi || (!hasText(pi.address) && !hasText(pi.postalCode))) return null;
  const cityPostal = [pi.city, pi.postalCode].filter(hasText).join(' ');
  return [pi.address, cityPostal, pi.country].filter(hasText).join(', ');
}

function textList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(hasText).map((s) => s.trim()) : [];
}

/** Hex colour for docx (no '#', 6 digits), or undefined when not a valid colour. */
function docxColor(value: unknown): string | undefined {
  const c = safeColor(value, '');
  if (!c) return undefined;
  const hex = c.slice(1);
  return hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
}

/**
 * The extra lines a generic (name/title-only) item gains from fields the
 * mobile app edits. Empty for items without them, so their output is unchanged.
 */
function genericItemExtras(
  sectionType: unknown,
  item: Record<string, unknown>,
): { date: string; subtitle: string; lines: string[] } {
  const out = { date: '', subtitle: '', lines: [] as string[] };
  if (sectionType === 'custom') {
    out.date = formatCVDate(item.date);
    if (hasText(item.subtitle)) out.subtitle = item.subtitle.trim();
  } else if (sectionType === 'certifications') {
    const expiry = formatCVDate(item.expiryDate);
    if (expiry) out.lines.push(`Expires ${expiry}`);
    if (hasText(item.url)) out.lines.push(item.url.trim());
  }
  return out;
}

/**
 * A reference entry's lines, empty ones dropped — the same as the web's
 * `referenceLines`: name, "title, company", "email · phone", relationship.
 */
export function referenceLines(item: Record<string, unknown> | null | undefined): {
  name: string;
  role: string;
  contact: string;
  relationship: string;
} {
  const it = item ?? {};
  const txt = (v: unknown) => (hasText(v) ? v.trim() : '');
  return {
    name: txt(it.name),
    role: [txt(it.title), txt(it.company)].filter(Boolean).join(', '),
    contact: [txt(it.email), txt(it.phone)].filter(Boolean).join(' · '),
    relationship: txt(it.relationship),
  };
}

/**
 * The small attribution Free exports carry (`limits.removeBranding === false`).
 * Rendered by Chromium in the bottom page margin of a server-side PDF, so it
 * never overlaps the document. Paid plans (and every legacy plan) pass false.
 */
export const EXPORT_BRANDING_TEXT = 'Made with FlacronCV';

export function brandedPdfOptions(removeBranding: boolean): Record<string, unknown> {
  if (removeBranding) return {};
  return {
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;text-align:center;font-family:Arial,sans-serif;font-size:7px;color:#9ca3af;">' +
      EXPORT_BRANDING_TEXT +
      '</div>',
  };
}

/** Cadence follows the plan: Free never resets, paid numeric caps are monthly. */
export function exportLimitReachedMessage(
  plan: SubscriptionPlan,
  limit: number,
): string {
  const cadence = plan === SubscriptionPlan.FREE ? '' : '/month';
  return `Export limit reached for your plan (${limit}${cadence}). Please upgrade.`;
}

// Simple semaphore to cap concurrent Puppeteer processes
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.running < this.max) { this.running++; return; }
    return new Promise((resolve) => this.queue.push(resolve));
  }
  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) { this.running++; next(); }
  }
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();
  private readonly exportSemaphore = new Semaphore(3); // max 3 concurrent Puppeteer instances

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private cvService: CVService,
    private coverLetterService: CoverLetterService,
    private usersService: UsersService,
    private abuse: AbuseService,
  ) {
    this.loadTemplates();
  }

  /** Throws when the plan's export cap is reached; returns the plan's limits otherwise. */
  private async checkExportLimit(userId: string): Promise<PlanLimits> {
    await this.abuse.assertNewConsumption(userId, 'export');
    const user = await this.usersService.findByIdOrThrow(userId);
    const plan = resolveEffectivePlan(user.subscription);
    const limits = PLAN_CONFIGS[plan].limits;
    if (limits.exports !== 'unlimited' && user.usage.exportsThisMonth >= limits.exports) {
      throw new ForbiddenException(exportLimitReachedMessage(plan, limits.exports));
    }
    return limits;
  }

  private async checkDocxAccess(userId: string): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(userId);
    // `docxExport` is false only on Free — the same rule as before, now read
    // from the plan so every plan id (current and legacy) is covered.
    if (!PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits.docxExport) {
      throw new ForbiddenException(
        'DOCX export is not available on the free plan. Please upgrade to Pro or Enterprise.',
      );
    }
  }

  /**
   * Server-authorized gate for the CLIENT-SIDE export flow. Because the CV /
   * cover-letter file is rendered in the browser (html2canvas/jsPDF/docx), the
   * client calls this FIRST and only proceeds to generate when { allowed: true }.
   *
   * Charge is a transactional **reserve** (same class as {@link UsersService.reserveAiCredit}):
   * limit check + `exportsThisMonth` increment + reservation doc in one commit.
   * On render failure the client must call {@link refundClientExport} with the
   * returned `reservationId`; on success, {@link confirmClientExport} (audit only).
   * A bare check-then-increment would race under concurrency and leave failed
   * renders charged with no refund identity.
   */
  async recordClientExport(
    userId: string,
    format: 'pdf' | 'docx',
  ): Promise<{
    allowed: boolean;
    reason?: 'docx_requires_paid' | 'limit_reached';
    reservationId?: string;
    /** False → the client renders the small "Made with FlacronCV" mark (Free). */
    removeBranding?: boolean;
  }> {
    await this.abuse.assertNewConsumption(userId, 'export');

    const db = this.firebaseAdmin.firestore;
    const userRef = db.collection('users').doc(userId);
    const reservationId = uuidv4();
    const reservationRef = db.collection('export_reservations').doc(reservationId);

    type TxResult =
      | { allowed: true; reservationId: string; removeBranding: boolean }
      | { allowed: false; reason: 'docx_requires_paid' | 'limit_reached' };

    const result: TxResult = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        return { allowed: false, reason: 'limit_reached' };
      }
      const user = snap.data() as {
        subscription?: User['subscription'];
        usage?: { exportsThisMonth?: number };
      };
      const plan = resolveEffectivePlan(user.subscription as User['subscription']);
      const limits = PLAN_CONFIGS[plan].limits;

      if (format === 'docx' && !limits.docxExport) {
        return { allowed: false, reason: 'docx_requires_paid' };
      }
      const used = user.usage?.exportsThisMonth ?? 0;
      if (limits.exports !== 'unlimited' && used >= limits.exports) {
        return { allowed: false, reason: 'limit_reached' };
      }

      tx.update(userRef, {
        'usage.exportsThisMonth': FieldValue.increment(1),
        updatedAt: new Date(),
      });
      tx.set(reservationRef, {
        uid: userId,
        format,
        status: 'reserved',
        createdAt: new Date(),
      });
      return { allowed: true, reservationId, removeBranding: limits.removeBranding };
    });

    if (!result.allowed) {
      return { allowed: false, reason: result.reason };
    }
    return { allowed: true, reservationId: result.reservationId, removeBranding: result.removeBranding };
  }

  /**
   * Idempotent refund for a failed client-side render. Requires the
   * `reservationId` from {@link recordClientExport}. A second call, a retry, or
   * an unknown id is a no-op — never decrements below zero, never refunds a
   * reservation that was already refunded or confirmed (consumed).
   */
  async refundClientExport(
    userId: string,
    reservationId: string,
  ): Promise<{ refunded: boolean }> {
    if (!reservationId || typeof reservationId !== 'string') {
      return { refunded: false };
    }

    const db = this.firebaseAdmin.firestore;
    const userRef = db.collection('users').doc(userId);
    const reservationRef = db.collection('export_reservations').doc(reservationId);

    const refunded: boolean = await db.runTransaction(async (tx: any) => {
      const resSnap = await tx.get(reservationRef);
      if (!resSnap.exists) return false;
      const res = resSnap.data() as { uid?: string; status?: string };
      if (res.uid !== userId) return false;
      if (res.status !== 'reserved') return false; // already refunded or consumed

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        tx.update(reservationRef, { status: 'refunded', refundedAt: new Date() });
        return true; // reservation closed; nothing to decrement
      }
      const used = (userSnap.data() as { usage?: { exportsThisMonth?: number } }).usage
        ?.exportsThisMonth ?? 0;
      if (used > 0) {
        tx.update(userRef, {
          'usage.exportsThisMonth': FieldValue.increment(-1),
          updatedAt: new Date(),
        });
      }
      tx.update(reservationRef, { status: 'refunded', refundedAt: new Date() });
      return true;
    });

    return { refunded };
  }

  /**
   * Mark a successful client-side export. Does **not** change usage (already
   * reserved). Returns `confirmed` only on the reserved→consumed transition so
   * the controller can write DOCUMENT_EXPORTED once; repeats are idempotent.
   */
  async confirmClientExport(
    userId: string,
    reservationId: string,
  ): Promise<'confirmed' | 'already_consumed' | 'invalid'> {
    if (!reservationId || typeof reservationId !== 'string') {
      return 'invalid';
    }

    const db = this.firebaseAdmin.firestore;
    const reservationRef = db.collection('export_reservations').doc(reservationId);

    return db.runTransaction(async (tx: any) => {
      const resSnap = await tx.get(reservationRef);
      if (!resSnap.exists) return 'invalid';
      const res = resSnap.data() as { uid?: string; status?: string };
      if (res.uid !== userId) return 'invalid';
      if (res.status === 'consumed') return 'already_consumed';
      if (res.status !== 'reserved') return 'invalid'; // refunded or unknown
      tx.update(reservationRef, { status: 'consumed', consumedAt: new Date() });
      return 'confirmed';
    });
  }

  private loadTemplates() {
    const templateDir = path.join(__dirname, '..', '..', 'templates', 'cv');
    try {
      if (fs.existsSync(templateDir)) {
        const files = fs.readdirSync(templateDir);
        files.forEach((file) => {
          if (file.endsWith('.hbs')) {
            const name = file.replace('.hbs', '');
            const content = fs.readFileSync(path.join(templateDir, file), 'utf-8');
            this.templates.set(name, Handlebars.compile(content));
            this.logger.log(`Loaded template: ${name}`);
          }
        });
      }
    } catch {
      this.logger.warn('Could not load templates directory');
    }
  }

  async exportCVToPDF(cvId: string, userId: string): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const limits = await this.checkExportLimit(userId);
    const cv = await this.cvService.findByIdOrThrow(cvId, userId);
    const sections = await this.cvService.getSections(cvId);

    // Build HTML from template. The photo is fetched here (allow-listed hosts
    // only) and inlined as data:, so Chromium itself never touches the network.
    const photo = await this.loadCvPhoto(cv);
    const html = this.renderCVHTML(cv, sections, photo);

    // Use Puppeteer for PDF generation — semaphore caps concurrent instances
    await this.exportSemaphore.acquire();
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await this.hardenPrintPage(page);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
        ...brandedPdfOptions(limits.removeBranding),
      });

      // Upload to Firebase Storage
      const fileName = `exports/${userId}/${uuidv4()}.pdf`;
      const file = this.firebaseAdmin.bucket.file(fileName);
      await file.save(Buffer.from(pdfBuffer), {
        metadata: { contentType: 'application/pdf' },
      });

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      await this.usersService.incrementUsage(userId, 'exportsThisMonth');

      return { downloadUrl: url, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
    } finally {
      await browser.close();
      this.exportSemaphore.release();
    }
  }

  async exportCVToDocx(cvId: string, userId: string): Promise<{ downloadUrl: string; expiresAt: Date }> {
    await this.checkDocxAccess(userId);
    await this.checkExportLimit(userId);
    const cv = await this.cvService.findByIdOrThrow(cvId, userId);
    const sections = await this.cvService.getSections(cvId);

    const photo = await this.loadCvPhoto(cv);
    const buffer = await this.buildCVDocx(cv, sections, photo);

    const fileName = `exports/${userId}/${uuidv4()}.docx`;
    const file = this.firebaseAdmin.bucket.file(fileName);
    await file.save(Buffer.from(buffer), {
      metadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });

    await this.usersService.incrementUsage(userId, 'exportsThisMonth');

    return { downloadUrl: url, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  }

  /**
   * The CV photo, when the CV shows one and it can be fetched safely.
   * Never throws: any refusal or failure means "export without the photo".
   */
  private async loadCvPhoto(cv: any): Promise<CvPhoto | null> {
    if (!cv?.styling?.showPhoto || !hasText(cv?.personalInfo?.photoURL)) return null;
    try {
      const result = await fetchCvPhoto(cv.personalInfo.photoURL);
      if (result.ok) return { data: result.data, contentType: result.contentType };
      // The URL is not logged: Firebase download URLs carry an access token.
      this.logger.warn(`CV photo omitted from export (${result.reason})`);
    } catch {
      this.logger.warn('CV photo omitted from export (unexpected)');
    }
    return null;
  }

  private async buildCVDocx(cv: any, sections: any[], photo: CvPhoto | null = null): Promise<Buffer> {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await import('docx');

    const location = extendedLocation(cv.personalInfo);
    const children: any[] = [];

    // Word cannot be relied on for WebP, so only JPEG/PNG are embedded.
    if (photo && (photo.contentType === 'image/jpeg' || photo.contentType === 'image/png')) {
      const dims = cvPhotoDimensions(photo);
      const box = 96;
      const scale = dims ? box / Math.max(dims.width, dims.height) : 1;
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: photo.contentType === 'image/png' ? 'png' : 'jpg',
              data: photo.data,
              transformation: dims
                ? { width: Math.max(1, Math.round(dims.width * scale)), height: Math.max(1, Math.round(dims.height * scale)) }
                : { width: box, height: box },
            }),
          ],
        }),
      );
    }

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${cv.personalInfo.firstName} ${cv.personalInfo.lastName}`,
            bold: true,
            size: 32,
          }),
        ],
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({
        children: [new TextRun({ text: cv.personalInfo.headline, italics: true, size: 24 })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${cv.personalInfo.email} | ${cv.personalInfo.phone} | ${location ?? `${cv.personalInfo.city}, ${cv.personalInfo.country}`}`,
            size: 20,
          }),
        ],
      }),
      new Paragraph({ text: '' }),
    );

    if (cv.personalInfo.summary) {
      children.push(
        new Paragraph({ text: 'Professional Summary', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: cv.personalInfo.summary })] }),
        new Paragraph({ text: '' }),
      );
    }

    for (const section of sections) {
      if (!section.isVisible) continue;
      children.push(
        new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
      );

      for (const item of section.items) {
        const itemRecord = item as unknown as Record<string, unknown>;
        if (section.type === 'references') {
          // Before the experience branch: a reference has a company and would
          // otherwise print "undefined at Acme" / "undefined - Present".
          const ref = referenceLines(itemRecord);
          if (ref.name) children.push(new Paragraph({ children: [new TextRun({ text: ref.name, bold: true })] }));
          if (ref.role) children.push(new Paragraph({ children: [new TextRun({ text: ref.role })] }));
          if (ref.contact) children.push(new Paragraph({ children: [new TextRun({ text: ref.contact, size: 20 })] }));
          if (ref.relationship) {
            children.push(new Paragraph({ children: [new TextRun({ text: ref.relationship, italics: true })] }));
          }
        } else if (itemRecord.company) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${itemRecord.position}`, bold: true }),
                new TextRun({ text: ` at ${itemRecord.company}` }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `${itemRecord.startDate} - ${itemRecord.endDate || 'Present'}`,
                  italics: true,
                }),
              ],
            }),
          );
          if (itemRecord.description) {
            children.push(new Paragraph({ text: itemRecord.description as string }));
          }
          for (const highlight of textList(itemRecord.highlights)) {
            children.push(new Paragraph({ children: [new TextRun({ text: `• ${highlight}` })] }));
          }
        } else if (itemRecord.institution) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${itemRecord.degree} in ${itemRecord.field}`, bold: true }),
                new TextRun({ text: ` - ${itemRecord.institution}` }),
              ],
            }),
          );
        } else if (itemRecord.name) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${itemRecord.name}${itemRecord.level ? ` (${itemRecord.level})` : ''}` })],
            }),
          );
          const extras = genericItemExtras(section.type, itemRecord);
          if (extras.subtitle) {
            children.push(new Paragraph({ children: [new TextRun({ text: extras.subtitle, italics: true })] }));
          }
          for (const line of extras.lines) {
            children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20 })] }));
          }
        } else if (hasText(itemRecord.title)) {
          // Custom entries (title, subtitle, date) — the web DOCX's
          // "title  •  subtitle  |  date". Title-only entries were never in
          // this export, so they stay out to keep existing files unchanged.
          const extras = genericItemExtras(section.type, itemRecord);
          if (extras.subtitle || extras.date) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: itemRecord.title.trim(), bold: true }),
                  ...(extras.subtitle ? [new TextRun({ text: `  •  ${extras.subtitle}` })] : []),
                  ...(extras.date ? [new TextRun({ text: `  |  ${extras.date}`, italics: true })] : []),
                ],
              }),
            );
          }
        }
      }
      children.push(new Paragraph({ text: '' }));
    }

    const doc = new Document({ sections: [{ properties: {}, children }] });
    return Packer.toBuffer(doc);
  }

  /**
   * JavaScript off, and no network except `data:`.
   * The print HTML does not request font files; family names fall back to
   * fonts already on the machine. HTML is allowlisted before this runs.
   */
  private async hardenPrintPage(page: any): Promise<void> {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req: { url: () => string; continue: () => void; abort: () => void }) => {
      if (allowPrintSubresource(req.url())) req.continue();
      else req.abort();
    });
  }

  /** HTML-escape a plaintext value before interpolating it into a template. */
  private esc(v: unknown): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Experience highlights as a bullet list; '' when there are none. */
  private highlightsHtml(item: any): string {
    const highlights = textList(item?.highlights);
    if (!highlights.length) return '';
    return `<ul style="margin: 4px 0 0 18px; font-size: 14px;">${highlights
      .map((h) => `<li>${this.esc(h)}</li>`)
      .join('')}</ul>`;
  }

  /** A name/title-only item, plus the extra fields the mobile app edits. */
  private genericItemHtml(sectionType: unknown, item: any): string {
    const label = this.esc(item.name || item.title || '');
    const extras = genericItemExtras(sectionType, item ?? {});
    if (!extras.date && !extras.subtitle && !extras.lines.length) {
      return `<div class="item"><span class="item-title">${label}</span></div>`;
    }
    const head = extras.date
      ? `<div class="item-header"><span class="item-title">${label}</span><span class="item-date">${this.esc(extras.date)}</span></div>`
      : `<span class="item-title">${label}</span>`;
    const subtitle = extras.subtitle ? `<div class="item-subtitle">${this.esc(extras.subtitle)}</div>` : '';
    const lines = extras.lines.map((l) => `<div class="item-date">${this.esc(l)}</div>`).join('');
    return `<div class="item">${head}${subtitle}${lines}</div>`;
  }

  /**
   * A reference: name (title style), "title, company" and relationship
   * (subtitle style), "email · phone" (date/meta style). Empty lines dropped.
   */
  private referenceItemHtml(item: any): string {
    const ref = referenceLines(item);
    const name = ref.name ? `<span class="item-title">${this.esc(ref.name)}</span>` : '';
    const role = ref.role ? `<div class="item-subtitle">${this.esc(ref.role)}</div>` : '';
    const contact = ref.contact ? `<div class="item-date">${this.esc(ref.contact)}</div>` : '';
    const relationship = ref.relationship ? `<div class="item-subtitle">${this.esc(ref.relationship)}</div>` : '';
    return `<div class="item">${name}${role}${contact}${relationship}</div>`;
  }

  private renderCVHTML(cv: any, sections: any[], photo: CvPhoto | null = null): string {
    const template = this.templates.get(cv.templateId);
    if (template) {
      return template({ cv, sections });
    }

    // Fallback inline template. User text is escaped. Font and color are
    // allowlisted so a styling value cannot close the <style> block.
    const fontFamily = safeFontFamily(cv.styling?.fontFamily);
    const primaryColor = safeColor(cv.styling?.primaryColor);
    const location = extendedLocation(cv.personalInfo);
    // Same placement as the web Classic layout: a 76px circle above the name.
    const photoHtml =
      photo && cv.styling?.showPhoto
        ? `<img src="${this.esc(cvPhotoDataUri(photo))}" alt="" style="width: 76px; height: 76px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 12px; border: 3px solid ${primaryColor};">`
        : '';
    return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${fontFamily}, sans-serif; color: #1a1a1a; line-height: 1.6; padding: 40px; }
  h1 { color: ${primaryColor}; font-size: 28px; margin-bottom: 4px; }
  h2 { color: ${primaryColor}; font-size: 18px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 4px; margin: 20px 0 10px; }
  .header { text-align: center; margin-bottom: 24px; }
  .headline { font-size: 16px; color: #555; margin-bottom: 8px; }
  .contact { font-size: 13px; color: #666; }
  .summary { margin-bottom: 16px; font-size: 14px; }
  .section { margin-bottom: 16px; }
  .item { margin-bottom: 12px; }
  .item-header { display: flex; justify-content: space-between; align-items: baseline; }
  .item-title { font-weight: 600; font-size: 15px; }
  .item-subtitle { color: #555; font-size: 14px; }
  .item-date { color: #888; font-size: 13px; }
  .item-desc { font-size: 14px; margin-top: 4px; }
  .skills-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .skill-tag { background: ${primaryColor}15; color: ${primaryColor}; padding: 4px 12px; border-radius: 4px; font-size: 13px; white-space: nowrap; }
  .skill-level { opacity: 0.7; font-size: 11px; }
</style>
</head>
<body>
  <div class="header">
    ${photoHtml}<h1>${this.esc(cv.personalInfo.firstName)} ${this.esc(cv.personalInfo.lastName)}</h1>
    <div class="headline">${this.esc(cv.personalInfo.headline)}</div>
    <div class="contact">${this.esc(cv.personalInfo.email)} | ${this.esc(cv.personalInfo.phone)} | ${location !== null ? this.esc(location) : `${this.esc(cv.personalInfo.city)}, ${this.esc(cv.personalInfo.country)}`}</div>
  </div>
  ${cv.personalInfo.summary ? `<div class="summary"><h2>Professional Summary</h2><p>${this.esc(cv.personalInfo.summary)}</p></div>` : ''}
  ${sections
    .filter((s: any) => s.isVisible)
    .map((section: any) => {
      let itemsHtml: string;
      if (section.type === 'skills') {
        itemsHtml = `<div class="skills-list">${section.items
          .map((item: any) => `<span class="skill-tag">${this.esc(item.name)}${item.level ? ` <span class="skill-level">${this.esc(item.level)}</span>` : ''}</span>`)
          .join('')}</div>`;
      } else {
        itemsHtml = section.items
          .map((item: any) => {
            // Before the experience branch: a reference has a company too.
            if (section.type === 'references') {
              return this.referenceItemHtml(item);
            }
            if (item.company) {
              return `<div class="item">
              <div class="item-header"><span class="item-title">${this.esc(item.position)}</span><span class="item-date">${this.esc(item.startDate)} - ${this.esc(item.endDate || 'Present')}</span></div>
              <div class="item-subtitle">${this.esc(item.company)}${item.location ? ` | ${this.esc(item.location)}` : ''}</div>
              ${item.description ? `<div class="item-desc">${this.esc(item.description)}</div>` : ''}${this.highlightsHtml(item)}
            </div>`;
            }
            if (item.institution) {
              return `<div class="item">
              <div class="item-header"><span class="item-title">${this.esc(item.degree)} in ${this.esc(item.field)}</span><span class="item-date">${this.esc(item.startDate)} - ${this.esc(item.endDate || 'Present')}</span></div>
              <div class="item-subtitle">${this.esc(item.institution)}</div>
            </div>`;
            }
            return this.genericItemHtml(section.type, item);
          })
          .join('');
      }
      return `<div class="section"><h2>${this.esc(section.title)}</h2>${itemsHtml}</div>`;
    })
    .join('')}
</body>
</html>`;
  }

  async exportCoverLetterToPDF(coverLetterId: string, userId: string): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const limits = await this.checkExportLimit(userId);
    const coverLetter = await this.coverLetterService.findByIdOrThrow(coverLetterId, userId);

    // Build HTML from cover letter
    const html = this.renderCoverLetterHTML(coverLetter);

    // Use Puppeteer for PDF generation — semaphore caps concurrent instances
    await this.exportSemaphore.acquire();
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await this.hardenPrintPage(page);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
        ...brandedPdfOptions(limits.removeBranding),
      });

      // Upload to Firebase Storage
      const fileName = `exports/${userId}/${uuidv4()}.pdf`;
      const file = this.firebaseAdmin.bucket.file(fileName);
      await file.save(Buffer.from(pdfBuffer), {
        metadata: { contentType: 'application/pdf' },
      });

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      await this.usersService.incrementUsage(userId, 'exportsThisMonth');

      return { downloadUrl: url, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
    } finally {
      await browser.close();
      this.exportSemaphore.release();
    }
  }

  async exportCoverLetterToDocx(coverLetterId: string, userId: string): Promise<{ downloadUrl: string; expiresAt: Date }> {
    await this.checkDocxAccess(userId);
    await this.checkExportLimit(userId);
    const coverLetter = await this.coverLetterService.findByIdOrThrow(coverLetterId, userId);

    const buffer = await this.buildCoverLetterDocx(coverLetter);

    const fileName = `exports/${userId}/${uuidv4()}.docx`;
    const file = this.firebaseAdmin.bucket.file(fileName);
    await file.save(Buffer.from(buffer), {
      metadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });

    await this.usersService.incrementUsage(userId, 'exportsThisMonth');

    return { downloadUrl: url, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  }

  private async buildCoverLetterDocx(coverLetter: any): Promise<Buffer> {
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');

    const children: any[] = [];
    const accent = docxColor(coverLetter.styling?.primaryColor);
    const senderName = hasText(coverLetter.styling?.senderName) ? coverLetter.styling.senderName.trim() : '';
    const senderEmail = hasText(coverLetter.styling?.senderEmail) ? coverLetter.styling.senderEmail.trim() : '';

    // Letterhead (web: sender name in the accent, email below in grey).
    if (senderName) {
      children.push(new Paragraph({
        children: [new TextRun({ text: senderName, bold: true, size: 28, ...(accent ? { color: accent } : {}) })],
      }));
    }
    if (senderEmail) {
      children.push(new Paragraph({
        children: [new TextRun({ text: senderEmail, size: 20, color: '555555' })],
      }));
    }
    if (senderName || senderEmail) children.push(new Paragraph({ text: '' }));

    // Add date (top-right aligned)
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    children.push(
      new Paragraph({
        children: [new TextRun({ text: currentDate, size: 22 })],
        alignment: AlignmentType.RIGHT,
      }),
      new Paragraph({ text: '' })
    );

    // Add recipient info if available. Title or address alone also counts (as on
    // the web) — they were silently dropped when name and company were empty.
    if (coverLetter.recipientName || coverLetter.companyName || coverLetter.recipientTitle || coverLetter.companyAddress) {
      if (coverLetter.recipientName) {
        children.push(new Paragraph({
          children: [new TextRun({ text: coverLetter.recipientName, size: 22 })]
        }));
      }
      if (coverLetter.recipientTitle) {
        children.push(new Paragraph({
          children: [new TextRun({ text: coverLetter.recipientTitle, size: 22 })]
        }));
      }
      if (coverLetter.companyName) {
        children.push(new Paragraph({
          children: [new TextRun({ text: coverLetter.companyName, size: 22 })]
        }));
      }
      if (coverLetter.companyAddress) {
        children.push(new Paragraph({
          children: [new TextRun({ text: coverLetter.companyAddress, size: 22 })]
        }));
      }
      children.push(new Paragraph({ text: '' }));
    }

    // Add subject line if job title exists
    if (coverLetter.jobTitle) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `RE: ${coverLetter.jobTitle}`, bold: true, size: 22, ...(accent ? { color: accent } : {}) })],
        }),
        new Paragraph({ text: '' })
      );
    }

    // Parse HTML content and convert to paragraphs
    const contentText: string = coverLetter.content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    const paragraphs = contentText.split('\n').filter(p => p.trim());
    paragraphs.forEach(para => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: para.trim(), size: 22 })],
          spacing: { after: 200 },
        })
      );
    });

    // Sign-off (web SignatureBlock). Only with a sender name, so letters
    // without one keep their existing ending.
    if (senderName) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Sincerely,', size: 22 })], spacing: { before: 240, after: 400 } }),
        new Paragraph({
          children: [new TextRun({ text: senderName, bold: true, size: 22, ...(accent ? { color: accent } : {}) })],
        }),
      );
      if (senderEmail) {
        children.push(new Paragraph({ children: [new TextRun({ text: senderEmail, size: 20, color: '555555' })] }));
      }
    }

    const doc = new Document({ sections: [{ properties: {}, children }] });
    return Packer.toBuffer(doc);
  }

  private renderCoverLetterHTML(coverLetter: any): string {
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const fontFamily = safeFontFamily(coverLetter.styling?.fontFamily);
    const fontSize = safeFontSize(coverLetter.styling?.fontSize);
    const primaryColor = safeColor(coverLetter.styling?.primaryColor);
    const content = sanitizePrintHtml(coverLetter.content);
    const senderName = hasText(coverLetter.styling?.senderName) ? coverLetter.styling.senderName.trim() : '';
    const senderEmail = hasText(coverLetter.styling?.senderEmail) ? coverLetter.styling.senderEmail.trim() : '';
    // Inline styles so letters without a sender keep their existing HTML.
    const letterhead = senderName || senderEmail
      ? `<div style="margin-bottom: 28px;">${senderName ? `<div style="font-weight: 700; font-size: 1.25em; color: ${primaryColor};">${this.esc(senderName)}</div>` : ''}${senderEmail ? `<div style="color: #666; font-size: 0.9em; margin-top: 2px;">${this.esc(senderEmail)}</div>` : ''}</div>`
      : '';
    const signature = senderName
      ? `<div>Sincerely,</div><div style="height: 38px;"></div><div style="font-weight: 600; color: ${primaryColor};">${this.esc(senderName)}</div>${senderEmail ? `<div style="color: #666; font-size: 0.9em; margin-top: 3px;">${this.esc(senderEmail)}</div>` : ''}`
      : '';
    const hasRecipient = Boolean(
      coverLetter.recipientName || coverLetter.companyName || coverLetter.recipientTitle || coverLetter.companyAddress,
    );

    return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ${fontFamily}, sans-serif;
    color: #1a1a1a;
    line-height: 1.6;
    padding: 60px 80px;
    font-size: ${fontSize};
  }
  .date { text-align: right; margin-bottom: 24px; }
  .recipient { margin-bottom: 24px; }
  .recipient-line { margin-bottom: 4px; }
  .subject { font-weight: 600; margin-bottom: 24px; color: ${primaryColor}; }
  .content { margin-bottom: 24px; }
  .content p { margin-bottom: 16px; }
</style>
</head>
<body>
  ${letterhead}<div class="date">${currentDate}</div>
  ${hasRecipient ? `
  <div class="recipient">
    ${coverLetter.recipientName ? `<div class="recipient-line">${this.esc(coverLetter.recipientName)}</div>` : ''}
    ${coverLetter.recipientTitle ? `<div class="recipient-line">${this.esc(coverLetter.recipientTitle)}</div>` : ''}
    ${coverLetter.companyName ? `<div class="recipient-line">${this.esc(coverLetter.companyName)}</div>` : ''}
    ${coverLetter.companyAddress ? `<div class="recipient-line">${this.esc(coverLetter.companyAddress)}</div>` : ''}
  </div>
  ` : ''}
  ${coverLetter.jobTitle ? `<div class="subject">RE: ${this.esc(coverLetter.jobTitle)}</div>` : ''}
  <div class="content">${content}</div>${signature}
</body>
</html>`;
  }
}
