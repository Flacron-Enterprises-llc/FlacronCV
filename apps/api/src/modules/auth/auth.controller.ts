import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { FailedLoginDto } from './dto/failed-login.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@flacroncv/shared-types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Client IP + user agent for the audit trail. `x-forwarded-for` is a list
   * when there are several proxies; the first entry is the original client.
   */
  private static requestContext(req: Request): { ipAddress?: string; userAgent?: string } {
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) || req.ip;
    return { ipAddress, userAgent: req.headers['user-agent'] };
  }

  @Post('verify')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async verify(@CurrentUser() user: FirebaseUser, @Req() req: Request) {
    return this.authService.verifyAndSync(
      user.uid,
      user.email,
      (user as Record<string, unknown>).name as string || user.email,
      (user.emailVerified as boolean) || false,
      (user as Record<string, unknown>).picture as string,
      AuthController.requestContext(req),
    );
  }

  /**
   * Records a sign-out in the audit trail. Firebase sign-out happens entirely
   * in the browser, so without this call the backend would never learn that a
   * session ended and the audit log could only ever show sign-ins.
   */
  @Post('logout')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: FirebaseUser, @Req() req: Request) {
    await this.authService.recordLogout(
      { uid: user.uid, email: user.email, role: (user as Record<string, unknown>).role as string },
      AuthController.requestContext(req),
    );
    return { message: 'Sign-out recorded' };
  }

  /**
   * Records a failed sign-in attempt reported by the client.
   *
   * Necessarily unauthenticated (there is no session yet), so it is throttled
   * hard — 10/15min per IP — to bound how much noise a caller can inject. It
   * accepts an address and a reason code only; credentials are never sent.
   * Always returns 200 so it cannot be used to probe for registered addresses.
   */
  @Post('failed-login')
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  async failedLogin(@Body() body: FailedLoginDto, @Req() req: Request) {
    await this.authService.recordFailedLogin(
      body.email,
      body.reason || 'unknown',
      AuthController.requestContext(req),
    );
    return { message: 'Recorded' };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.authService.sendPasswordReset(body.email);
    // Always the same response whether or not the account exists, so this
    // endpoint cannot be used to probe for registered email addresses.
    return { message: 'If an account exists for that address, a reset link has been sent' };
  }

  @Post('send-verification')
  @UseGuards(FirebaseAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async sendVerification(@CurrentUser() user: FirebaseUser) {
    await this.authService.sendEmailVerification(user.uid);
    return { message: 'Verification email sent' };
  }

  @Post('set-claims')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async setClaims(@Body() body: { uid: string; role: string }, @CurrentUser() actor: FirebaseUser) {
    const validRoles = Object.values(UserRole) as string[];
    if (!validRoles.includes(body.role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
    // Pass the acting admin so the audit row names who granted the privilege.
    await this.authService.setUserRole(body.uid, body.role as UserRole, {
      uid: actor.uid,
      email: actor.email,
      role: (actor as Record<string, unknown>).role as string,
    });
    return { message: `Role ${body.role} set for user ${body.uid}` };
  }

  @Post('revoke')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async revokeTokens(@Body() body: { uid: string }) {
    await this.authService.revokeTokens(body.uid);
    return { message: `Tokens revoked for user ${body.uid}` };
  }
}
