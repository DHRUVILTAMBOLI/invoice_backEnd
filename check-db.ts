import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const tenants = await prisma.tenant.findMany();
  
  console.log('--- USERS ---');
  console.log(JSON.stringify(users, null, 2));
  console.log('\n--- TENANTS ---');
  console.log(JSON.stringify(tenants, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
