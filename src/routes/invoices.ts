import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PLAN_FREE, PLAN_PRO } from '../constants/plans';

const baseInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  amount: z.number().positive("Amount must be greater than zero"),
  customerName: z.string().min(1, "Customer name is required"),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE']).optional().default('DRAFT'),
  date: z.string().optional(),
  dueDate: z.string().optional(),
});

const dateRefinement = (data: any) => {
  const dDate = data.date ? new Date(data.date) : new Date();
  if (data.dueDate) {
    return new Date(data.dueDate) >= dDate;
  }
  return true;
};

const dateRefinementConfig = {
  message: "Due date cannot be before the invoice created date",
  path: ["dueDate"]
};

const invoiceSchema = baseInvoiceSchema.refine(dateRefinement, dateRefinementConfig);

const updateInvoiceSchema = baseInvoiceSchema.partial().refine(dateRefinement, dateRefinementConfig);

const getInvoicesSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('10'),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE']).optional(),
  search: z.string().optional(),
});

const upgradeSchema = z.object({
  paymentToken: z.string().min(1, "Payment token is required for verification"),
});

const invoiceRoutes: FastifyPluginAsync = async (server, options) => {
  // Authentication hook for all invoice routes
  server.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.send(err);
    }
  });

  // Create Invoice
  server.post<{ Body: z.infer<typeof invoiceSchema> }>('/', {
    schema: {
      tags: ['invoices'],
      security: [{ bearerAuth: [] }],
      body: invoiceSchema,
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const data = invoiceSchema.parse(request.body);

    try {
      const invoice = await server.prisma.$transaction(async (tx) => {
        // Fetch tenant with plan and a pessimistic lock (if supported by DB)
        // For SQLite, this transaction will naturally block other writers.
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          include: { plan: true },
        });

        if (!tenant) throw server.httpErrors.notFound('Tenant not found');

        // Re-count invoices within the transaction to ensure accuracy
        const invoiceCount = await tx.invoice.count({ where: { tenantId } });
        const { maxInvoices, name: planName, price } = tenant.plan;

        if (invoiceCount >= maxInvoices) {
          const upgradeMsg = planName === PLAN_FREE 
            ? `Limit of ${maxInvoices} reached. Please upgrade to PRO.`
            : `Limit of ${maxInvoices} reached for ${planName}. Price:${price}`;
          throw server.httpErrors.forbidden(upgradeMsg);
        }

        return await tx.invoice.create({
          data: { 
            ...data, 
            tenantId,
            date: data.date ? new Date(data.date) : new Date(),
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          },
        });
      });

      return reply.code(201).send(invoice);
    } catch (err: any) {
      if (err.code === 'P2002') return reply.badRequest(`Invoice ${data.invoiceNumber} already exists.`);
      throw err;
    }
  });

  // Get Invoices
  server.get('/', {
    schema: {
      tags: ['invoices'],
      security: [{ bearerAuth: [] }],
      querystring: getInvoicesSchema,
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const { page: pageStr, limit: limitStr, status, search } = getInvoicesSchema.parse(request.query);
    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitStr) || 10));
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { customerName: { contains: search } },
        { invoiceNumber: { contains: search } },
      ];
    }

    const [invoices, total] = await Promise.all([
      server.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      server.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  });

  // Get Single Invoice
  server.get('/:id', {
    schema: {
      tags: ['invoices'],
      security: [{ bearerAuth: [] }],
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const invoice = await server.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) return reply.notFound('Invoice not found');
    return invoice;
  });

  // Update Invoice
  server.patch('/:id', {
    schema: {
      tags: ['invoices'],
      security: [{ bearerAuth: [] }],
      body: updateInvoiceSchema,
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const data = updateInvoiceSchema.parse(request.body);

    const invoice = await server.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) return reply.notFound('Invoice not found');

    const updated = await server.prisma.invoice.update({
      where: { id },
      data,
    });

    return updated;
  });

  // Delete Invoice
  server.delete('/:id', {
    schema: {
      tags: ['invoices'],
      security: [{ bearerAuth: [] }],
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const invoice = await server.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) return reply.notFound('Invoice not found');

    await server.prisma.invoice.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Upgrade Route
  server.patch('/upgrade', {
    schema: {
      tags: ['subscription'],
      security: [{ bearerAuth: [] }],
      body: upgradeSchema,
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any;
    const { paymentToken } = upgradeSchema.parse(request.body);

    const tenant = await server.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (tenant?.plan.name === PLAN_PRO) return reply.badRequest('Already on PRO plan');

    const proPlan = await server.prisma.plan.findUnique({ where: { name: PLAN_PRO } });
    if (!proPlan) return reply.internalServerError('PRO plan not configured');

    // MOCK PAYMENT VERIFICATION
    if (paymentToken !== 'm_valid_token_123') {
      return reply.status(402).send({ message: 'Invalid payment token' });
    }

    await server.prisma.tenant.update({
      where: { id: tenantId },
      data: { planId: proPlan.id },
    });

    return { message: `Upgraded to PRO. Price RS:${proPlan.price}/Monthly` };
  });
};

export default invoiceRoutes;

