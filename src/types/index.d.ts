import { FastifyJWT } from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    // Add any custom instances here if needed (prisma is already handled by plugin)
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: string;
      tenantId: string;
      email: string;
      plan: string;
    };
  }
}

