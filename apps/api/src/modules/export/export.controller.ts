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

  // Server-authorized gate for the browser-generated export flow: enforces the
  // DOCX paid-feature rule + monthly export quota and records usage. The client
  // calls this before generating the file client-side.
  @Post('exports/record')
  async recordExport(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { format?: 'pdf' | 'docx'; type?: 'cv' | 'cover_letter'; documentId?: string },
  ) {
    const format = body?.format === 'docx' ? 'docx' : 'pdf';
    const decision = await this.exportService.recordClientExport(user.uid, format);
    // Only an ALLOWED export is a real export; a paywalled attempt is not one.
    // This is the path virtually every export takes (the file itself is
    // generated in the browser), so without it the audit trail would show
    // almost no export activity at all.
    if (decision.allowed) {
      await this.recordAudit(
        user,
        body?.type === 'cover_letter' ? 'cover_letter' : 'cv',
        body?.documentId || 'client-generated',
        format,
      );
    }
    return decision;
  }
}
