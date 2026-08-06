import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseAdminService } from '../../modules/firebase/firebase-admin.service';

export const FEATURE_FLAG_KEY = 'requiredFeatureFlag';

/**
 * Gate a route/controller behind an operator feature flag from CRM Settings
 * (`app_settings.featureFlags`). When the flag is switched OFF the route returns
 * 503 instead of running — this is what makes the super-admin feature toggles
 * actually take effect on the server (a client-side hide alone is bypassable).
 */
/**
 * Accepts several flags: the route runs only if ALL of them are on.
 *
 * A route can belong to more than one switch. `POST /cover-letters/:id/ai/generate`
 * is both a cover-letter feature and an AI feature, but it carried only the
 * former — so turning the AI kill-switch off still left that endpoint spending
 * AI credits and calling the provider. A kill-switch that misses an endpoint is
 * not a kill-switch.
 */
export const RequireFeature = (...flags: string[]) => SetMetadata(FEATURE_FLAG_KEY, flags);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  // Small in-memory cache so we don't read app_settings on every request.
  private cache: { flags: Record<string, boolean>; at: number } | null = null;
  private readonly ttlMs = 30_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseAdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Tolerate the legacy single-string form still stored by any decorator that
    // has not been migrated.
    const required = this.reflector.getAllAndOverride<string | string[]>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const names = typeof required === 'string' ? [required] : (required ?? []);
    if (names.length === 0) return true;

    const flags = await this.getFlags();
    // Fail OPEN for an unknown/absent flag; only an explicit `false` disables,
    // so a missing settings doc never bricks a feature.
    if (names.some((name) => flags[name] === false)) {
      throw new ServiceUnavailableException('This feature is currently disabled.');
    }
    return true;
  }

  private async getFlags(): Promise<Record<string, boolean>> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.ttlMs) return this.cache.flags;
    try {
      const doc = await this.firebase.firestore
        .collection('app_settings')
        .doc('main')
        .get();
      const flags =
        (doc.exists
          ? (doc.data() as { featureFlags?: Record<string, boolean> }).featureFlags
          : null) ?? {};
      this.cache = { flags, at: now };
      return flags;
    } catch {
      // On a read error, don't block features — reuse last known (or empty).
      return this.cache?.flags ?? {};
    }
  }
}
