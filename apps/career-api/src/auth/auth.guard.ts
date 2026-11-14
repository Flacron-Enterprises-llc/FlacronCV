import { CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BillingError, IdentityService, sponsoredSpender } from '@flacroncv/career-server';
import type { CareerAccess, IdTokenVerifier, Principal, VerifiedIdentity } from '@flacroncv/career-server';
import { CareerAccessService } from '../integration/career-access.service';
import { ID_TOKEN_VERIFIER } from './auth.providers';

const PUBLIC_ROUTE = 'flacroncv:public';
const DURING_DELETION = 'flacroncv:during-deletion';
const WITHOUT_CAREER_ACCESS = 'flacroncv:without-career-access';
const ACCESS_ONLY = 'flacroncv:access-only';
const OWN_BILLING_ACCOUNT = 'flacroncv:own-billing-account';
const BUSINESS_INVITE = 'flacroncv:business-invite';

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

/**
 * Billing routes (plan, purchases, checkout, portal) always act on the caller's
 * OWN billing account, never on a Business pool that sponsors them.
 */
export const OwnBillingAccount = () => SetMetadata(OWN_BILLING_ACCOUNT, true);

/**
 * Accepting a Business invitation: allowed even when the caller's own V1 plan
 * has no career access (an operator map sets it to none), because the
 * Business account is what grants them access.
 */
export const BusinessInviteRoute = () => SetMetadata(BUSINESS_INVITE, true);

/** Needs only the verified token and the access decision; creates no career rows. */
export const AccessOnly = () => SetMetadata(ACCESS_ONLY, true);

const OPERATOR_ROUTE = 'flacroncv:operator';
/** V1 staff roles that may use career operator tools. */
export const V1_STAFF_ROLES: readonly string[] = ['admin', 'super_admin'];

/**
 * Career operator tools (moderation, feature switches). Requires V1's staff
 * claim here AND the ADMIN_AUTH_USER_IDS allowlist in the services, so it is
 * narrower than either alone. Independent of the operator's own career plan.
 */
export const OperatorRoute = () => SetMetadata(OPERATOR_ROUTE, true);

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

    let access = await this.access.forUid(identity.uid);
    request.careerAccess = access;
    if (this.reflector.getAllAndOverride<boolean>(ACCESS_ONLY, targets)) return true;

    const duringDeletion = Boolean(this.reflector.getAllAndOverride<boolean>(DURING_DELETION, targets));
    const operator = Boolean(this.reflector.getAllAndOverride<boolean>(OPERATOR_ROUTE, targets));
    const withoutAccess = Boolean(this.reflector.getAllAndOverride<boolean>(WITHOUT_CAREER_ACCESS, targets));

    // The V1 account's *current* status decides before anything can be
    // created or changed: an operator route, a request that may provision a
    // career account, or any write. Reads of an existing account may use the
    // short cache. The token's claims are never the only source of "active".
    if (!withoutAccess) {
      const mayWrite = operator || !['GET', 'HEAD', 'OPTIONS'].includes((request.method ?? 'GET').toUpperCase());
      const mayProvision = !mayWrite && !(await this.identities.existingPrincipal(identity, { allowPendingDeletion: duringDeletion }));
      if (mayWrite || mayProvision) {
        access = await this.access.forUid(identity.uid, { fresh: true });
        request.careerAccess = access;
      }
    }

    if (operator) {
      if (!identity.role || !V1_STAFF_ROLES.includes(identity.role)) {
        throw new BillingError('permission_denied', { reason: 'not_v1_staff' });
      }
      // A staff claim on a stale token does not outlive the V1 account: an
      // inactive or missing V1 account is refused before any career row is written.
      if (!access.enabled && (access.reason === 'v1_account_inactive' || access.reason === 'v1_account_missing')) {
        throw new BillingError('permission_denied', { reason: access.reason });
      }
      request.principal = await this.identities.principal(identity);
      return true;
    }

    // Export and erase act on career data that already exists, whatever the plan,
    // and never create an account just to export or erase it.
    if (this.reflector.getAllAndOverride<boolean>(WITHOUT_CAREER_ACCESS, targets)) {
      const existing = await this.identities.existingPrincipal(identity, { allowPendingDeletion: duringDeletion });
      if (!existing) throw new BillingError('not_found', { reason: 'no_career_account' });
      request.principal = existing;
      return true;
    }
    if (!access.enabled && access.reason === 'plan_not_mapped') {
      // A person without own career access may accept a Business invitation,
      // and an accepted Business candidate uses the career features on the
      // Business pool. Inactive or missing V1 accounts are never let through.
      const inviteRoute = Boolean(this.reflector.getAllAndOverride<boolean>(BUSINESS_INVITE, targets));
      const sponsored = inviteRoute ? null : await this.access.businessSponsor(identity.uid);
      if (inviteRoute || sponsored) {
        const principal = await this.identities.principal(identity, undefined, { allowPendingDeletion: duringDeletion });
        request.principal = this.ownAccountOnly(targets) ? principal : sponsoredSpender(principal, sponsored);
        return true;
      }
    }
    if (!access.enabled) {
      // Spec section 11: after a cancellation or downgrade, existing items stay
      // readable. With the default map every V1 plan (Free included) has
      // access; this covers an operator map that sets a plan to `none`: an
      // existing career account may still read, never write or provision.
      const read = ['GET', 'HEAD', 'OPTIONS'].includes((request.method ?? 'GET').toUpperCase());
      if (read && access.reason === 'plan_not_mapped') {
        const existing = await this.identities.existingPrincipal(identity, { allowPendingDeletion: duringDeletion });
        if (existing) {
          request.principal = existing;
          return true;
        }
      }
      throw new BillingError('feature_unavailable', { feature: 'career', reason: access.reason });
    }

    const principal = await this.identities.principal(identity, undefined, { allowPendingDeletion: duringDeletion });
    // The candidate's own account always follows their own V1 plan first;
    // only then may an active Business candidacy redirect spending to the pool.
    await this.access.syncPlan(principal.billingAccountId, access);
    request.principal = this.ownAccountOnly(targets)
      ? principal
      : sponsoredSpender(principal, await this.access.businessSponsor(identity.uid));
    return true;
  }

  private ownAccountOnly(targets: Parameters<Reflector['getAllAndOverride']>[1]): boolean {
    return Boolean(this.reflector.getAllAndOverride<boolean>(OWN_BILLING_ACCOUNT, targets));
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
