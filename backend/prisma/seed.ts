import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      passwordHash,
      name: "Admin User",
      role: Role.ADMIN,
    },
  });

  const userHash = await bcrypt.hash("user123", 10);
  await prisma.user.upsert({
    where: { email: "user@demo.com" },
    update: {},
    create: {
      email: "user@demo.com",
      passwordHash: userHash,
      name: "Regular User",
      role: Role.USER,
    },
  });

  console.log("Seed: admin@demo.com / admin123 | user@demo.com / user123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
