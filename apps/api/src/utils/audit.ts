import type { FastifyRequest } from "fastify";

export function auditLog(
  request: FastifyRequest,
  action: string,
  detail?: {
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const impersonationContext = request.user?.impersonating
    ? {
        adminId: request.user.adminId,
        impersonatedUserId: request.user.sub,
        impersonating: true,
      }
    : {};

  request.log.info(
    {
      audit: true,
      action,
      userId: request.user?.sub,
      resourceType: detail?.resourceType,
      resourceId: detail?.resourceId,
      ip: request.ip,
      ...impersonationContext,
      ...detail?.metadata,
    },
    `audit: ${action}`,
  );
}
