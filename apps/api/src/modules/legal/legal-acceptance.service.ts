import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  LEGAL_ACCEPTANCES_COLLECTION,
  LegalAcceptance,
  RecordLegalAcceptanceData,
} from '@flacroncv/shared-types';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

/**
 * Own-uid legal acceptance. Doc id IS the uid — get/set only, never a query.
 *
 * Email is stored on the document (client schema). It is never written to the
 * logger. A write failure here must not delete the Auth account; the client
 * retries in-session.
 */
@Injectable()
export class LegalAcceptanceService {
  private readonly logger = new Logger(LegalAcceptanceService.name);

  constructor(private readonly firebaseAdmin: FirebaseAdminService) {}

  private get col() {
    return this.firebaseAdmin.firestore.collection(LEGAL_ACCEPTANCES_COLLECTION);
  }

  async record(
    uid: string,
    email: string,
    dto: RecordLegalAcceptanceData,
  ): Promise<LegalAcceptance> {
    if (!uid) {
      throw new BadRequestException('uid is required');
    }
    if (dto.termsAccepted !== true || dto.privacyAccepted !== true || dto.disclaimerAccepted !== true) {
      throw new BadRequestException('All three legal documents must be accepted.');
    }
    if (!dto.termsVersion?.trim() || !dto.privacyVersion?.trim() || !dto.disclaimerVersion?.trim()) {
      throw new BadRequestException('Document versions are required.');
    }

    const doc: LegalAcceptance = {
      userId: uid,
      email,
      termsAccepted: true,
      privacyAccepted: true,
      disclaimerAccepted: true,
      termsVersion: dto.termsVersion.trim(),
      privacyVersion: dto.privacyVersion.trim(),
      disclaimerVersion: dto.disclaimerVersion.trim(),
      acceptedAt: new Date().toISOString(),
    };

    await this.col.doc(uid).set(doc);
    this.logger.log(`Legal acceptance recorded uid=${uid}`);
    return doc;
  }

  async findByUid(uid: string): Promise<LegalAcceptance | null> {
    if (!uid) return null;
    const snap = await this.col.doc(uid).get();
    return snap.exists ? (snap.data() as LegalAcceptance) : null;
  }
}
