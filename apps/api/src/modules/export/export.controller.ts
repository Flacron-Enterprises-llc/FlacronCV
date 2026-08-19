import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExportService } from './export.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FeatureFlagGuard, RequireFeature } from '../../common/guards/feature-flag.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';

@ApiTags('export')
@Controller()
@UseGuards(FirebaseAuthGuard, FeatureFlagGuard)
@RequireFeature('exportsEnabled')
@ApiBearerAuth()
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly audit: AuditService,
  ) {}

  /** Record a completed export against the acting user. */
  private recordAudit(
    user: FirebaseUser,
    documentType: 'cv' | 'cover_letter',
    documentId: string,
    format: 'pdf' | 'docx',
  ) {
    return this.audit.logUserAction(
      AuditAction.DOCUMENT_EXPORTED,
      { uid: user.uid, email: user.email, role: (user as Record<string, unknown>).role as string },
      documentType,
      documentId,
      { metadata: { format } },
    );
  }

  @Post('cvs/:id/export/pdf')
  async exportCVPdf(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    const result = await this.exportService.exportCVToPDF(id, user.uid);
    await this.recordAudit(user, 'cv', id, 'pdf');
    return result;
  }

  @Post('cvs/:id/export/docx')
  async exportCVDocx(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    const result = await this.exportService.exportCVToDocx(id, user.uid);
    await this.recordAudit(user, 'cv', id, 'docx');
    return result;
  }

  @Post('cover-letters/:id/export/pdf')
  async exportCoverLetterPdf(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    const result = await this.exportService.exportCoverLetterToPDF(id, user.uid);
    await this.recordAudit(user, 'cover_letter', id, 'pdf');
    return result;
  }

  @Post('cover-letters/:id/export/docx')
  async exportCoverLetterDocx(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    const result = await this.exportService.exportCoverLetterToDocx(id, user.uid);
    await this.recordAudit(user, 'cover_letter', id, 'docx');
    return result;
  }

  /**
   * Reserve one export against the acting user (DOCX-is-paid + quota). Does
   * **not** write DOCUMENT_EXPORTED — that happens on {@link confirmExport}
   * after the browser actually produces the file. Failed renders must call
   * {@link refundExport} with the returned `reservationId`.
   */
  @Post('exports/record')
  async recordExport(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { format?: 'pdf' | 'docx'; type?: 'cv' | 'cover_letter'; documentId?: string },
  ) {
    const format = body?.format === 'docx' ? 'docx' : 'pdf';
    return this.exportService.recordClientExport(user.uid, format);
  }

  /**
   * Client finished producing the file. Marks the reservation consumed and
   * writes DOCUMENT_EXPORTED once. Idempotent for retries.
   */
  @Post('exports/confirm')
  async confirmExport(
    @CurrentUser() user: FirebaseUser,
    @Body()
    body: {
      reservationId?: string;
      format?: 'pdf' | 'docx';
      type?: 'cv' | 'cover_letter';
      documentId?: string;
    },
  ) {
    const reservationId = typeof body?.reservationId === 'string' ? body.reservationId : '';
    const outcome = await this.exportService.confirmClientExport(user.uid, reservationId);
    if (outcome === 'confirmed') {
      const format = body?.format === 'docx' ? 'docx' : 'pdf';
      await this.recordAudit(
        user,
        body?.type === 'cover_letter' ? 'cover_letter' : 'cv',
        body?.documentId || 'client-generated',
        format,
      );
    }
    return { ok: outcome === 'confirmed' || outcome === 'already_consumed', outcome };
  }

  /**
   * Dedicated refund — never a flag on /exports/record. Idempotent: a double
   * catch or retry with the same reservationId refunds at most once and never
   * takes exportsThisMonth below zero.
   */
  @Post('exports/refund')
  async refundExport(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { reservationId?: string },
  ) {
    const reservationId = typeof body?.reservationId === 'string' ? body.reservationId : '';
    return this.exportService.refundClientExport(user.uid, reservationId);
  }
}
