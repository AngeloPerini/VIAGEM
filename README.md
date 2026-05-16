# Europa Budget

Dashboard responsivo para controlar os gastos da viagem Europa, com valores em euro e real, intervalos de custo, grafico por categoria e persistencia em `localStorage`.

Tambem inclui uma pagina de roteiro em timeline, com filtro por pais, baseada no roteiro oficial da viagem.

Agora o app tambem tem a pagina **Pontos Turisticos**, focada apenas em visitas e lugares do roteiro, com status de visita confirmada e uma foto local por ponto.

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

O estado de cada ponto turistico e salvo no `localStorage` com a chave `europa-budget-attractions-v1`:

- visitado ou pendente
- uma foto em base64 por ponto

Antes de salvar, a foto e redimensionada/comprimida por `src/utils/imageCompression.ts` para reduzir o risco de limite do `localStorage`.

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

A URL atual do Firebase Hosting e `https://os-manutencao-efa58.web.app`.
