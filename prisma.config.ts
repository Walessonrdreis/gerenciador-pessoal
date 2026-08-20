// Config do Prisma 7: a URL do datasource mora aqui (não no schema).
// dotenv carrega o .env para o CLI (migrate, db push, generate).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
