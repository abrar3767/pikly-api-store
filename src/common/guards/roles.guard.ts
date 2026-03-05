import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

// RolesGuard works as the second layer after AuthGuard('jwt').
// AuthGuard verifies the token is valid and populates req.user with
// { userId, email, role }. RolesGuard then checks whether req.user.role
// matches the role(s) set on the route via the @Roles() decorator.
//
// If a route has no @Roles() decorator at all, the guard passes through —
// this means it is safe to register RolesGuard globally without breaking
// any existing non-admin routes.
//
// Correct usage on a controller:
//   @UseGuards(AuthGuard('jwt'), RolesGuard)
//   @Roles('admin')
//   @Controller('admin/products')
//   export class AdminProductsController { ... }

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read the required roles from the handler first, then fall back to the class level.
    // This allows per-method overrides while keeping class-level defaults.
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator — route is not role-restricted, allow through
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    // user is populated by AuthGuard('jwt') — if it is missing the token
    // was not validated, which should not reach here in normal flow
    if (!user)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Access denied",
      });

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin access required",
      });

    return true;
  }
}
