// segurarAnimacoes.test.js — o servidor segurando cada turno até os clientes
// que aderiram terminarem de animar (ver GameController.registrarAnimacoes /
// _segurarPelasAnimacoes / _esperarDistribuicao e "Segurar pelas animações"
// no PROTOCOLO.md).
//
// Roda com: node --test game/segurarAnimacoes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from './GameController.js';
import { Bot } from '../bots/Bot.js';
import { duracaoCartaJogada, duracaoDistribuicaoEVira } from './animacoesFront.js';

// Dois humanos, rodada de 1 carta, distribuição fixa curta (a espera por
// confirmação só vale da SEGUNDA aposta em diante — a primeira espera o
// tempo fixo da distribuição).
function mesaDeDois(opcoes = {}) {
    const c = new GameController({
        numberPlayers: 2, roundStart: 1, tempoTurnoMs: 5_000, atrasoBotMs: 0, duracaoDistribuicaoMs: 50, ...opcoes,
    });
    c.entrarNaSala({ id: 1, nome: 'ana' });
    c.entrarNaSala({ id: 2, nome: 'bia' });
    const primeiroTurno = new Promise((resolve) => {
        c.once('turnoAposta', (dados) => resolve({ dados, em: Date.now() }));
    });
    return { c, primeiroTurno };
}

// Quem tem a primeira aposta aposta na hora; devolve a promessa do SEGUNDO
// turnoAposta (com o instante em que chegou) e o instante da primeira aposta.
function segundaAposta(c) {
    return new Promise((resolve) => {
        let apostouEm = null;
        c.on('turnoAposta', (dados) => {
            if (apostouEm == null) {
                apostouEm = Date.now();
                c.apostar(dados.id, 0);
                return;
            }
            resolve({ dados, em: Date.now(), apostouEm });
        });
    });
}

test('todo evento de objeto sai com seq crescente', async (t) => {
    const { c, primeiroTurno } = mesaDeDois();
    t.after(() => c.destruir());
    const seqs = [];
    c.on('novaRodadaIniciada', ({ seq }) => seqs.push(seq));
    c.on('manilhaVirada', ({ seq }) => seqs.push(seq));
    c.iniciarPartida();
    const { dados } = await primeiroTurno;
    seqs.push(dados.seq);
    assert.equal(seqs.length, 3);
    assert.ok(seqs[0] < seqs[1] && seqs[1] < seqs[2], `seq não cresce: ${seqs}`);
});

test('timerTurno sai logo depois do turno de humano, com o prazo inteiro', async (t) => {
    const { c, primeiroTurno } = mesaDeDois();
    t.after(() => c.destruir());
    const timer = new Promise((resolve) => c.once('timerTurno', resolve));
    c.iniciarPartida();
    const { dados: turno } = await primeiroTurno;
    const dados = await timer;
    assert.equal(dados.jogador, turno.jogador);
    assert.equal(dados.tipo, 'aposta');
    assert.equal(dados.tempoMs, 5_000);
    assert.ok(dados.seq > turno.seq);
});

test('timerTurno também sai na vez de bot, com o atraso dele como prazo', async (t) => {
    const c = new GameController({ numberPlayers: 2, roundStart: 1, tempoTurnoMs: 5_000, atrasoBotMs: 30, duracaoDistribuicaoMs: 0 });
    t.after(() => c.destruir());
    c.entrarNaSala(new Bot());
    c.entrarNaSala(new Bot());
    const dados = await new Promise((resolve) => {
        c.once('timerTurno', resolve);
        c.iniciarPartida();
    });
    assert.equal(dados.tipo, 'aposta');
    assert.equal(dados.tempoMs, 30);
});

test('sem ninguém aderir, o turno sai na hora e não há distribuição fixa', async (t) => {
    const { c, primeiroTurno } = mesaDeDois({ duracaoDistribuicaoMs: 2_000 });
    t.after(() => c.destruir());
    let distribuicao = false;
    c.on('distribuicaoConcluida', () => { distribuicao = true; });
    const inicio = Date.now();
    c.iniciarPartida();
    const { em } = await primeiroTurno;
    assert.ok(em - inicio < 500, `demorou ${em - inicio}ms sem ninguém segurando`);
    assert.equal(distribuicao, false);
});

