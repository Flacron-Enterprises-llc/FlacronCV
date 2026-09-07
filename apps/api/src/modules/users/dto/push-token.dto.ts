import { Matches, MaxLength } from 'class-validator';

/** Expo Push Service token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]{8,180}\]$/;

export class PushTokenDto {
  @Matches(EXPO_PUSH_TOKEN_PATTERN, { message: 'token must be an Expo push token' })
  @MaxLength(200)
  token!: string;
}
