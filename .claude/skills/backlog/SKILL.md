---
name: backlog
description: Consultar e manter o docs/backlog.md do Contra ZAP. Use antes de executar ou recomendar uma mudança (para achar item igual ou vizinho), ao terminar (para tirar ou encurtar o que foi resolvido), ao achar um problema fora do escopo (para registrar) e quando pedirem limpeza ou a próxima tarefa do backlog. Não use para dúvida ou leitura que não leva a mudança.
---

# Backlog

`docs/backlog.md` é a única lista do que falta fazer. Bugs da mesa já
investigados, com causa e correção, estão em `docs/relatorio-bugs-dev.md`
(retrato de 2026-10-28: confirme no código antes de usar e não edite).

## 1. Antes de executar ou recomendar

Busque no backlog e no relatório pelo arquivo, pelo termo do código e pelo nome
que o grupo usa (ex.: `Partida.jsx`, `criandoRevanche`, "revanche"). Não precisa
ler tudo.

| Achou | Faça |
|---|---|
| o mesmo item | é a própria tarefa; use o que está escrito e trate no passo 2 |
| item vizinho (mesmo arquivo ou mesma causa) | ofereça em uma linha e **só junte com o ok da pessoa** |
| item em "PIN" | avise que foi adiado de propósito antes de recomendar |
| nada | siga |

## 2. Ao terminar

| Situação | Faça |
|---|---|
| resolvido e verificado | remova o item, na mesma mudança que o resolveu |
| resolvido em parte | deixe só o que falta |
| não dá para verificar (visual, aparelho, produção) | não remova; diga à pessoa o que testar |
| a pessoa confirmou que testou | remova |

Verificado é ter teste que passa ou reprodução que deixou de ocorrer. "O código
parece certo" não basta. Na dúvida, fica.

## 3. Achado novo, fora do escopo

Só entra problema com evidência; ideia de melhoria sem pedido não entra. Confira
antes se já existe. Formato, em até 4 linhas, na seção da área:

```
- [ ] 🟡 **Nome curto** (`caminho/do/arquivo`) — sintoma; como reproduzir.
      Causa, se confirmada.
```

🔴 atrapalha jogar ou bug grave · 🟡 falta informação ou robustez · 🟢 polimento.

Item vago que você investigou: reescreva com o que descobriu, sem apagar o relato
original se ele não foi explicado.

## 4. Limpeza geral (só quando pedirem)

Confira cada item contra o código e o histórico (`git log`) e apresente três
listas, com a evidência de cada um: **já resolvido**, **continua valendo** e
**precisa de teste da pessoa**. Não apague antes da aprovação.

No resumo final da tarefa, diga o que entrou, saiu ou mudou no backlog.
