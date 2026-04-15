"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const invoiceSchema = zod_1.z.object({
    invoiceNumber: zod_1.z.string(),
    amount: zod_1.z.number(),
    customerName: zod_1.z.string(),
});
const invoiceRoutes = async (server, options) => {
    // Authentication hook for all invoice routes
    server.addHook('onRequest', async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch (err) {
            reply.send(err);
        }
    });
    // Create Invoice
    server.post('/', async (request, reply) => {
        const { tenantId } = request.user;
        const data = invoiceSchema.parse(request.body);
        // Fetch tenant with its dynamic plan details
        const tenant = await server.prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { plan: true },
        });
        if (!tenant) {
            return reply.code(404).send({ message: 'Tenant not found' });
        }
        const invoiceCount = await server.prisma.invoice.count({
            where: { tenantId },
        });
        const { maxInvoices, name: planName, price } = tenant.plan;
        if (invoiceCount >= maxInvoices) {
            const upgradeMsg = planName === 'FREE'
                ? `After ${maxInvoices} generate invoice to show message upgrade plant selected plant Free`
                : `Max limit of ${maxInvoices} invoices reached for ${planName} plan. Price RS:${price}/Monthly`;
            return reply.code(403).send({ message: upgradeMsg });
        }
        const invoice = await server.prisma.invoice.create({
            data: {
                ...data,
                tenantId,
            },
        });
        return reply.code(201).send(invoice);
    });
    // Get Invoices (Filtered by Tenant)
    server.get('/', async (request, reply) => {
        const { tenantId } = request.user;
        const invoices = await server.prisma.invoice.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return invoices;
    });
    // Upgrade Route
    server.patch('/upgrade', async (request, reply) => {
        const { tenantId } = request.user;
        const proPlan = await server.prisma.plan.findUnique({
            where: { name: 'PRO' },
        });
        if (!proPlan) {
            return reply.code(500).send({ message: 'PRO plan not configured' });
        }
        await server.prisma.tenant.update({
            where: { id: tenantId },
            data: { planId: proPlan.id },
        });
        return { message: `Upgraded to PRO plan. Price RS:${proPlan.price}/Monthly` };
    });
};
exports.default = invoiceRoutes;
