import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email format").optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const inviteSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Temporary password must be at least 8 characters")
});

const userRoutes: FastifyPluginAsync = async (server, options) => {
  // Authentication hook
  server.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.send(err);
    }
  });

  // Invite team member
  server.post('/invite', {
    schema: {
      tags: ['users'],
      security: [{ bearerAuth: [] }],
      body: inviteSchema,
      response: {
        201: z.object({
          message: z.string(),
        }),
      },
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const { email, name, password } = inviteSchema.parse(request.body);

    const existingUser = await server.prisma.user.findUnique({ where: { email } });
    if (existingUser) return reply.badRequest('Email already in use');

    const hashedPassword = await server.bcrypt.hash(password);

    await server.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        tenantId,
      }
    });

    return reply.code(201).send({
      message: 'Team member invited successfully.',
    });
  });

  // Get current user profile
  server.get('/me', {
    schema: {
      tags: ['users'],
      security: [{ bearerAuth: [] }],
    }
  }, async (request, reply) => {
    const { userId } = request.user as any;
    
    const user = await server.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        tenant: { 
          include: { plan: true } 
        } 
      },
    });

    if (!user) return reply.notFound('User not found');

    // Remove sensitive data
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });

  // Update profile
  server.patch('/me', {
    schema: {
      tags: ['users'],
      security: [{ bearerAuth: [] }],
      body: updateProfileSchema,
    }
  }, async (request, reply) => {
    const { userId } = request.user as any;
    const data = updateProfileSchema.parse(request.body);

    try {
      const updated = await server.prisma.user.update({
        where: { id: userId },
        data,
      });

      const { password, ...userWithoutPassword } = updated;
      return userWithoutPassword;
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.badRequest('Email already in use');
      }
      throw error;
    }
  });

  // Update password
  server.patch('/me/password', {
    schema: {
      tags: ['users'],
      security: [{ bearerAuth: [] }],
      body: updatePasswordSchema,
    }
  }, async (request, reply) => {
    const { userId } = request.user as any;
    const { currentPassword, newPassword } = updatePasswordSchema.parse(request.body);

    const user = await server.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return reply.notFound('User not found');

    const isValid = await server.bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return reply.badRequest('Invalid current password');
    }

    const hashedPassword = await server.bcrypt.hash(newPassword);
    await server.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  });

  // Delete account
  server.delete('/me', {
    schema: {
      tags: ['users'],
      security: [{ bearerAuth: [] }],
    }
  }, async (request, reply) => {
    const { userId, tenantId } = request.user as any;

    await server.prisma.$transaction(async (tx) => {
      // Check if user is the only user in the tenant
      const userCount = await tx.user.count({
        where: { tenantId }
      });

      if (userCount === 1) {
        // If they are the last user, delete the entire tenant (cascade will handle users and invoices)
        await tx.tenant.delete({ where: { id: tenantId } });
      } else {
        // Just delete the user
        await tx.user.delete({ where: { id: userId } });
      }
    });

    return reply.code(204).send();
  });
};

export default userRoutes;
