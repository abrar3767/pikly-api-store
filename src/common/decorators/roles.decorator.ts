import { SetMetadata } from "@nestjs/common";

// Usage: @Roles('admin') on a controller class or individual method.
// The RolesGuard reads this metadata and rejects requests where
// req.user.role does not match the required role.
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
