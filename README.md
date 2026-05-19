# Controle de Viagem

Dashboard responsivo para controlar os gastos da viagem Europa, com valores em euro e real, intervalos de custo, grafico por categoria e sincronizacao via Supabase.

Tambem inclui uma pagina de roteiro em timeline, com filtro por pais, baseada no roteiro oficial da viagem.

Agora o app tambem tem a pagina **Pontos Turisticos**, focada apenas em visitas e lugares do roteiro, com status de visita confirmada e foto por ponto salva no Supabase Storage.

## Stack

- React + Vite
- TypeScript
- Tailwind CSS
- Framer Motion
- Recharts
- Supabase Database, Realtime e Storage
- LocalStorage como cache/fallback
- AwesomeAPI para cotacao EUR-BRL sem backend

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereco indicado pelo Vite. O projeto esta configurado com `base: '/'` para Firebase Hosting.

## Build

```bash
npm run build
npm run preview
```

## Editar dados iniciais

Os dados ficam em `src/data/initialExpenses.ts`.

Cada gasto usa este formato:

```ts
{
  id: 'transport-milao-tirano',
  category: 'transport',
  country: 'italy',
  title: 'Milao -> Tirano',
  detail: '',
  euro: { min: 26, max: 32 },
  real: { min: 166, max: 205 },
}
```

Para valores fixos, use o mesmo valor em `min` e `max`. Para intervalos, use valores diferentes.

O campo `country` aceita:

- `italy`
- `switzerland`
- `france`
- `international`

## Roteiro

Os itens da pagina **Roteiro** ficam em `src/data/itinerary.ts`.

Cada item segue este formato:

```ts
{
  id: 'd19-1650-eiffel',
  day: 'Dia 19',
  country: 'france',
  city: 'Paris',
  time: '16h50',
  title: 'Torre Eiffel',
  description: 'Parada principal do fim de tarde.',
  type: 'tour',
}
```

Tipos disponiveis:

- `arrival`
- `lodging`
- `tour`
- `transport`
- `food`
- `flight`
- `train`
- `rest`
- `other`

No site, a pagina **Roteiro** tambem permite adicionar, editar, excluir e restaurar o roteiro padrao. As alteracoes sao salvas no Supabase e sincronizadas em tempo real; o `localStorage` fica apenas como cache com a chave `europa-budget-itinerary-v1`.

## Filtros por pais

As paginas **Gastos** e **Roteiro** usam o mesmo componente de filtro por pais:

- Todos
- Itália
- Suíça
- França

Na pagina **Gastos**, o filtro atualiza tabelas, cards, totais e grafico. Na pagina **Roteiro**, o filtro atualiza a timeline mantendo a ordem cronologica.

## Pontos Turisticos

Os pontos turisticos ficam em `src/data/attractions.ts`. Essa lista deve conter apenas visitas e lugares de interesse, sem itens logisticos como check-in, hospedagem, aeroportos, metro, trem, taxi ou refeicoes.

Cada ponto segue este formato:

```ts
{
  id: 'paris-torre-eiffel',
  name: 'Torre Eiffel',
  country: 'france',
  city: 'Paris',
  day: 'Dia 19',
  time: '16h50',
  description: 'Principal marco visual de Paris no fim da tarde.',
}
```

O estado de cada ponto turistico e salvo no Supabase:

- visitado ou pendente
- uma foto por ponto no bucket `attraction-photos`

Antes do upload, a foto e redimensionada/comprimida por `src/utils/imageCompression.ts`.

A lista de pontos tambem pode ser editada pelo site. Os pontos adicionados/editados/excluidos ficam salvos no Supabase, com cache local nas chaves `europa-budget-attractions-list-v1` e `europa-budget-attractions-v1`. O botao **Restaurar pontos padrão** volta para a lista inicial.

## Supabase

O app usa Supabase como fonte principal para:

- Gastos
- Roteiro
- Pontos Turisticos
- Fotos dos pontos turisticos
- Status de visita confirmada
- Check de itens concluidos no roteiro
- Links uteis em gastos, roteiro e pontos turisticos

O arquivo `supabase.sql` contem o schema completo para rodar no Supabase SQL Editor:

