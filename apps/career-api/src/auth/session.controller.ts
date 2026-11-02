import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { IdentityService } from '@flacroncv/career-server';
import type { MeView, Principal } from '@flacroncv/career-server';
import { LAUNCH_LOCALES } from '@flacroncv/career-shared';
import { CurrentPrincipal } from './auth.guard';

class UpdateMeDto {
  @IsIn(LAUNCH_LOCALES)
  locale!: string;
}

/**
 * V1 integration: sign-in, legal acceptance and push tokens belong to V1
 * (`/auth/verify`, `legalAcceptances`, `users.pushTokens`), so V2's
 * `POST /session`, `/legal-acceptances` and `/push-tokens` are not served.
 * The career account is created by the guard on the first permitted request.
 * `locale` here is only the language of generated career documents (en/fr).
 */
@Controller()
export class SessionController {
  constructor(private readonly identities: IdentityService) {}

  @Get('me')
  async me(@CurrentPrincipal() principal: Principal) {
    return v1OwnsLegal(await this.identities.me(principal));
  }

  @Patch('me')
  async updateMe(@CurrentPrincipal() principal: Principal, @Body() body: UpdateMeDto) {
    return v1OwnsLegal(await this.identities.me(await this.identities.setLocale(principal, body.locale)));
  }
}

/**
 * V1 records terms, privacy and disclaimer acceptance (`legalAcceptances`) at
 * sign-up and on version changes, so the career screens never ask a second time.
 */
function v1OwnsLegal(view: MeView): MeView {
  return { ...view, legal: { ...view.legal, needsAcceptance: false } };
}