test('com alguém aderido, a primeira aposta espera o tempo fixo da distribuição e não as confirmações', async (t) => {
    const { c, primeiroTurno } = mesaDeDois({ duracaoDistribuicaoMs: 400, limiteSeguraMs: 5_000 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0); // adere e nunca confirma nada
    const distribuicao = new Promise((resolve) => c.once('distribuicaoConcluida', (dados) => resolve({ dados, em: Date.now() })));
    const inicio = Date.now();
    c.iniciarPartida();
    const { dados, em: distribuidaEm } = await distribuicao;
    const { em } = await primeiroTurno;
    assert.equal(dados.numero, 1);
    assert.ok(distribuidaEm - inicio >= 350, `liberou a distribuição cedo demais (${distribuidaEm - inicio}ms)`);
    assert.ok(em - inicio < 1_000, `a primeira aposta esperou confirmação (${em - inicio}ms)`);
});

test('quem aderiu segura a segunda aposta até avisar que está em dia', async (t) => {
    const { c } = mesaDeDois({ limiteSeguraMs: 5_000 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0);
    // Maior seq visto: aqui a aposta sai de dentro do listener do turno,
    // então o timerTurno daquele turno chega DEPOIS do apostaFeita.
    let ultimoSeq = 0;
    const acompanhar = ({ seq }) => { ultimoSeq = Math.max(ultimoSeq, seq); };
    c.on('apostaFeita', acompanhar);
    c.on('timerTurno', acompanhar);
    const segunda = segundaAposta(c);
    c.iniciarPartida();

    // Ainda segurando: ana não animou a primeira aposta.
    const cedo = await Promise.race([segunda.then(() => 'turno'), new Promise((r) => setTimeout(() => r('esperando'), 400))]);
    assert.equal(cedo, 'esperando');

    const avisoEm = Date.now();
    c.registrarAnimacoes(1, ultimoSeq);
    const { em } = await segunda;
    assert.ok(em - avisoEm < 200, `o turno não saiu logo depois do aviso (${em - avisoEm}ms)`);
});

test('a espera nunca passa de limiteSeguraMs', async (t) => {
    const { c } = mesaDeDois({ limiteSeguraMs: 400 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(2, 0); // bia adere e nunca mais avisa
    c.iniciarPartida();
    const { em, apostouEm } = await segundaAposta(c);
    const espera = em - apostouEm;
    assert.ok(espera >= 350 && espera < 1_500, `esperou ${espera}ms com teto de 400ms`);
});

test('seq null tira o jogador da conta', async (t) => {
    const { c } = mesaDeDois({ limiteSeguraMs: 5_000 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0);
    c.registrarAnimacoes(1, null);
    c.iniciarPartida();
    const { em, apostouEm } = await segundaAposta(c);
    assert.ok(em - apostouEm < 500, `ainda segurou depois de seq null (${em - apostouEm}ms)`);
});

test('aindaAnimando renova a espera enquanto o cliente avisa', async (t) => {
    const { c } = mesaDeDois({ limiteSeguraMs: 300 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0);
    let avisos = null;
    t.after(() => clearInterval(avisos));
    c.once('apostaFeita', () => {
        // Avisa "ainda animando" a cada 150ms por ~900ms, bem além do prazo
        // de 300ms sem notícia.
        avisos = setInterval(() => c.registrarAnimando(1), 150);
        setTimeout(() => clearInterval(avisos), 900);
    });
    c.iniciarPartida();
    const { em, apostouEm } = await segundaAposta(c);
    const espera = em - apostouEm;
    assert.ok(espera >= 900 && espera < 1_600, `esperou ${espera}ms (devia segurar ~900ms + 300ms)`);
});

test('aindaAnimando nunca passa de limiteSeguraTotalMs', async (t) => {
    const { c } = mesaDeDois({ limiteSeguraMs: 300, limiteSeguraTotalMs: 700 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0);
    let avisos = null;
    t.after(() => clearInterval(avisos));
    c.once('apostaFeita', () => {
        avisos = setInterval(() => c.registrarAnimando(1), 100);
    });
    c.iniciarPartida();
    const { em, apostouEm } = await segundaAposta(c);
    const espera = em - apostouEm;
    assert.ok(espera >= 650 && espera < 1_100, `esperou ${espera}ms com teto total de 700ms`);
});

test('a linha do tempo do front acumula as animações em fila', () => {
    const c = new GameController({ numberPlayers: 2 });
    const antes = Date.now();
    c._somarAnimacaoFront(600);
    c._somarAnimacaoFront(600);
    const ocupadaPor = c._frenteOcupadaAte - antes;
    assert.ok(ocupadaPor >= 1_200 && ocupadaPor < 1_300, `devia somar em fila (${ocupadaPor}ms)`);
});

test('manilha é bem mais longa que carta normal na linha do tempo', () => {
    assert.ok(duracaoCartaJogada('Copas') > duracaoCartaJogada(null) + 3_000);
});

test('animação ainda pendente no front empurra a liberação da distribuição', async (t) => {
    // Sem duracaoDistribuicaoMs: usa a linha do tempo de verdade.
    const { c, primeiroTurno } = mesaDeDois({ duracaoDistribuicaoMs: undefined });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0);
    // Simula o front ainda tocando 1s de coreografia (ex.: manilha na última
    // carta da rodada anterior) quando a rodada começa.
    c._somarAnimacaoFront(1_000);
    const inicio = Date.now();
    c.iniciarPartida();
    const { em } = await primeiroTurno;
    const esperado = 1_000 + duracaoDistribuicaoEVira(2, 1) + 800;
    const espera = em - inicio;
    assert.ok(espera >= esperado - 100 && espera < esperado + 600, `esperou ${espera}ms, esperado ~${esperado}ms`);
});

test('um timeout não tira o jogador do segurar (a tela dele continua lá)', async (t) => {
    const { c } = mesaDeDois({ limiteSeguraMs: 5_000 });
    t.after(() => c.destruir());
    c.registrarAnimacoes(1, 0);
    // Como depois de um timeout de turno: automático ligado, mas ainda humano.
    c.jogadores.find((j) => j.id === 1).desconectado = true;
    const segunda = segundaAposta(c);
    c.iniciarPartida();
    const cedo = await Promise.race([segunda.then(() => 'turno'), new Promise((r) => setTimeout(() => r('esperando'), 400))]);
    assert.equal(cedo, 'esperando');
});