- tabelas `travel_groups`, `group_members` e `group_invites`
- tabelas `expenses`, `itinerary_items` e `attractions`
- colunas incrementais `group_id`, `created_by`, `completed` e `links`
- triggers de `updated_at`
- RLS ativo
- policies por `auth.uid()` e membership de grupo
- bucket privado `attraction-photos`
- policies de leitura/upload/update/delete no Storage por pasta do grupo
- RPC `accept_group_invite(invite_token text)`
- RPC `claim_owner_trip_group(...)` para vincular `Viagem Europa` a `aperini351@gmail.com`
- publicacao das tabelas no Supabase Realtime

O frontend usa apenas `SUPABASE_URL` e a publishable/anon key. Nunca coloque `service_role`, senha de banco, Google Client Secret ou outros segredos no frontend.

Variaveis publicas aceitas no frontend, caso sejam movidas para `.env` no futuro:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

O arquivo `.env` ja esta no `.gitignore`; se criar um `.env.example`, mantenha apenas nomes de variaveis e valores ficticios.

### Configurar Google OAuth no Supabase

O erro `Unsupported provider: missing OAuth secret` significa que o Google OAuth ainda nao esta completo no painel do Supabase. O frontend trata esse erro e mantem login por e-mail/senha disponivel, mas o Google so funciona apos esta configuracao manual.

Supabase -> Authentication -> Providers -> Google:

- Enable Sign in with Google: `ON`
- Client IDs: preencher com o Client ID do Google Cloud
- Client Secret: preencher com o Client Secret do Google Cloud
- Salvar as alteracoes

Supabase -> Authentication -> URL Configuration:

- Site URL: `https://viagem-europa-angelo.web.app`
- Redirect URLs:
  - `https://viagem-europa-angelo.web.app/**`
  - `https://viagem-europa-angelo.web.app/auth/callback`
  - `http://localhost:5173/**`
  - `http://localhost:5173/auth/callback`

Google Cloud OAuth:

- Authorized JavaScript origins:
  - `https://viagem-europa-angelo.web.app`
  - `http://localhost:5173`
- Authorized redirect URIs:
  - `https://sgtidxwwimuvcmearbul.supabase.co/auth/v1/callback`

O `localStorage` continua como cache/fallback. Se o Supabase estiver indisponivel, o app mostra um aviso discreto e preserva os dados locais sempre que possivel.

### Perfil do usuario

A pagina `/perfil` usa a migration `supabase/migrations/profile_page_setup.sql` para criar `profiles`, sincronizar nome/avatar/e-mail do Supabase Auth e proteger a leitura por grupo. Rode essa migration no Supabase para habilitar a lista completa de membros com avatar e e-mail.

## Links e horarios

Gastos, Roteiro e Pontos Turisticos aceitam links uteis neste formato:

```json
[
  {
    "label": "Rota para o hotel",
    "url": "https://maps.google.com/..."
  }
]
```

URLs validas devem comecar com `http://`, `https://`, `maps://` ou `geo:`.

Campos de horario em Roteiro e Pontos Turisticos possuem seletor visual em modal/bottom sheet e tambem aceitam edicao manual para preservar horarios textuais antigos, como `09h00-11h00`.

## Cotacao Euro -> Real

A integracao fica em `src/services/currencyService.ts` e usa:

```txt
https://economia.awesomeapi.com.br/json/last/EUR-BRL
```

O app busca a cotacao ao carregar, salva a ultima cotacao valida em `localStorage` e usa esse valor salvo caso a API esteja indisponivel.

Tambem existe um historico simples salvo no navegador para alimentar o grafico da pagina **Cotacao**. A chave da ultima cotacao e `europa-budget-eur-brl-quote-v1`, e a chave do historico e `europa-budget-eur-brl-history-v1`.

Na interface, a alternancia **Originais / Convertidos** controla apenas os valores em Real:

- **Originais:** usa os valores em Real cadastrados nos dados.
- **Convertidos:** recalcula dinamicamente o Real usando os valores em Euro e a cotacao atual.

## Publicar no Firebase Hosting

O app esta configurado para Firebase Hosting frontend-only, sem Authentication e sem Firestore.

Arquivos principais:

- `firebase.json`
- `.firebaserc`
- `vite.config.ts`

O `vite.config.ts` usa:

```ts
base: '/'
```

Build e deploy:

```bash
npm install
npm run build
npm run deploy:firebase
```

Configuracao de hosting:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

A URL atual do Firebase Hosting e `https://viagem-europa-angelo.web.app/`.
