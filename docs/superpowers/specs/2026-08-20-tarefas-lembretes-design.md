# Gerenciador Pessoal — Módulo 1: Tarefas + Lembretes (design atualizado)

**Data:** 2026-08-20
**Status:** Design aprovado pelo usuário (atualiza a spec de 2026-08-13)

---

## 1. Contexto e objetivo

Projeto criado do zero: uma "secretária pessoal" mobile-first. O módulo 1 é o coração dela: **tarefas com lembretes por push**. Os módulos seguintes (finanças, organizador, saúde) entram depois, cada um com seu próprio ciclo design → plano → implementação.

**Critério de sucesso:** o usuário adiciona uma tarefa com vencimento e lembrete no celular e recebe a notificação push na hora certa, mesmo com o app fechado; usa o app diariamente na tela inicial do celular.

**Ampliações do módulo 1 (aprovadas em 2026-08-20):**
- Subtarefas/checklist dentro de uma tarefa
- Modelos de tarefas (cópia ao usar)
- Calendário em grade (4ª tela, leitura)
- Recorrência multi-dia (1 ocorrência por dia marcado)
- Ordem manual sempre (arrastar para reordenar; prioridade vira rótulo)
- Lembretes antecipados (15min/1h/1dia) + re-push até concluir + resumo diário de manhã

## 2. Decisões e justificativas

| Decisão | Escolha | Por quê |
|---|---|---|
| Plataforma | **PWA** | Instala na tela inicial, funciona offline, notificação push, um deploy só |
| Hospedagem | **Vercel** | Escolha do usuário; padrão para Next.js |
| Dados | **Postgres (Neon) + Prisma** | Sincroniza entre celular e PC; schema tipado e migrado |
| Autenticação | **Auth.js com Google** | 1 clique, sem senha nova, mais seguro |
| Lembretes | **QStash (Upstash) + Web Push (VAPID)** | Agendamento em horário exato; plano gratuito cobre o volume |
| Stack | **Next.js 15 + TypeScript** | Front + API no mesmo projeto, um deploy, docs oficiais da Vercel |
| UI | **Sem framework de UI — componentes próprios** | Controle total do visual; estilo incomum exige isso |
| Subtarefas | **Tabela `Subtask` própria** | Entidade consultável, validação forte, base para modelos; não é `Task` filha (evita complexidade de árvore) |
| Modelos | **Cópia ao usar** | Previsível: editar o modelo não afeta tarefas já criadas; sem sync bidirecional |
| Recorrência | **`daysOfWeek` na regra JSON** | 1 ocorrência por dia marcado; motor estendido, sem tabela extra |
| Ordem | **Manual sempre** | Prioridade vira rótulo; o que o usuário posiciona fica onde pôs |
| Lembrete | **Re-push a cada ~10min até concluir/ignorar ou fim do dia** | Insiste com app fechado; para ao concluir; teto de re-pushes evita ruído infinito |
| Som | **Padrão do aparelho** | Web Push já toca o som do sistema; repetição via re-push (não som local) |

## 3. Escopo do módulo 1 (atualizado)

**Dentro:**
- CRUD de tarefas com: título, notas, prioridade (alta/média/baixa), categoria, data/hora de vencimento, recorrência, lembrete
- CRUD de **subtarefas** (título, concluída, ordem) dentro de cada tarefa
- CRUD de **modelos de tarefas** (nome + subtarefas padrão + prioridade/categoria/lembrete padrão); usar = criar cópia
- **Ordem manual** nas listas (arrastar; campo `ordem`)
- CRUD de categorias (nome + cor)
- Tarefas recorrentes (diária/semanal/mensal/anual + **dias da semana** + intervalo + fim opcional)
- Lembretes por push com agendamento exato, **antecedência** (15min/1h/1dia), **re-push até concluir/ignorar ou fim do dia**, **resumo diário de manhã**
- Login com Google, multiusuário isolado (dados por usuário)
- PWA: instalável, ícone, app shell offline (ver tarefas sem conexão), tema escuro único
- 4 telas: Hoje, Lista, Concluídas, **Calendário (grade mensal de leitura)** + modal de nova tarefa

