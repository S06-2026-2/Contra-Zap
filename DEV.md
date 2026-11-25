# Contra ZAP — notas de desenvolvimento

Tudo que é detalhe de quem mexe no código. Pra rodar o projeto, ver o
`README.md`. Pro contrato de eventos socket.io, ver `conexao/PROTOCOLO.md`.
O que falta fazer fica em `docs/backlog.md`.

---

## Mexendo no front-end (React)

`public/dist` (o que o `Server.js` serve) só é atualizado quando você roda
`npm run build` — reiniciar o `Server.js` sozinho **não** reflete mudanças em
`public/app/src`. Pra não ter que buildar toda hora enquanto desenvolve:

1. Num terminal, na raiz: `npm start` (sobe só o back-end, porta 3000).
2. Em outro terminal, dentro de `public/app`: `npm run dev` (sobe o Vite,
   porta 5173, já configurado em `vite.config.js` pra proxiar `/socket.io`
   pro back-end em `:3000`).
3. Abra `localhost:5173` — qualquer edição em `public/app/src` aparece na
   hora, sem precisar buildar nem reiniciar nada.

Quando terminar, **rode `npm run build`** antes de commitar — o servidor de
"produção" serve o `public/dist`, não o Vite.

O código do front fica todo em `public/app/src`:
- `App.jsx` — componente raiz, decide qual tela mostrar.
- `socket.js` — conexão com o back-end via socket.io-client.
- `sessao.js` — persistência da sessão (sessionStorage) e retomada depois de
  reconexão/F5.
- Sem rotas além dos labs (ver `main.jsx`): `/lab` (cérebro do bot) e os
  labs temporários de `labsTemporarios/` (`LabNome.jsx` vira `/lab-nome`).
  Esses ficam só nas branches de trabalho: depois do merge, a pasta é
  apagada na `main` à mão e a branch fica guardada com ela. Tela inicial,
  customização, salas e partida são estado do `App.jsx`.
- `components/meetfront2/` — a tela inicial (`Inicio.jsx`): **JOGAR**
  (salas) e **CUSTOMIZAÇÃO** (`Customizacao.jsx`). Sem sessão, os dois
  abrem o pop-up de login (`PopupLogin.jsx`: fluxo em etapas + convidado
  direto, com nome do campo ou `Fantasma####` sorteado). Com sessão, o topo
  da tela inicial tem **SAIR** (limpa a sessão e recarrega); as salas têm
  **◀ INÍCIO**. A customização é a loja (cor no círculo pastel, chapéus),
  com o saldo de fichas no topo; o aviso "+N FICHAS" (`AvisoFichas.jsx`)
  aparece em qualquer tela assim que você sai da partida. A Partida usa a
  do meetfront1 com a própria `MesaExperimento.jsx` (prop `Mesa`), que
  importa o resto de `meetfront1/`. CSS próprio em `meetfront2.css`,
  escopado em `.mf2`. A mesa usa a cor/chapéu que vêm do servidor
  (`chapeuPorId`/`tom` em `visual.js`).
- `components/meetfront1/` — a Partida (socket/estado) e as peças da mesa
  (cartas, fantasminhas, manilhas, filtro de tela, layout de celular).
  CSS próprio em `meetfront1.css`, escopado em `.mf1`.
- `components/arcade/` — a casca das telas fora da partida (`Casca.jsx`,
  `Modal.jsx`, som, filtro) e a lista de salas (`Lobby.jsx`).
- **Fichas e loja** — regras em `conexao/loja.js` (compartilhado com o
  front), carteira em `conexao/carteira.js` (conta no banco, convidado em
  memória). Contrato em `conexao/PROTOCOLO.md`, seção "Carteira e loja".

As outras frentes (debugging, arcade, novo, meetfront1 e mescla como
frentes completas, o seletor `/front`, os labs de pouso/mão, a demo de
desempenho e a vitrine do fantasminha) ficaram só na branch
**`StashedFronts`**, como referência.

Pra testar sozinho, crie uma sala com o resto dos assentos em bot (ex.:
`numberPlayers: 2, botNumber: 1`) — a partida roda inteira só com você.

**Antes de mexer no protocolo de eventos (o que o cliente manda/recebe do
servidor), leia `conexao/PROTOCOLO.md`** — é a fonte de verdade de todos os
eventos socket.io, payloads e erros possíveis.

---

## Docker — por que Node 22 + Alpine

Só documentando pra ninguém precisar redescobrir isso: o binário nativo do
`better-sqlite3` não tem prebuild compatível pra Node 20, e a combinação
certa (Node 22 + musl/Alpine + arm64) ainda assim exige compilar o addon do
zero dentro do container — por isso o `Dockerfile` instala `python3 make
g++` mesmo usando Alpine. Trocar a versão do Node no `Dockerfile` sem
confirmar compatibilidade com o `better-sqlite3` provavelmente quebra o
build de novo.

## CI/CD

Todo push/PR contra a `main` roda no GitHub Actions
(`.github/workflows/ci.yml`): build da imagem Docker, `npm test`, validação
do OpenAPI/AsyncAPI + coleção do Postman (Newman) contra o servidor de pé, e
o E2E do Playwright contra o container. O `npm test` inclui os unitários de
`game/` e `conexao/`.

---

## Treino de bot (RL)

### Avaliador offline de bots

O avaliador reutiliza o motor real da partida, mas não liga modelos treinados
ao servidor. Rode com a venv de `training`:

```powershell
training\.venv\Scripts\python.exe training\python\evaluate.py versus `
  --candidate checkpoint=training\checkpoints\overnight.pt `
  --opponent heuristic --games 10000 --seed 42
```

Também há escalação livre dos quatro assentos:

```powershell
training\.venv\Scripts\python.exe training\python\evaluate.py lineup `
  --players checkpoint=training\checkpoints\overnight.pt heuristic random heuristic
```

Descritores aceitos: `checkpoint=<arquivo.pt>`, `heuristic`, `random` e
`strategy=<módulo>:<Classe>`. Uma estratégia Python deve expor
`act(kind, obs, legal_mask, rng)` e devolver uma ação permitida. O resultado
aparece no console e é salvo como JSON em `training/logs/`.

### Treino contra liga

O treinador aceita um manifesto de liga com checkpoints congelados e executa
PPO somente nos assentos controlados pelo aprendiz. A mistura usada no
experimento evolutivo é 50% self-play, 35% campeões históricos selecionados
por PFSP e 15% âncoras (H, overnight, heurístico e aleatório). O orquestrador
em `training/python/orquestrar_4dias.py` gera esses manifestos, preserva
checkpoints completos e usa torneios no motor JavaScript para a seleção.

### Paridade JS × Python

O motor em `training/python/motor/` é um porte fiel do `game/` JS. Com a
mesma `seed`, os dois distribuem a partida idêntica — `game/seed.test.js` e
`training/python/test_seed.py` pinam a mesma referência (`seed 999`); se um
lado divergir, o teste do lado que mudou quebra. A regra também é conferida:
`tests/paridade/motores.test.js` joga as mesmas partidas nos dois motores.

A `seed` (inteiro) também entra pelo `criarSala`: fixa o embaralhamento,
então a mesma seed reproduz a partida carta por carta. Ausente = aleatório
de sempre.
