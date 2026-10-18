// observabilidade/metricas.js
//
// Métricas expostas no formato Prometheus, em /metrics (ver Server.js).
// Esse arquivo só DEFINE as métricas e exporta funções pra outros módulos
// chamarem quando o evento relevante acontecer — ele não sabe nada sobre
// Socket.IO, salas ou bots, de propósito (mesmo princípio de isolamento de
// conexao/db.js só saber SQL).
//
// Métricas de processo (CPU, memória, event loop lag, uptime) vêm de graça
// via collectDefaultMetrics — não precisa instrumentar nada pra ter isso.
import client from 'prom-client';

export const registro = new client.Registry();
client.collectDefaultMetrics({ register: registro });

// --- Métricas de jogo (instrumentadas manualmente) -------------------------

export const partidasAtivas = new client.Gauge({
    name: 'contrazap_partidas_ativas',
    help: 'Número de partidas em andamento neste momento (não inclui salas de espera).',
    registers: [registro],
});

export const jogadoresConectados = new client.Gauge({
    name: 'contrazap_jogadores_conectados',
    help: 'Número de sockets autenticados conectados neste momento.',
    registers: [registro],
});

export const latenciaDecisaoBot = new client.Histogram({
    name: 'contrazap_latencia_decisao_bot_segundos',
    help: 'Tempo que o bot leva para decidir uma jogada/aposta.',
    // Buckets pensados pro teto de produção de ~2s por decisão (ver
    // README/BotBrain) — granularidade maior perto desse teto.
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3],
    registers: [registro],
});

export const salasCriadasTotal = new client.Counter({
    name: 'contrazap_salas_criadas_total',
    help: 'Total de salas criadas desde que o processo subiu (contador, só cresce).',
    registers: [registro],
});

// --- Helpers de conveniência ------------------------------------------------
// Prefira estes em vez de chamar .inc()/.dec()/.observe() direto nos pontos
// de instrumentação — mantém o nome da métrica centralizado aqui, então
// renomear uma métrica no futuro não exige caçar todo lugar que a usa.

export function registrarPartidaIniciada() {
    partidasAtivas.inc();
}

export function registrarPartidaFinalizada() {
    partidasAtivas.dec();
}

export function registrarJogadorConectado() {
    jogadoresConectados.inc();
}

export function registrarJogadorDesconectado() {
    jogadoresConectados.dec();
}

export function registrarSalaCriada() {
    salasCriadasTotal.inc();
}

// Uso: const pararCronometro = cronometrarDecisaoBot(); ...decide a jogada...; pararCronometro();
export function cronometrarDecisaoBot() {
    const parar = latenciaDecisaoBot.startTimer();
    return parar;
}