**Fora do módulo 1:**
- Sincronização offline de *escritas* (fila IndexedDB) — v1 exige conexão para criar/editar
- Módulos de finanças, notas, saúde
- Arrastar tarefas **entre dias no calendário** (reagendar arrastando) — v1 é leitura
- Subtarefa com data/lembrete próprios (subtarefa é item marcável; data é da tarefa)
- Modelos com recorrência (modelo não tem recorrência — YAGNI)

## 4. Arquitetura

```
[PWA React (Next.js)] → [API Routes na Vercel] → [Postgres (Neon)]
        │                        │
        └── Service Worker ←─────┘  Web Push (VAPID)
                                  │
                        [QStash — agendador de lembretes + cron resumo diário]
```

- **Next.js 15 (App Router) + TypeScript** — páginas + API routes, um deploy
- **Prisma** no Postgres — schema versionado com migrações
- **Auth.js** com provider Google — sessão em cookie seguro; toda query filtra por `userId`
- **QStash** — agenda callback HTTP no momento exato do lembrete; re-push em cadeia (one-shot +10min); cron diário do resumo
- **web-push** — envia a notificação via VAPID

## 5. Modelo de dados (Prisma)

| Tabela | Campos principais | Notas |
|---|---|---|
| `User` | googleId (único), nome, email, avatarUrl | criado no primeiro login |
| `Category` | userId, nome, cor | cor = hex |
| `Task` | userId, título, notas, prioridade, vencimento (`dueAt`), concluída, `completedAt`, categoriaId, `ordem`, regra de recorrência | regra aninhada; `ordem` para ordenação manual |
| `Subtask` | taskId (FK), título, concluída, `ordem` | entidade própria; checklist da tarefa |
| `TaskOccurrence` | taskId, `dueAt`, status (pendente/concluída/ignorada) | é o que aparece nas listas |
| `Reminder` | taskId, `remindAt`, status (pendente/enviado/falhou), `sentAt`, `qstashMessageId`, `leadMinutes?` | 1+ por tarefa; `leadMinutes` = antecedência |
| `PushSubscription` | userId, endpoint, p256dh, auth | 1+ por usuário |
| `TaskTemplate` | userId, nome, `subtasks` (JSON: `[{titulo, ordem}]`), prioridade, categoriaId, `lembretePadrao` (JSON) | modelo; sem data (preenchida ao usar) |

**Regra de recorrência** (campo JSON em `Task`): `{ frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number, daysOfWeek?: number[], endDate?: date }` — `daysOfWeek` (0=domingo…6=sábado) usado quando `frequency = 'weekly'`; gera **uma ocorrência por dia marcado**.

**Semântica de recorrência:** o usuário cria uma tarefa com regra → o sistema **materializa ocorrências concretas** (`TaskOccurrence`). A primeira ocorrência é gerada no vencimento; ao concluir uma ocorrência recorrente, a próxima é gerada automaticamente (a partir da regra). Se `endDate` passou, não gera. Com `daysOfWeek`, a "próxima" é o próximo dia marcado após a conclusão; se o vencimento cai num dia não marcado, a primeira ocorrência é o primeiro dia marcado >= vencimento.

## 6. API (todas exigem sessão Google)

