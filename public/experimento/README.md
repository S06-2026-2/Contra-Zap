# experimento

Playground de front isolado pra testar ideias visuais da tela inicial (a
etapa de nome do `Login.jsx` de verdade) sem precisar ligar o resto do
sistema. Não importa nada de `conexao/*`, não abre socket, não builda pra
`public/dist` — é um motor Vite próprio, separado do `public/app`.

## Rodar

```
cd public/experimento
npm install   # só na primeira vez
npm run dev
```

Não precisa do `GameStart.js`, do `Server.js` nem de banco. É multi-página:
cada rota é um `.html` na raiz desta pasta, servido direto pelo Vite em dev,
sem precisar mexer em nada pra criar uma nova.

- `http://localhost:5175/` — telas de nome (nome fixo, ver `App.jsx`).
- `http://localhost:5175/bola.html` — bola de SVG maior que a tela, encolhe
  ao clicar (clica de novo pra crescer de volta).

## Estrutura

- `index.html` + `src/App.jsx` — casca com abas, uma por ideia de tela de
  nome.
  - `src/ideias/*.jsx` — cada arquivo é uma variação. `Ideia1Atual.jsx`
    reproduz o visual atual do app de verdade, serve de referência pras
    outras.
  - `src/estilo.css` — CSS de todas as ideias, cada uma com prefixo próprio
    (`.ideia1-`, `.ideia2-`...) pra não vazar estilo entre elas.
- `bola.html` + `src/bola/` — rota isolada da bola (`Bola.jsx` + `bola.css`),
  zero import cruzado com o resto.

Pra propor uma ideia nova de tela de nome: copia um arquivo de `ideias/`,
ajusta o visual, registra em `IDEIAS` no `App.jsx` e pronto — ganha uma aba
nova. Pra um experimento totalmente à parte (como a bola): cria um
`nome.html` na raiz apontando pra um `src/nome/main.jsx` próprio, e lista o
`.html` novo em `build.rollupOptions.input` no `vite.config.js` (só importa
pro `build` — em `dev` já funciona sem isso).
