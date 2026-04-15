"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const fastify_bcrypt_1 = __importDefault(require("fastify-bcrypt"));
const prisma_1 = __importDefault(require("./plugins/prisma"));
const auth_1 = __importDefault(require("./routes/auth"));
const invoices_1 = __importDefault(require("./routes/invoices"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const server = (0, fastify_1.default)({
    logger: true,
});
// Register Plugins
server.register(prisma_1.default);
server.register(fastify_bcrypt_1.default, {
    saltWorkFactor: 12,
});
server.register(jwt_1.default, {
    secret: process.env.JWT_SECRET || 'super-secret-key',
});
// Register Routes
server.register(auth_1.default, { prefix: '/auth' });
server.register(invoices_1.default, { prefix: '/invoices' });
// Health check
server.get('/health', async (request, reply) => {
    return { status: 'ok' };
});
const seedPlans = async (prisma) => {
    const plans = [
        { name: 'FREE', maxInvoices: 10, price: 0 },
        { name: 'PRO', maxInvoices: 100, price: 500 },
    ];
    for (const plan of plans) {
        await prisma.plan.upsert({
            where: { name: plan.name },
            update: { maxInvoices: plan.maxInvoices, price: plan.price },
            create: { name: plan.name, maxInvoices: plan.maxInvoices, price: plan.price },
        });
    }
};
const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        // Wait for prisma to be available
        await server.ready();
        await seedPlans(server.prisma);
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on http://localhost:${port}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
start();
