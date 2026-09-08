import { FastifyReply, FastifyRequest } from 'fastify';

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access denied: insufficient permissions',
      });
    }
  };
}

export const requireAdmin = requireRole(['ADMIN']);
