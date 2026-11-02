import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { IdentityService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
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
  me(@CurrentPrincipal() principal: Principal) {
    return this.identities.me(principal);
  }

  @Patch('me')
  async updateMe(@CurrentPrincipal() principal: Principal, @Body() body: UpdateMeDto) {
    return this.identities.me(await this.identities.setLocale(principal, body.locale));
  }
}
