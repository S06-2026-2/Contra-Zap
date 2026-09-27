// modelosBot.js
// Catalogo de "qual bot joga nesta sala" -- escolhido em criarSala
// (`modeloBot`, ver conexao/PROTOCOLO.md) e valido pra sala inteira: todo
// Bot da sala e todo assento tomado pelo automatico (timeout/inatividade)
// decide pelo mesmo modelo (ver bots/BotBrain.js).
//
// Modulo puro (sem node:fs) de proposito: o front importa daqui direto,
// igual faz com conexao/chat/mensagensChat.js, entao a lista de opcoes nas
// telas de criar sala nunca dessincroniza da que o servidor aceita.
//
// `arquivo` e o JSON em bots/models/ (gerado por
// training/python/export_weights.py) da rede de rodada >= 2; null = sem
// rede, so o heuristico. A rodada 1 (cega) usa a mesma rede round1.json pra
// todos os modelos com rede -- so existe uma treinada.
export const MODELOS_BOT = [
    {
        id: 'iniciante',
        nome: 'Iniciante',
        descricao: 'Sem rede neural: sempre aposta 1 e joga a última carta da mão.',
        arquivo: null,
    },
    {
        id: 'classico',
        nome: 'Clássico',
        descricao: 'Rede noite1_G — o bot que o jogo sempre usou.',
        arquivo: 'noite1.json',
    },
    {
        id: 'veterano',
        nome: 'Veterano',
        descricao: 'Rede noite1_H — a melhor do grupo de treino noite1.',
        arquivo: 'noite1H.json',
    },
    {
        id: 'campeao',
        nome: 'Campeão',
        descricao: 'Rede slot01 — 96 horas de treino evolutivo, a mais forte.',
        arquivo: 'slot01.json',
    },
];

// Default quando criarSala nao manda `modeloBot`: o mesmo bot de antes desta
// opcao existir, pra sala criada por cliente antigo nao mudar de dificuldade.
export const MODELO_BOT_PADRAO = 'classico';

export function modeloBotPorId(id) {
    return MODELOS_BOT.find(m => m.id === id) ?? null;
}
