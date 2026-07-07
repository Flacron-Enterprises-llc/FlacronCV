import { IsEnum } from 'class-validator';
import { UserRole } from '@flacroncv/shared-types';

export class UpdateUserRoleDto {
  @IsEnum(UserRole, { message: `role must be one of: ${Object.values(UserRole).join(', ')}` })
  role!: UserRole;
}
