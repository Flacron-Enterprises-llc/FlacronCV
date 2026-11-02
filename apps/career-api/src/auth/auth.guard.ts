import { CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BillingError, IdentityService } from '@flacroncv/career-server';
import type { CareerAccess, IdTokenVerifier, Principal, VerifiedIdentity } from '@flacroncv/career-server';
import { CareerAccessService } from '../integration/career-access.service';
import { ID_TOKEN_VERIFIER } from './auth.providers';

const PUBLIC_ROUTE = 'flacroncv:public';
const DURING_DELETION = 'flacroncv:during-deletion';
const WITHOUT_CAREER_ACCESS = 'flacroncv:without-career-access';
const ACCESS_ONLY = 'flacroncv:access-only';

/** A route that does not take the user's token (health, public portfolios). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** The one route still served while the caller's account deletion is in progress, so it can finish or be retried. */
export const AllowDuringDeletion = () => SetMetadata(DURING_DELETION, true);

/**
 * Served even when the caller's V1 plan has no career access (the map says
 * `none`, or V1 deactivated the account), provided career data already
 * exists: personal-data export and erase must never depend on a plan.
 */
export const AllowWithoutCareerAccess = () => SetMetadata(WITHOUT_CAREER_ACCESS, true);

/** Needs only the verified token and the access decision; creates no career rows. */
export const AccessOnly = () => SetMetadata(ACCESS_ONLY, true);

type AuthedRequest = Request & { principal?: Principal; careerAccess?: CareerAccess; identity?: VerifiedIdentity };

/**
 * Every route needs `Authorization: Bearer <Firebase ID token>` unless it
 * is marked `@Public()`. A missing, malformed, or rejected token is
 * `unauthenticated`. The token is never logged.
 *
 * V1 integration: after the token, the caller's V1 plan decides access
 * (`CareerAccessService`). A caller without access gets
 * `feature_unavailable` and no career account is created for them.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
    private readonly identities: IdentityService,
    private readonly access: CareerAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match) throw new BillingError('unauthenticated', { reason: 'no_bearer' });
    const identity = await this.verifier.verify(match[1]);
    request.identity = identity;

    const access = await this.access.forUid(identity.uid);
    request.careerAccess = access;
    if (this.reflector.getAllAndOverride<boolean>(ACCESS_ONLY, targets)) return true;

    const duringDeletion = Boolean(this.reflector.getAllAndOverride<boolean>(DURING_DELETION, targets));
    if (!access.enabled) {
      if (!this.reflector.getAllAndOverride<boolean>(WITHOUT_CAREER_ACCESS, targets)) {
        throw new BillingError('feature_unavailable', { feature: 'career', reason: access.reason });
      }
      const existing = await this.identities.existingPrincipal(identity, { allowPendingDeletion: duringDeletion });
      if (!existing) throw new BillingError('not_found', { reason: 'no_career_account' });
      request.principal = existing;
      return true;
    }

    const principal = await this.identities.principal(identity, undefined, { allowPendingDeletion: duringDeletion });
    await this.access.syncPlan(principal.billingAccountId, access);
    request.principal = principal;
    return true;
  }
}

/** The caller the guard resolved. Only on routes that are not `@Public()`. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal => {
  const principal = context.switchToHttp().getRequest<AuthedRequest>().principal;
  if (!principal) throw new BillingError('unauthenticated', { reason: 'no_principal' });
  return principal;
});

/** The access decision for the caller. On every route that is not `@Public()`. */
export const CurrentCareerAccess = createParamDecorator((_data: unknown, context: ExecutionContext): CareerAccess => {
  const access = context.switchToHttp().getRequest<AuthedRequest>().careerAccess;
  if (!access) throw new BillingError('unauthenticated', { reason: 'no_access' });
  return access;
});
