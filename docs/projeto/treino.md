# Treino dos bots (`training/`)

Aprendizado por reforço (PPO, self-play, ligas, PBT) que produz as redes
usadas em [bots.md](bots.md). Nada aqui roda em produção nem entra na imagem
Docker. Comandos detalhados em `DEV.md` → "Treino de bot (RL)".

## Ambiente

- Python em venv própria: `training/.venv` (fora do git);
  dependências em `training/python/requirements.txt`.
- Rodar sempre com `training\.venv\Scripts\python.exe training\python\<script>.py`.
- `training/checkpoints/`, `logs/`, `runs/` são ignorados pelo git (alguns
  checkpoints `.pt` e notas `.md` estão versionados à força como referência).

## Dois jeitos de simular a partida

1. **Ponte com o motor JS** — `training/env_bridge.js` sobe um
   `GameController` headless (sem socket) e conversa com o Python via
   stdin/stdout, uma linha JSON por mensagem (`step` com `obs`, `legalMask`,
   `reward`, `done` → resposta `{ action }`). Lado Python:
   `python/env_client.py`. Variáveis: `EVAL_SEED`, `COM_FLAG_APOSTOU`,
   `COM_MEMORIA_CARTAS`.
2. **Motor nativo Python** — `python/motor/` é um **porte fiel** de `game/`
   (`carta`, `baralho`, `mesa`, `rodada`, `partida`, `jogo`, `rng`);
   `python/harness_nativo.py` expõe a mesma interface da ponte, muito mais
   rápido (sem processo/JSON).

Paridade: mesma seed ⇒ mesma distribuição nos dois motores
(`game/seed.test.js` × `python/test_seed.py`, seed 999). A paridade de
**regra** é conferida no `npm test` (ver "Paridade dos motores" em
[testes.md](testes.md)) — mudou regra em `game/`, mude em `python/motor/`.

As máscaras de aposta do treino (`env_bridge.js`,
`harness_nativo.py` e `harness_round1.py`) proíbem o último
a apostar de fechar a soma também na rodada de 1 carta, o que o motor permite.
O treino da rodada cega roda com essa restrição; em produção o `BotBrain.js`
não a aplica.

## Scripts (`training/python/`)

| Script | Papel |
|---|---|
| `model.py` / `model_round1.py` | redes ator-crítico (rodada ≥ 2 / rodada cega) |
| `train.py` / `train_round1.py` | PPO self-play (rodada ≥ 2 / especialista da rodada cega) |
| `ppo.py`, `training_state.py`, `progress.py` | núcleo do PPO, estado de treino, progresso |
| `league.py` | liga determinística de oponentes congelados (self-play / campeões PFSP / âncoras) |
| `pbt.py` | Population Based Training entre processos via arquivos de status |
| `overnight.py`, `funil.py`, `noite1.py`, `orquestrar_4dias.py` | orquestradores de runs longas (rodam sozinhos, sem a sessão do agente) |
| `evaluate.py` | torneio offline (`versus`, `lineup`) com descritores `checkpoint=`, `heuristic`, `random`, `strategy=` |
| `policies.py` | políticas reutilizáveis pelo avaliador |
| `ranking.py` | ranking de runs por `mean_diferenca` a partir dos logs |
| `export_weights.py` | `.pt` → `bots/models/*.json` (formato lido por `bots/rede.js`) |
| `harness_round1.py` | ambiente da rodada cega (`construir_obs_round1`) |
| `paridade_motor.py` | joga os cenários do teste de paridade no motor Python |
| `test_*.py` | testes Python (seed, fim de jogo, loop, maxDeck, liga, orquestrador…) |

## Pipeline até produção

treino → checkpoint `.pt` → `evaluate.py` contra os atuais →
`export_weights.py` → JSON em `bots/models/` → entrada em
`bots/modelosBot.js`.

Formato da observação (110 / 22 números) e das máscaras precisa ser idêntico
entre `env_bridge.js`, `harness_round1.py`/`harness_nativo.py` e
`bots/observacao.js`.
