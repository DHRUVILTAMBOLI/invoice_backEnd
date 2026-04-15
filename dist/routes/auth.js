"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const signUpSchema = zod_1.z.object({
    name: zod_1.z.string(),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    companyName: zod_1.z.string(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
});
const authRoutes = async (server, options) => {
    // Sign Up: Create Tenant + User
    server.post('/signup', async (request, reply) => {
        const { name, email, password, companyName } = signUpSchema.parse(request.body);
        const existingUser = await server.prisma.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            return reply.code(400).send({ message: 'User already exists' });
        }
        const hashedPassword = await server.bcrypt.hash(password);
        // Transaction to create Tenant and User together
        const result = await server.prisma.$transaction(async (tx) => {
            const freePlan = await tx.plan.findUnique({
                where: { name: 'FREE' },
            });
            if (!freePlan) {
                throw new Error('Default FREE plan not found');
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
    });
    // Login
    server.post('/login', async (request, reply) => {
        const { email, password } = loginSchema.parse(request.body);
        const user = await server.prisma.user.findUnique({
            where: { email },
            include: { tenant: { include: { plan: true } } },
        });
        if (!user) {
            return reply.code(401).send({ message: 'Invalid credentials' });
        }
        const isValid = await server.bcrypt.compare(password, user.password);
        if (!isValid) {
            return reply.code(401).send({ message: 'Invalid credentials' });
        }
        const token = server.jwt.sign({
            userId: user.id,
            tenantId: user.tenantId,
            plan: user.tenant.plan,
        });
        return { token };
    });
};
exports.default = authRoutes;
