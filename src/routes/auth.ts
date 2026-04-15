import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PLAN_FREE } from '../constants/plans';

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const authRoutes: FastifyPluginAsync = async (server, options) => {
  // Sign Up: Create Tenant + User
  server.post('/signup', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['auth'],
      body: signUpSchema,
      response: {
        201: z.object({
          message: z.string(),
          tenantId: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const { name, email, password, companyName } = signUpSchema.parse(request.body);

      const hashedPassword = await server.bcrypt.hash(password);

      const result = await server.prisma.$transaction(async (tx) => {
        const freePlan = await tx.plan.findUnique({
          where: { name: PLAN_FREE },
        });

        if (!freePlan) {
          throw server.httpErrors.internalServerError('Default FREE plan not found');
        }

        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            planId: freePlan.id,
          },
        });

        const user = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            tenantId: tenant.id,
          },
        });

        return { user, tenant };
      });

      return reply.code(201).send({
        message: 'Tenant created successfully',
        tenantId: result.tenant.id,
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.badRequest('Email or company already exists');
      }
      throw error;
    }
  });

  // Login
  server.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['auth'],
      body: loginSchema,
      response: {
        200: z.object({
          token: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    const user = await server.prisma.user.findUnique({
      where: { email },
      include: { tenant: { include: { plan: true } } },
    });

    if (!user) {
      return reply.unauthorized('Invalid credentials');
    }

    const isValid = await server.bcrypt.compare(password, user.password);
    if (!isValid) {
      return reply.unauthorized('Invalid credentials');
    }

    const token = server.jwt.sign({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      plan: user.tenant.plan.name,
    }, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    return { token };
  });
};

export default authRoutes;

