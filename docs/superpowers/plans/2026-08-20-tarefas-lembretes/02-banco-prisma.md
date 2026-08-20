# Task 2: Banco — Prisma schema + Neon + migração

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `.env` (a partir de `.env.example`, com a URL real do usuário)

**Interfaces:**
- Consumes: nada
- Produces: `prisma` (singleton) — usado por todas as rotas; modelos `User`, `Category`, `Task`, `Subtask`, `TaskOccurrence`, `Reminder`, `PushSubscription`, `TaskTemplate`

- [ ] **Step 1: Escrever o schema**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  googleId  String   @unique
  name      String
  email     String   @unique
  avatarUrl String?
  createdAt DateTime @default(now())

  tasks      Task[]
  categories Category[]
  occurrences TaskOccurrence[]
  reminders  Reminder[]
  pushSubs   PushSubscription[]
  templates  TaskTemplate[]
}

model Category {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  name   String
  color  String @default("#7FD88F")

  tasks Task[]

  @@unique([userId, name])
  @@index([userId])
}

model Task {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title         String
  notes         String?
  priority      String   @default("media") // alta | media | baixa
  categoryId    String?
  category      Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  rule          Json?    // { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number, daysOfWeek?: number[], endDate?: string }
  reminderPreset String?  // preset do lembrete da tarefa: 'agora'|'30min'|'1h'|'1dia'|'custom'
  ordem         Int      @default(0) // ordem manual (arrastar); prioridade não ordena
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  subtasks    Subtask[]
  occurrences TaskOccurrence[]
  reminders   Reminder[]

  @@index([userId])
}

model Subtask {
  id        String  @id @default(cuid())
  taskId    String
  task      Task    @relation(fields: [taskId], references: [id], onDelete: Cascade)
  title     String
  done      Boolean @default(false)
  ordem     Int     @default(0)

  @@index([taskId])
}

model TaskOccurrence {
  id          String    @id @default(cuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  dueAt       DateTime
  status      String    @default("pendente") // pendente | concluida | ignorada
  completedAt DateTime?

  reminders Reminder[]

  @@unique([taskId, dueAt])
  @@index([taskId, status])
  @@index([dueAt])
}

model Reminder {
  id               String    @id @default(cuid())
  taskId           String
  task             Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  occurrenceId     String?
  occurrence       TaskOccurrence? @relation(fields: [occurrenceId], references: [id], onDelete: Cascade)
  remindAt         DateTime
  status           String    @default("pendente") // pendente | enviado | falhou
  sentAt           DateTime?
  qstashScheduleId String?
  leadMinutes      Int?      // antecedência: 15, 60, 1440 (null = na hora)
  createdAt        DateTime  @default(now())

  @@index([status, remindAt])
}

model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  @@index([userId])
}

model TaskTemplate {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String
  subtasks       Json?    // [{ titulo: string, ordem: number }]
  priority       String   @default("media")
  categoryId     String?
  category       Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  reminderPreset String?  // mesmo enum do lembrete da tarefa
  createdAt      DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Pedir ao usuário a URL do Neon**

Pergunte ao usuário: "Crie um projeto Neon (neon.tech, plano grátis) e me passe a connection string do Postgres (DATABASE_URL)." Enquanto isso, crie `.env.example`:

```bash
# Banco (Neon — neon.tech)
DATABASE_URL=postgresql://user:senha@host/gerenciador?sslmode=require
# Banco de testes (pode ser outro banco no mesmo cluster Neon)
TEST_DATABASE_URL=

# Auth.js v5 (gerar com: npx auth secret)
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# QStash (Upstash — upstash.com)
QSTASH_TOKEN=

# Web Push VAPID (gerar com: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:seu@email.com

# URL base do app (usada no agendamento QStash)
APP_URL=http://localhost:3000
```

- [ ] **Step 3: Cliente singleton**

`src/lib/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Migrar dev e teste**

```bash
cp .env.example .env   # cole a URL real do Neon em DATABASE_URL
npx prisma migrate dev --name init
npx prisma db push     # com DATABASE_URL=TEST_DATABASE_URL setado no .env
```

Expected: migração aplicada; `npx prisma generate` roda automaticamente.

- [ ] **Step 5: Commit**

```bash
git add prisma src/lib/db.ts .env.example && git commit -m "feat: schema prisma (user, categoria, tarefa, subtarefa, ocorrencia, lembrete, push, modelo)"
```

⚠️ `.env` já está no `.gitignore` — nunca commitar.
