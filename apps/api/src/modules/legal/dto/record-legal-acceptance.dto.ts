import { Equals, IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { RecordLegalAcceptanceData } from '@flacroncv/shared-types';

/**
 * All three documents must be accepted. Version strings are supplied by the
 * client from LEGAL_VERSION_MAP — this DTO does not hardcode a date.
 *
 * `userId` / `email` are forbidden (whitelist + forbidNonWhitelisted). The
 * controller stamps both from the verified token so a caller cannot write
 * another uid's row or another person's email.
 */
export class RecordLegalAcceptanceDto implements RecordLegalAcceptanceData {
  @IsBoolean()
  @Equals(true, { message: 'termsAccepted must be true' })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'privacyAccepted must be true' })
  privacyAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'disclaimerAccepted must be true' })
  disclaimerAccepted!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  termsVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  privacyVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  disclaimerVersion!: string;
}
