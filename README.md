# Europa Budget

Dashboard responsivo para controlar os gastos da viagem Europa, com valores em euro e real, intervalos de custo, grafico por categoria e persistencia em `localStorage`.

Tambem inclui uma pagina de roteiro em timeline, com filtro por pais, baseada no roteiro oficial da viagem.

## Stack

- React + Vite
- TypeScript
- Tailwind CSS
- Framer Motion
- Recharts
- LocalStorage
- AwesomeAPI para cotacao EUR-BRL sem backend

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereco indicado pelo Vite. Como o projeto esta configurado para GitHub Pages, a base de producao e `/VIAGEM/`.

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

## Filtros por pais

As paginas **Gastos** e **Roteiro** usam o mesmo componente de filtro por pais:

- Todos
- Itália
- Suíça
- França

Na pagina **Gastos**, o filtro atualiza tabelas, cards, totais e grafico. Na pagina **Roteiro**, o filtro atualiza a timeline mantendo a ordem cronologica.

## Persistencia

O app salva alteracoes no navegador com a chave `europa-budget-expenses-v1`. O botao **Resetar dados iniciais** restaura a planilha original.

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

## Publicar no GitHub Pages

O `vite.config.ts` esta configurado com:

```ts
base: '/VIAGEM/'
```

Isso considera que o repositorio no GitHub se chama `VIAGEM`. Se usar outro nome, troque o `base` para `/<nome-do-repositorio>/`.

### Opcao 1: GitHub Actions

O workflow `.github/workflows/pages.yml` publica automaticamente o `dist` quando houver push na branch `main`.

Depois de criar/conectar o repositorio remoto:

```bash
git add .
git commit -m "create europa budget dashboard"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/VIAGEM.git
git push -u origin main
```

No GitHub, configure Pages para usar **GitHub Actions**.

### Opcao 2: branch gh-pages

Tambem existe o script:

```bash
npm run deploy
```

Nesse caso, configure Pages para usar a branch `gh-pages`.
