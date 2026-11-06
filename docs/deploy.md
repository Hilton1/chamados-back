# Deploy gratuito — Supabase + Render + GitHub Actions

Custo: **R$ 0**, sem cartão. Por que essas escolhas e as alternativas: [CLAUDE.md, seção 12](../CLAUDE.md#12-deploy-e-cicd).

```
Vercel (front) ──HTTPS──▶ Render (API, imagem Docker) ──▶ Supabase Postgres (pooler 6543)
                                   │
                                   └──────────────────────▶ Supabase Storage (bucket privado "anexos")
GitHub Actions: PR → lint/typecheck/test/build · main → migrate deploy → Deploy Hook do Render
```

## 1. Supabase (banco + storage)

1. <https://supabase.com> → **New project**. Região: **East US (North Virginia)**, a mesma do Render (`virginia`). API e banco perto um do outro pesa mais que a distância até o usuário, porque uma requisição faz várias consultas.
2. Guarde a senha do banco.
3. **Connect** (botão no topo) → *ORMs → Prisma*, ou *Project Settings → Database → Connection string*:

   | Variável | Qual conexão | Formato |
   |---|---|---|
   | `DATABASE_URL` | **Transaction pooler**, porta **6543** | `postgresql://postgres.<ref>:<senha>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | **Session pooler**, porta **5432** | `postgresql://postgres.<ref>:<senha>@aws-0-us-east-1.pooler.supabase.com:5432/postgres` |

   > Use o **Session pooler** no `DIRECT_URL`, não a "Direct connection" (`db.<ref>.supabase.co`): a direta é só IPv6 no plano free, e os runners do GitHub Actions não têm IPv6 — a migration falharia no CI.

4. **Storage → New bucket**: nome `anexos`, **Public: desligado**, *File size limit* 5 MB, *Allowed MIME types* `image/jpeg, image/png, application/pdf` + DOCX e XLSX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). Crie também o `anexos-dev` igual.
5. **Project Settings → API**: copie `Project URL` (`SUPABASE_URL`, **só o domínio**, sem `/rest/v1/`) e a **Secret key** `sb_secret_...` (`SUPABASE_SERVICE_ROLE_KEY`; substitui a antiga service_role). Essa chave ignora RLS: só no Render/`.env` do back, nunca no front.

**Um projeto Supabase só** serve aos dois ambientes: o banco do Supabase é o de **produção** (dev usa o Postgres do Docker) e o storage tem **dois buckets privados**, `anexos` (produção, `STORAGE_BUCKET=anexos` no Render) e `anexos-dev` (desenvolvimento, `STORAGE_BUCKET=anexos-dev` no `.env` local), assim arquivos de teste não se misturam com os reais. Os dois com limite de 5 MB e tipos JPG, PNG, PDF, DOCX e XLSX.

Limites do free (conferir no painel): 500 MB de banco, 1 GB de storage, **pausa após 7 dias sem uso** (o workflow `manter-acordado` evita isso).

## 2. Render (API)

1. <https://render.com> → entre com o GitHub → **New → Blueprint** → escolha o repositório `back`. Ele lê o [render.yaml](../render.yaml) (Docker, plano free, health check em `/api/health`).
2. Preencha as variáveis marcadas como `sync: false`:

   | Variável | Valor |
   |---|---|
   | `FRONTEND_URL` | `https://<app>.vercel.app` (várias origens separadas por vírgula) |
   | `DATABASE_URL`, `DIRECT_URL` | do passo 1.3 |
   | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | [clerk-setup.md](clerk-setup.md) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | do passo 1.5 |

3. **Settings → Deploy Hook** → copie a URL (vira o secret `RENDER_DEPLOY_HOOK_URL`).
4. A URL pública fica `https://chamados-api.onrender.com` (ou parecida). Teste: `/api/health` → `{"status":"ok","banco":"ok"}`.

O plano free **dorme após 15 min** sem tráfego; a 1ª requisição depois disso leva ~1 min. O front já mostra "tentar novamente" nesse caso.

## 3. GitHub Actions

Repositório `back` → *Settings → Secrets and variables → Actions*:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `DIRECT_URL` | Session pooler do Supabase (passo 1.3) |
| Secret | `RENDER_DEPLOY_HOOK_URL` | passo 2.3 |
| Variable | `API_HEALTH_URL` | `https://<api>.onrender.com/api/health` (liga o ping a cada 10 min, 07h–21h) |

Crie também o *Environment* `production` (Settings → Environments); o job de deploy usa ele e dá para exigir aprovação manual lá, se quiser.

Fluxo: [ci.yml](../.github/workflows/ci.yml) roda em todo PR; no push na `main` roda `prisma migrate deploy` **antes** de chamar o Deploy Hook, então a API nova nunca sobe com o banco desatualizado.

## 4. Primeiro deploy

```bash
# 1. Com os secrets cadastrados, push na main → CI aplica as migrations e dispara o Render.
# 2. Seed uma única vez, da sua máquina, apontando para o Supabase:
DATABASE_URL="<DIRECT_URL do Supabase>" SEED_ADMIN_EMAIL="voce@..." npm run seed
```

## 5. Front (Vercel)

Nas variáveis do projeto da Vercel: `NEXT_PUBLIC_API_URL=https://<api>.onrender.com`, chaves do Clerk, **sem** `NEXT_PUBLIC_MOCK` e **sem** `NEXT_PUBLIC_DEMO`. Novo deploy.

## 6. Trocar de hospedagem

A API é uma imagem Docker comum (`docker build .` gera a de produção, último estágio do [Dockerfile](../Dockerfile)). Para Koyeb, Northflank ou Cloud Run: criar o serviço a partir do repositório/Dockerfile, copiar as mesmas variáveis, apontar o health check para `/api/health` e trocar o passo "Deploy no Render" do CI pelo equivalente.
