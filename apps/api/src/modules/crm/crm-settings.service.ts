import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CRMAuditService } from './crm-audit.service';
import { AppSettings, UpdateAppSettingsDto } from '@flacroncv/shared-types';

const DEFAULT_SETTINGS: AppSettings = {
  planLimits: {
    free: { cvsLimit: 3, coverLettersLimit: 2, aiCreditsLimit: 5, exportsLimit: 2 },
    pro: { cvsLimit: 50, coverLettersLimit: 50, aiCreditsLimit: 100, exportsLimit: 50 },
    enterprise: { cvsLimit: -1, coverLettersLimit: -1, aiCreditsLimit: -1, exportsLimit: -1 },
  },
  featureFlags: {
    aiEnabled: true,
    templatesEnabled: true,
    exportsEnabled: true,
    coverLettersEnabled: true,
  },
  maintenanceMode: { enabled: false, message: 'We are currently performing maintenance.' },
  announcement: { enabled: false, message: '', type: 'info' },
  updatedAt: null,
  updatedBy: null,
};

@Injectable()
export class CRMSettingsService {
  private readonly docRef = () =>
    this.firebase.firestore.collection('app_settings').doc('main');

  constructor(
    private firebase: FirebaseAdminService,
    private audit: CRMAuditService,
  ) {}

  async getSettings(): Promise<AppSettings> {
    const doc = await this.docRef().get();
    if (!doc.exists) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(doc.data() as Partial<AppSettings>) };
  }

  async updateSettings(
    dto: UpdateAppSettingsDto,
    actorId: string,
    actorEmail: string,
  ): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated: AppSettings = {
      ...current,
      planLimits: dto.planLimits
        ? {
            free: { ...current.planLimits.free, ...(dto.planLimits.free ?? {}) },
            pro: { ...current.planLimits.pro, ...(dto.planLimits.pro ?? {}) },
            enterprise: { ...current.planLimits.enterprise, ...(dto.planLimits.enterprise ?? {}) },
          }
        : current.planLimits,
      featureFlags: dto.featureFlags
        ? { ...current.featureFlags, ...dto.featureFlags }
        : current.featureFlags,
      maintenanceMode: dto.maintenanceMode
        ? { ...current.maintenanceMode, ...dto.maintenanceMode }
        : current.maintenanceMode,
      announcement: dto.announcement
        ? { ...current.announcement, ...dto.announcement }
        : current.announcement,
      updatedAt: new Date(),
      updatedBy: actorEmail,
    };

    await this.docRef().set(updated);
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'APP_SETTINGS_UPDATED',
      targetType: 'settings',
      targetId: 'main',
      targetName: 'App Settings',
      details: { changes: dto },
    });

    return updated;
  }
}
