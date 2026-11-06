# Clerk — como criar as credenciais e ligar no código

Guia para quando for gerar as chaves. Vale para os dois repositórios: **front e back usam a MESMA aplicação do Clerk** (as mesmas chaves).
Decisões por trás disso: [CLAUDE.md, seção 6](../CLAUDE.md#6-autenticação-e-usuários-clerk).

> Resumo: o Clerk cuida de senha, Google e sessão. A API só recebe o token, descobre **quem** é (`userId`) e busca **o perfil na nossa tabela `usuarios`**. Nada de perfil/role no Clerk.

---

## 1. Criar a aplicação (≈ 10 min)

1. Crie a conta em <https://dashboard.clerk.com> (plano **Hobby**, gratuito, sem cartão).
2. **Create application**
   - Nome: `CondoCheck` (aparece nos e-mails de código).
   - Opções de login: marque **Email** e **Google**. Desmarque todo o resto (Phone, Username, outros sociais).
3. Você cai numa instância de **Development** — é ela que vamos usar agora.

## 2. Ajustar o que o usuário usa para entrar

No menu **Configure**:

| Onde | O que deixar |
|---|---|
| **User & authentication → Email** | *Sign-up with email* **ligado**; *Verify at sign-up* **ligado** (código por e-mail). *Sign-in with email*: **Password** ligado. *Email verification code* pode ficar ligado também (é o que o front usa quando o Clerk pede verificação extra) |
| **User & authentication → Password** | Ligado. Pode manter as regras padrão |
| **User & authentication → Phone** | **Desligado** (SMS é pago; ver CLAUDE.md) |
| **User & authentication → Username** | Desligado |
| **SSO connections → Google** | Ligado. Em *Development* o Clerk usa credenciais compartilhadas dele — funciona sem configurar nada no Google |
| **Attack protection → Bot protection** | Manter ligado (o formulário do front já tem o `<div id="clerk-captcha" />`) |
| **Restrictions** | Nada por enquanto (quem pode entrar é decidido pela nossa API, não pelo Clerk) |

> Os nomes exatos das telas mudam de vez em quando no painel do Clerk. Se algo não bater, procure pelo recurso (Email, Password, Google) na busca do dashboard.

## 3. Copiar as chaves

**Configure → API keys**. Você verá duas:

| Chave | Formato | Onde vai |
|---|---|---|
| Publishable key | `pk_test_...` | front **e** back |
| Secret key | `sk_test_...` | front (servidor do Next) **e** back. **Nunca** em variável `NEXT_PUBLIC_*` |

### No back (`back/.env`)

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
SEED_ADMIN_EMAIL=seu-email@gmail.com   # o e-mail que você vai usar para entrar
```

### No front (`front/.env.local`)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_MOCK=false                  # sai do modo mock
NEXT_PUBLIC_API_URL=http://localhost:3333
```

As rotas `/entrar` e `/cadastro` já estão no `front/.env.example`; não precisa configurar *Paths* no painel.

## 4. Primeiro login (virar ADMIN)

```bash
cd back
docker compose up -d          # banco + API
npm run seed                  # cria categorias e a linha ADMIN com SEED_ADMIN_EMAIL (clerk_user_id = null)
cd ../front && npm run dev    # http://localhost:3000
```

Entre em `/entrar` com **o mesmo e-mail** do `SEED_ADMIN_EMAIL` (senha ou Google). No primeiro `GET /api/me`, a API vê que não existe usuário com esse `clerk_user_id`, busca o e-mail **verificado** no Clerk, encontra a linha do seed e grava o `clerk_user_id`. A partir daí você é ADMIN.

Quem entra e **não** tem linha em `usuarios` recebe `404` no `/me` → o front manda para `/cadastro/prestador` (fluxo do prestador).

## 5. Testar sem caixa de e-mail de verdade

Na instância de Development, e-mails com o sufixo **`+clerk_test`** não recebem e-mail: o código de verificação é sempre **`424242`**.
Ex.: `sindico+clerk_test@exemplo.com`, `fornecedor1+clerk_test@exemplo.com`. Ótimo para criar vários perfis.

Pegar um token para testar a API com `curl`/Insomnia: com o front aberto e logado, no console do navegador:

```js
await window.Clerk.session.getToken()
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3333/api/me
```

O token dura **60 s** (o front renova sozinho); se der 401 no curl, gere outro.

## 6. Como fica no código (Etapa 1 do [TASKS.md](../TASKS.md))

Nada disso existe ainda no back; é o que será implementado quando as chaves estiverem no `.env`.

```ts
// src/app.ts — dentro do router /api, depois do health
import { clerkMiddleware } from "@clerk/express";

api.use(clerkMiddleware({ authorizedParties: env.FRONTEND_URL })); // lê CLERK_* do ambiente
api.use(carregarUsuario);   // 401 sem sessão; injeta req.usuario
api.use("/me", meRoutes);
// ...
```

```ts
// src/middlewares/auth.ts (esboço)
import { clerkClient, getAuth } from "@clerk/express";

export const carregarUsuario: RequestHandler = async (req, _res, next) => {
  const { userId } = getAuth(req);
  if (!userId) throw new AppError(401, "NAO_AUTENTICADO", "Faça login.");

  let usuario = await prisma.usuario.findUnique({ where: { clerkUserId: userId }, include: {...} });

  if (!usuario) {
    // 1º login de quem foi pré-cadastrado: casa pelo e-mail VERIFICADO no Clerk.
    const u = await clerkClient.users.getUser(userId);
    const email = u.emailAddresses.find(
      (e) => e.id === u.primaryEmailAddressId && e.verification?.status === "verified",
    )?.emailAddress.toLowerCase();
    if (email) usuario = await vincularPorEmail(email, userId); // update ... where clerkUserId is null
  }

  req.clerkUserId = userId;
  req.usuario = usuario ?? undefined; // undefined = só pode chamar POST /prestadores/cadastro e GET /me (404)
  next();
};
```

Pontos importantes:

- **`authorizedParties`**: a API só aceita tokens emitidos para as origens do `FRONTEND_URL` (proteção contra token de outro site).
- A chamada `clerkClient.users.getUser` só acontece **uma vez por usuário** (no 1º login). Depois o `clerk_user_id` já está no banco.
- Só confiar em e-mail **verificado** — com Google ele já vem verificado; com senha, o código por e-mail do cadastro verifica.
- `exigirPerfil("ADMIN", "SINDICO")` por rota; filtro de condomínio nos services.
- Em testes (Vitest), o módulo `@clerk/express` é mockado; não precisamos de chave para rodar o CI.

O front já está pronto para isso: `ApiAuthBridge` ([front/components/providers.tsx](../../front/components/providers.tsx)) manda `Authorization: Bearer <token>` em toda chamada, e o `MeGate` trata o 404 do `/me`.

## 7. Produção (quando for publicar)

O Clerk tem duas instâncias por aplicação: **Development** (`pk_test_`/`sk_test_`) e **Production** (`pk_live_`/`sk_live_`).

| | Development | Production |
|---|---|---|
| Domínio | funciona em `localhost` e em `*.vercel.app` | **exige um domínio seu** (registros DNS/CNAME). Não aceita `*.vercel.app` |
| Google | credenciais compartilhadas do Clerk | **precisa das suas** credenciais OAuth do Google Cloud |
| Aparência | selo "Development mode" | limpo |
| Limites | tem limites de uso de instância de desenvolvimento (confira no painel) | limites do plano Hobby |

**Para a apresentação/TCC** dá para publicar com a instância **Development** mesmo (front na Vercel + API no Render): funciona, só aparece o selo de desenvolvimento. Nesse caso:

- Na Vercel: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` de teste e **remova** `NEXT_PUBLIC_DEMO`.
- No Render: as mesmas chaves + `FRONTEND_URL=https://<seu-app>.vercel.app`.

**Para produção de verdade** (a administradora usando):

1. Registrar um domínio (ex.: `.com.br` no Registro.br, cerca de R$ 40/ano) e apontar para a Vercel.
2. No Clerk: **Create production instance** → informar o domínio → criar os registros DNS que ele pedir.
3. Google Cloud Console → *APIs & Services* → *OAuth consent screen* (tipo External) → *Credentials* → **OAuth client ID** (Web). Em *Authorized redirect URIs* colar a URI que o Clerk mostra em **SSO connections → Google** (instância Production). Copiar Client ID/Secret de volta para o Clerk.
4. Trocar as chaves na Vercel e no Render por `pk_live_`/`sk_live_` e fazer novo deploy.
5. Os usuários da instância de desenvolvimento **não** migram: cada um cria conta de novo (o vínculo com `usuarios` é pelo e-mail, então funciona igual).

## 8. Checklist

- [ ] Aplicação criada, Email + Password + Google ligados, Phone desligado
- [ ] Chaves no `back/.env` e no `front/.env.local`, `NEXT_PUBLIC_MOCK=false`
- [ ] `SEED_ADMIN_EMAIL` preenchido e `npm run seed` rodado
- [ ] Login no front com o e-mail do admin → `GET /api/me` devolve `perfil: "ADMIN"`
- [ ] Conta `+clerk_test` nova → `/me` dá 404 → tela de cadastro de prestador
