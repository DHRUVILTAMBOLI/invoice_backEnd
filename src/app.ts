import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'fastify-bcrypt';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import sensible from '@fastify/sensible';
import prismaPlugin from './plugins/prisma';
import authRoutes from './routes/auth';
import invoiceRoutes from './routes/invoices';
import userRoutes from './routes/users';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PLAN_FREE, PLAN_PRO } from './constants/plans';
import { ZodError } from 'zod';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';

dotenv.config();

// Critical Environment Validation
const JWT_SECRET = process.env.JWT_SECRET;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!JWT_SECRET || JWT_SECRET === 'insecure-dev-secret') {
  if (IS_PROD) {
    console.error('CRITICAL: JWT_SECRET is missing or insecure in production. Aborting.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET is missing or using an insecure default. This is only acceptable for development.');
}

const CORS_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || (IS_PROD ? [] : '*');

const server = Fastify({
  logger: {
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// Register Plugins
server.register(sensible);
server.register(helmet);
server.register(cors, {
  origin: CORS_ORIGINS,
});

server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

server.register(swagger, {
  openapi: {
    info: {
      title: 'Invoice Backend API',
      description: 'Multi-tenant Invoice Management System',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  transform: jsonSchemaTransform,
});

server.register(swaggerUi, {
  routePrefix: '/docs',
});

server.register(prismaPlugin);
server.register(bcrypt, {
  saltWorkFactor: 12,
});

server.register(jwt, {
  secret: JWT_SECRET || 'insecure-dev-secret',
});

// Register Routes
server.register(authRoutes, { prefix: '/auth' });
server.register(invoiceRoutes, { prefix: '/invoices' });
server.register(userRoutes, { prefix: '/users' });

// Health check with DB ping
server.get('/health', async (request, reply) => {
  try {
    await server.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  } catch (err) {
    server.log.error(err, 'Database health check failed');
    return reply.status(503).send({ status: 'error', database: 'disconnected' });
  }
});

// Global Error Handler for Zod Validation
server.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: error.issues.map((err: any) => ({
        path: err.path.join('.'),
        message: err.message,
      })),
    });
  }
  
  // Default error handler
  reply.send(error);
});

const seedPlans = async (prisma: PrismaClient) => {
  const plans = [
    { name: PLAN_FREE, maxInvoices: 10, price: 0 },
    { name: PLAN_PRO, maxInvoices: 100, price: 500 },
  ];

  for (const plan of plans) {
    const existing = await prisma.plan.findUnique({ where: { name: plan.name } });
    if (!existing) {
      await prisma.plan.create({ data: plan });
      server.log.info(`Seed: Created plan ${plan.name}`);
    } else {
      // Only update if it's missing or if you explicitly want to sync basic structure
      // But based on user request "If someone manually changes a price ... it will be reset"
      // we do NOT update here.
      server.log.debug(`Seed: Plan ${plan.name} already exists. Skipping.`);
    }
  }
};

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await server.ready();
    await seedPlans(server.prisma);

    await server.listen({ port, host });
    
    server.log.info(`Server listening on http://${host}:${port}`);
    server.log.info(`Swagger docs available at http://${host}:${port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    server.log.info(`Received ${signal}, closing server...`);
    await server.close();
    process.exit(0);
  });
});

start();