| Endpoint | Ação |
|---|---|
| `POST /api/tasks` | criar tarefa (+ ocorrência inicial + subtarefas + lembretes) |
| `GET /api/tasks` | listar (filtros: hoje, atrasadas, por categoria, prioridade, busca) |
| `PATCH /api/tasks/:id` | editar, concluir, desfazer conclusão, editar subtarefas, reordenar |
| `DELETE /api/tasks/:id` | excluir (com suas ocorrências/lembretes/subtarefas) |
| `POST /api/tasks/:id/subtasks` | adicionar subtarefa a tarefa existente |
| `PATCH/DELETE /api/tasks/:id/subtasks/:subtaskId` | editar/excluir subtarefa |
| `POST /api/tasks/reorder` | reordenar em lote (`[{taskId, ordem}]`) |
| `GET/POST/PATCH/DELETE /api/categories` | CRUD de categorias |
| `GET/POST/PATCH/DELETE /api/templates` | CRUD de modelos |
| `POST /api/templates/:id/apply` | usar modelo → cria cópia (`Task` + `Subtask`s + `Reminder`), data preenchida no modal |
| `GET /api/calendar?month=YYYY-MM` | tarefas agrupadas por dia do mês (leitura) |
| `POST /api/push/subscribe` | registrar aparelho para push |
| `DELETE /api/push/subscribe` | remover aparelho |
| `POST /api/reminders/trigger` | **chamado pelo QStash** — valida assinatura, busca lembrete, envia push; se pendente, agenda re-push +10min |
| `POST /api/reminders/daily-digest` | **cron QStash diário** — valida assinatura, consulta pendentes do dia, envia 1 push resumo |

**Concluir tarefa recorrente:** marca a ocorrência concluída, gera a próxima (regra) e agenda o lembrete dela.

## 7. Fluxo de lembrete (com re-push e resumo diário)

1. Criar tarefa com `remindAt` (+ `leadMinutes` opcional) → grava `Reminder(pendente)` + agenda **1º callback no QStash** para o horário de disparo (`remindAt - leadMinutes`, ou `remindAt` se sem antecedência)
2. No horário, QStash chama `POST /api/reminders/trigger` com `reminderId`
3. A rota valida a assinatura do QStash (HMAC) → busca o lembrete → se a tarefa **não** concluída/ignorada:
   - envia push (Web Push, som do aparelho)
   - agenda **re-push em +10min** (novo QStash one-shot) **enquanto** a tarefa seguir pendente
4. Repetição: a cada disparo, verifica a tarefa; concluída/ignorada → **para**. Pendente → re-push +10min
5. **Limites:** re-push para no **fim do dia** (23:59 do dia do lembrete); **teto** de re-pushes por lembrete (máx. 30/dia) para não zumbir infinito
6. Falha: QStash re-tenta com backoff; se falhar permanentemente → `falhou` e o lembrete aparece pendente na tela Hoje
7. **Editar tarefa com lembrete enviado:** gera lembrete novo se a nova data ainda estiver no futuro; **cancela re-pushes agendados** e agenda do zero
8. **Resumo diário de manhã:** cron QStash diário (ex.: 7h horário local) → `POST /api/reminders/daily-digest` → consulta pendentes do dia → 1 push resumo ("Você tem 5 tarefas hoje"). Sem re-push (é resumo, não lembrete crítico)

**Lembrete no passado:** não agenda; avisa na criação.

## 8. Interface — estilo "Terminal" (aprovado visualmente)

- **Base:** `#0F1110` (preto esverdeado), texto `#E6E4DC`, secundário `#6E736B`
- **Acento único:** verde CRT `#7FD88F` (checkbox, seções, botão principal)
- **Prioridade alta:** âmbar `#E5A050` (única cor semântica extra) — **rótulo**, não ordena
- **Tipografia:** monospace (Consolas/Menlo/SF Mono, fallback `monospace`); labels em maiúsculas com espaçamento largo; datas grandes
- **Elementos:** checkbox `[ ]`/`[x]`, separadores tracejados `- - -`, títulos de seção com `>`, cantos retos, sem cards, sem sombras, sem gradientes
- **Ícone do app:** `[✓]` em preto + verde CRT

