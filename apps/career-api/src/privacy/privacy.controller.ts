import { Body, Controller, Get, Inject, Param, Post, Provider, Query, StreamableFile } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AccountPrivacyService, BillingError, LocalDiskObjectStorage, attachmentDisposition, createSignInDeleter } from '@flacroncv/career-server';
import type { ObjectStorage } from '@flacroncv/career-server';
import type { IdTokenVerifier, Principal, SignInDeleter } from '@flacroncv/career-server';
import { AllowDuringDeletion, AllowWithoutCareerAccess, CurrentPrincipal, Public } from '../auth/auth.guard';
import { ID_TOKEN_VERIFIER } from '../auth/auth.providers';
import { DatabaseService } from '../database/database.service';
import { OBJECT_STORAGE } from '../storage/storage.providers';

class ExportDto {
  @IsIn(['personal', 'workspace'])
  scope!: 'personal' | 'workspace';
}

class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken!: string;

  @IsString()
  @MaxLength(32)
  confirm!: string;
}

/** V1 integration: always `RetainedByV1SignInDeleter`; the V1 sign-in is never removed here (V1's own deletion disables it). */
export const SIGN_IN_DELETER = Symbol('SIGN_IN_DELETER');

export const privacyProviders: Provider[] = [
  { provide: SIGN_IN_DELETER, useFactory: (): SignInDeleter => createSignInDeleter(process.env) },
  {
    provide: AccountPrivacyService,
    inject: [DatabaseService, ID_TOKEN_VERIFIER, OBJECT_STORAGE, SIGN_IN_DELETER],
    useFactory: (database: DatabaseService, tokens: IdTokenVerifier, storage: ObjectStorage, signIns: SignInDeleter) =>
      new AccountPrivacyService(database.connectionPool, tokens, storage, undefined, signIns),
  },
];

@Controller()
export class PrivacyController {
  constructor(
    @Inject(AccountPrivacyService) private readonly privacy: AccountPrivacyService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @AllowWithoutCareerAccess()
  @Post('exports')
  start(@CurrentPrincipal() principal: Principal, @Body() body: ExportDto) {
    return this.privacy.startExport(principal, body.scope);
  }

  @AllowWithoutCareerAccess()
  @Get('exports/:exportId')
  read(@CurrentPrincipal() principal: Principal, @Param('exportId') exportId: string) {
    return this.privacy.readExport(principal, exportId);
  }

  @Public()
  @Get('local-exports')
  async localExport(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Query('name') name?: string,
    @Query('type') type?: string,
  ) {
    if (!(this.storage instanceof LocalDiskObjectStorage)) throw new BillingError('not_found');
    const file = await this.storage.openSigned(key ?? '', Number(exp), sig ?? '', name ?? '', type ?? '');
    return new StreamableFile(file.body, { type: file.contentType, disposition: attachmentDisposition(file.fileName || undefined) });
  }

  @AllowDuringDeletion()
  @AllowWithoutCareerAccess()
  @Post('account/delete')
  remove(@CurrentPrincipal() principal: Principal, @Body() body: DeleteAccountDto) {
    return this.privacy.deleteAccount(principal, body);
  }
}
