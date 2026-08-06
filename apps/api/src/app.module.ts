import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CVModule } from './modules/cv/cv.module';
import { CoverLetterModule } from './modules/cover-letter/cover-letter.module';
import { AIModule } from './modules/ai/ai.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ExportModule } from './modules/export/export.module';
import { PaymentModule } from './modules/payment/payment.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { MailModule } from './modules/mail/mail.module';
import { ContactModule } from './modules/contact/contact.module';
import { CRMModule } from './modules/crm/crm.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LeadsModule } from './modules/leads/leads.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Single global definition on purpose: with a global ThrottlerGuard,
    // EVERY definition listed here applies to EVERY route — a second, stricter
    // "auth" entry would rate-limit the whole API to 10 requests / 15 min.
    // Sensitive endpoints tighten this via @Throttle({ default: {...} }).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    FirebaseModule,
    MailModule,
    AuthModule,
    UsersModule,
    CVModule,
    CoverLetterModule,
    AIModule,
    TemplatesModule,
    ExportModule,
    PaymentModule,
    SupportModule,
    AdminModule,
    AuditModule,
    ContactModule,
    CRMModule,
    JobsModule,
    LeadsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