**Telas:**
- **Hoje** — pendentes ordenadas por **ordem manual**, prioridade como rótulo; subtarefas expandíveis (`[ ]` por subtarefa); lembretes pendentes (falhados) no topo; FAB `+`
- **Lista** — busca `> buscar:` + filtros chips `[casa] [saúde] [!alta]`; agrupada por data com **ordem manual dentro do grupo**; **arrastar para reordenar**
- **Concluídas** — histórico, desfazer; subtarefas concluídas riscadas
- **Calendário** (NOVA) — grade mensal de leitura; cada dia mostra contagem/indicador de tarefas; tocar num dia abre a lista daquele dia; navegação mês a mês (`< julho >`); **não cria/edita**

**Modal de nova tarefa (bottom sheet)** — campos: `título:`, data/hora, `[categoria]`, `[prioridade]`, recorrência (com **dias da semana** quando weekly), **lista de subtarefas** (`+ adicionar item`), **lembrete com antecedência** (na hora/15min/1h/1dia), **seletor de modelo** (aplicar preenche campos como cópia), botões `[cancelar]` `[salvar]`

**Arrastar/reordenar:** drag-and-drop touch + mouse (mobile long-press), persiste posição via `POST /api/tasks/reorder`.

## 9. Erros, validação e casos de borda

- Validação **zod** em toda entrada; `400` com mensagem clara, `401` sem sessão, `404` recurso inexistente
- Subtarefas validadas como array de `{titulo, concluida, ordem}`; modelos: `nome` obrigatório, `subtasks` opcional
- UI otimista com rollback e mensagem de erro em estilo terminal (`[erro] …`)
- Push sem permissão → lembrete `falhou`, visível na tela Hoje
- Recorrência com fim no passado → não gera próxima
- Exclusão de categoria com tarefas → tarefas ficam sem categoria (não exclui tarefas)
- Exclusão de tarefa → remove subtarefas, ocorrências e lembretes (cascata)
- Exclusão de modelo → não afeta tarefas já criadas (cópia, não vínculo)

## 10. Testes

- **Unitários (Vitest):** cálculo de recorrência (frequências, intervalos, `daysOfWeek`, fim) — núcleo mais propenso a erro; regras de lembrete (antecedência, re-push: quando para, teto, fim do dia); subtarefas (CRUD, ordem); modelos (cópia)
- **API:** CRUD + conclusão com recorrência, contra banco de teste; subtarefas; reorder em lote; apply de modelo; validação zod
- **E2E (Playwright):** fluxo no viewport mobile — criar → concluir → ver próxima ocorrência; criar com subtarefa; aplicar modelo; reordenar (se viável em automação)

## 11. Deploy e ambiente

| Serviço | Uso | Custo |
|---|---|---|
| Vercel | deploy (git) | grátis |
| Neon (Postgres) | banco | grátis |
| Google Cloud OAuth | login | grátis |
| Upstash QStash | agendador + cron resumo diário | grátis |
| VAPID | chave gerada no projeto | grátis |

Tudo em variáveis de ambiente; `.env.example` documenta. Onde `.env` e `.superpowers/` entram no `.gitignore`. Cron do resumo diário: **QStash cron** (não Vercel cron — QStash cuida do horário exato + retry).

## 12. Etapas de construção

1. **Fundação** — Next.js + TS, Prisma + Neon, Auth.js/Google, deploy Vercel
2. **Núcleo** — CRUD tarefas/categorias/subtarefas + recorrência (multi-dia) + modelos (cópia) + reorder
3. **Interface** — 4 telas + modal (com subtarefas, modelos, multi-dia, antecedência) no estilo Terminal
4. **Lembretes** — QStash + web-push + subscribe do aparelho + re-push + resumo diário
5. **PWA** — manifest, ícone `[✓]`, app shell offline

## 13. Roadmap futuro

Módulo 2: finanças pessoais · Módulo 3: organizador/notas · Módulo 4: saúde — cada um com design → plano → implementação próprios.
