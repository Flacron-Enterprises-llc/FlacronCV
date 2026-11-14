import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CRMAuditService } from './crm-audit.service';
import { AppSettings, UpdateAppSettingsDto, PLAN_CONFIGS, SubscriptionPlan, allPlansForAdmin } from '@flacroncv/shared-types';

/**
 * Plan limits as actually enforced (PLAN_CONFIGS). The CRM shows these for
 * reference only; the stored copy used to drift (it said free = 3 CVs while the
 * product enforces 5), so it is always replaced by the real values on read.
 */
export function enforcedLimits(plan: SubscriptionPlan): AppSettings['planLimits'][SubscriptionPlan] {
  const l = PLAN_CONFIGS[plan].limits;
  // 'unlimited' and an absent allowance both show as -1.
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : -1);
  return {
    cvsLimit: n(l.cvs),
    coverLettersLimit: n(l.coverLetters),
    aiCreditsLimit: n(l.aiCredits),
    exportsLimit: n(l.exports),
    analysesLimit: n(l.analyses),
    trackedApplicationsLimit: n(l.trackedApplications),
  };
}

/** Every plan, current and legacy, straight from PLAN_CONFIGS. */
export const ENFORCED_PLAN_LIMITS: AppSettings['planLimits'] = Object.fromEntries(
  allPlansForAdmin().map((plan) => [plan, enforcedLimits(plan)]),
) as AppSettings['planLimits'];

const DEFAULT_SETTINGS: AppSettings = {
  planLimits: ENFORCED_PLAN_LIMITS,
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
    return { ...DEFAULT_SETTINGS, ...(doc.data() as Partial<AppSettings>), planLimits: ENFORCED_PLAN_LIMITS };
  }

  async updateSettings(
    dto: UpdateAppSettingsDto,
    actorId: string,
    actorEmail: string,
  ): Promise<AppSettings> {
    const current = await this.getSettings();
    // `.abuse` is not on UpdateAppSettingsDto. A full-doc set() here would
    // wipe the risk-engine config the scorer actually reads.
    const existingAbuse = current.abuse;
    const updated: AppSettings = {
      ...current,
      // Plan limits are code (PLAN_CONFIGS), not settings: an edit here would
      // change nothing that is enforced, so it is ignored rather than stored.
      planLimits: ENFORCED_PLAN_LIMITS,
      featureFlags: dto.featureFlags
        ? { ...current.featureFlags, ...dto.featureFlags }
        : current.featureFlags,
      maintenanceMode: dto.maintenanceMode
        ? { ...current.maintenanceMode, ...dto.maintenanceMode }
        : current.maintenanceMode,
      announcement: dto.announcement
        ? { ...current.announcement, ...dto.announcement }
        : current.announcement,
      ...(existingAbuse ? { abuse: existingAbuse } : {}),
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
