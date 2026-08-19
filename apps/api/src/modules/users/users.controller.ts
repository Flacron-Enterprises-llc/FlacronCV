import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from '../payment/payment.service';
import { AuditAction } from '../audit/audit-actions';
import { UpdatePreferencesDto, UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => PaymentService))
    private readonly payments: PaymentService,
  ) {}

  /**
   * Client IP + user agent for the audit trail. `x-forwarded-for` is a list
   * when there are several proxies; the first entry is the original client.
   * (Mirrors AuthController.requestContext.)
   */
  private static requestContext(req: Request): { ipAddress?: string; userAgent?: string } {
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) || req.ip;
    return { ipAddress, userAgent: req.headers['user-agent'] };
  }

  private static actor(user: FirebaseUser) {
    return { uid: user.uid, email: user.email, role: user.role };
  }

  @Get('me')
  async getProfile(@CurrentUser() user: FirebaseUser) {
    return this.usersService.findByIdOrThrow(user.uid);
  }

  @Put('me')
  async updateProfile(@CurrentUser() user: FirebaseUser, @Body() data: UpdateUserDto) {
    return this.usersService.update(user.uid, data);
  }

  @Patch('me/preferences')
  async updatePreferences(
    @CurrentUser() user: FirebaseUser,
    @Body() preferences: UpdatePreferencesDto,
  ) {
    return this.usersService.update(user.uid, { preferences });
  }

  @Get('me/usage')
  async getUsage(@CurrentUser() user: FirebaseUser) {
    const userData = await this.usersService.findByIdOrThrow(user.uid);
    return userData.usage;
  }

  /**
   * Right to Access / Right to Portability: a single JSON document containing
   * everything this account owns. The uid comes from the verified ID token —
   * there is deliberately no way for a caller to name a different user.
   *
   * Throttled well below the global limit because one call fans out into reads
   * across five collections.
   */
  @Get('me/export')
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @ApiOperation({ summary: "Export all of the signed-in user's personal data as JSON" })
  async exportPersonalData(@CurrentUser() user: FirebaseUser, @Req() req: Request) {
    const data = await this.usersService.exportPersonalData(user.uid);

    // Recorded against the acting user with a distinct `resource`, so a data
    // subject access request is distinguishable in the audit log from an
    // ordinary CV/cover-letter file export.
    await this.audit.logUserAction(
      AuditAction.DOCUMENT_EXPORTED,
      UsersController.actor(user),
      'user_data_export',
      user.uid,
      {
        metadata: {
          format: 'json',
          scope: 'personal_data',
          cvs: data.cvs.length,
          coverLetters: data.coverLetters.length,
          jobApplications: data.jobApplications.length,
          supportTickets: data.supportTickets.length,
          truncated: data.meta.truncated,
        },
        ...UsersController.requestContext(req),
      },
    );

    return data;
  }

  /**
   * Sign out of every device: revokes all refresh tokens for this account.
   *
   * Firebase Auth has no per-session handle, so this is genuinely all-or-
   * nothing — there is no "sign out that one device" to offer, and the UI says
   * so rather than showing a session list we cannot populate.
   */
  @Post('me/sign-out-everywhere')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({ summary: 'Revoke every refresh token for the signed-in user' })
  async signOutEverywhere(@CurrentUser() user: FirebaseUser, @Req() req: Request) {
    const result = await this.usersService.signOutEverywhere(user.uid);

    await this.audit.logUserAction(
      AuditAction.LOGOUT,
      UsersController.actor(user),
      'user',
      user.uid,
      { metadata: { scope: 'all_devices' }, ...UsersController.requestContext(req) },
    );

    return result;
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: FirebaseUser) {
    // Stop the billing BEFORE disabling the login. Deleting the account used to
    // leave the Stripe subscription running, so the card kept being charged
    // every month for a product the person could no longer sign in to. This is
    // best-effort: a Stripe outage must not block someone from deleting their
    // account, but it must be loud in the logs if it happens.
    try {
      await this.payments.cancelBillingForUser(user.uid, 'account deleted');
    } catch (err) {
      this.logger.error(
        `Account ${user.uid} deleted but Stripe cancellation FAILED — billing may continue: ${(err as Error).message}`,
      );
    }
    await this.usersService.softDelete(user.uid);
  }
}
