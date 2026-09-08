import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtPayload } from '../common/types';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authorization header missing or malformed',
      });
    }

    const decoded = await request.jwtVerify<JwtPayload>();
    if (!decoded || !decoded.sub) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid token payload',
      });
    }

    request.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'USER',
    };
  } catch (err: any) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: err.message || 'Invalid or expired authentication token',
    });
  }
}

export async function optionalAuthenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  try {
    const decoded = await request.jwtVerify<JwtPayload>();
    if (decoded && decoded.sub) {
      request.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role || 'USER',
      };
    }
  } catch {
    // Gracefully ignore token errors for public routes with optional authentication
  }
}
