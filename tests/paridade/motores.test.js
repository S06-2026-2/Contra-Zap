// Os dois motores jogam o mesmo jogo?
//
// `training/python/motor/` é um porte de `game/`: se uma regra muda num lado
// só, os bots treinam um jogo diferente do que está em produção. Aqui cada
// cenário (mesma seed, mesmas decisões) é jogado inteiro no GameController de
// verdade e no motor Python de verdade (training/python/paridade_motor.py), e
// os registros têm que ser iguais passo a passo.
//
// Fora do alcance: o que só existe no JS (desistência, timeout, bots,
// reconexão) e as máscaras de jogada legal do treino.
import '../helpers/ambiente.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GameController } from '../../game/GameController.js';
import { criarRng } from '../../game/rng.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PASTA_PYTHON = path.join(RAIZ, 'training', 'python');

function acharPython() {
    const venv = path.join(RAIZ, 'training', '.venv');
    const candidatos = [
        process.env.PYTHON,
        ...[path.join(venv, 'Scripts', 'python.exe'), path.join(venv, 'bin', 'python')].filter((p) => existsSync(p)),
        'python3',
        'python',
    ].filter(Boolean);
    return candidatos.find((python) => {
        const { status, stdout } = spawnSync(python, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf-8' });
        return status === 0 && stdout.trim() === '3';
    });
}

// Combinações de mesa, vida (null = a inicial de cada motor), teto de baralhos
// e embaralhamento. As decisões
// são números em [0, 1) sorteados aqui: cada motor traduz o mesmo número para
// uma aposta ou carta, sem depender do rng do outro.
function montarCenarios() {
    const cenarios = [];
    let seed = 1;
    for (const jogadores of [2, 3, 4, 5, 6]) {
        for (const hp of [1, null, 25]) {
            for (const [roundStart, maxDeck] of [[1, 1], [1, 50], [3, 1], [2, 2], [8, 50]]) {
                for (const randomShuffle of [true, false]) {
                    const sorteio = criarRng(seed * 7919);
                    cenarios.push({
                        jogadores, hp, roundStart, maxDeck, randomShuffle, seed,
                        decisoes: Array.from({ length: 499 }, () => sorteio()),
                    });
                    seed += 1;
                }
            }
        }
    }
    return cenarios;
}

function jogarNoJs(cenario) {
    const c = new GameController({
        numberPlayers: cenario.jogadores,
        roundStart: cenario.roundStart,
        randomShuffle: cenario.randomShuffle,
        maxDeck: cenario.maxDeck,
        seed: cenario.seed,
        pausaVazaMs: 0,
        pausaRodadaMs: 0,
    });
    for (let i = 0; i < cenario.jogadores; i++) c.entrarNaSala({ id: i, nome: `agente${i}` });
    if (cenario.hp !== null) for (const jogador of c.jogadores) jogador.hp = cenario.hp;

    const registro = [];
    let n = 0;
    let recusadas = [];
    const sortear = () => cenario.decisoes[n++ % cenario.decisoes.length];
    const tentar = (acao, candidatos) => {
        recusadas = [];
        for (const candidato of candidatos) {
            if (acao(candidato).ok) return;
            recusadas.push(candidato);
        }
    };

    c.on('manilhaVirada', () => registro.push({
        tipo: 'rodada',
        numero: c.numeroRodada,
        cartas: c.rodada.round,
        ordem: c.rodada.gameOrder.map((j) => j.nome),
        maos: c.rodada.gameOrder.map((j) => j.mao.map((carta) => carta.id)),
        vira: c.rodada.vira.id,
        viraValor: c.rodada.viraValor,
    }));
    c.on('turnoAposta', ({ id }) => {
        const total = c.rodada.round;
        const inicio = Math.floor(sortear() * (total + 1));
        tentar((valor) => c.apostar(id, valor), [
            -1, total + 1, 0.5,
            ...Array.from({ length: total + 1 }, (_, k) => (inicio + k) % (total + 1)),
        ]);
    });
    c.on('apostaFeita', ({ jogador, aposta }) => registro.push({ tipo: 'aposta', jogador, aposta, recusadas }));
    c.on('turnoJogador', ({ id }) => {
        const total = c.jogadores.find((j) => j.id === id).mao.length;
        tentar((indice) => c.jogarCarta(id, indice), [-1, total, 0.5, Math.floor(sortear() * total)]);
    });
    c.on('cartaJogada', ({ jogador }) => {
        const mesa = c.rodada.mesaAtiva;
        registro.push({
            tipo: 'carta',
            jogador,
            carta: mesa.cartasNaMesa.at(-1).carta.id,
            recusadas,
            ganhando: mesa.melhorJogada?.jogador.nome ?? null,
            cartaGanhando: mesa.melhorJogada?.carta.id ?? null,
            melada: mesa.estaEmpatado,
        });
    });
    c.on('vazaFinalizada', ({ vencedor }) => registro.push({ tipo: 'vaza', vencedor }));
    c.on('rodadaFinalizada', ({ resultado }) => registro.push({ tipo: 'placar', resultado }));

    return new Promise((resolve, reject) => {
        // Também segura o processo vivo: os timers do controller são unref.
        const prazo = setTimeout(() => {
            c.destruir();
            reject(new Error(`a partida não terminou no JS (seed ${cenario.seed})`));
        }, 60_000);
        const terminar = (evento) => {
            clearTimeout(prazo);
            registro.push(evento);
            resolve(registro);
        };
        c.on('jogoFinalizado', ({ vencedor }) => terminar({ tipo: 'fim', vencedor }));
        c.on('partidaAbortada', ({ erro }) => terminar({ tipo: 'erro', erro }));
        c.iniciarPartida();
    });
}

function jogarNoPython(python, cenarios) {
    const { status, stdout, stderr, error } = spawnSync(python, ['paridade_motor.py'], {
        cwd: PASTA_PYTHON,
        input: JSON.stringify(cenarios),
        encoding: 'utf-8',
        maxBuffer: 256 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.ifError(error);
    assert.equal(status, 0, stderr);
    return JSON.parse(stdout);
}

// Prova que os cenários passam pelas regras que interessam: sem isso, uma
// paridade verde poderia só significar que a regra nunca entrou em jogo.
function medirCobertura(registros) {
    const conta = {
        'vaza melada com outra vaza depois': 0,
        'cartas anuladas sem melar a vaza': 0,
        'aposta que fecha a soma recusada': 0,
        'rodada de 1 carta em que a soma fechou': 0,
        'mais de um baralho': 0,
        'mão congelada pelo maxDeck': 0,
        'eliminação com a partida seguindo': 0,
        'todos eliminados na mesma rodada': 0,
        'empate na maior vida com todos eliminados': 0,
        'manilha ganhando a vaza': 0,
        'vira 3, manilha 4': 0,
    };
    const valorDe = (id) => id % 10;
    for (const registro of registros) {
        let rodada = null;
        let mesa = [];
        let soma = 0;
        registro.forEach((e, k) => {
            const proximo = registro[k + 1];
            if (e.tipo === 'rodada') {
                if (rodada && e.cartas === rodada.cartas) conta['mão congelada pelo maxDeck']++;
                if (rodada && e.ordem.length < rodada.ordem.length) conta['eliminação com a partida seguindo']++;
                if (e.ordem.length * e.cartas + 1 > 40) conta['mais de um baralho']++;
                if (e.viraValor === 0) conta['vira 3, manilha 4']++;
                rodada = e;
                mesa = [];
                soma = 0;
            } else if (e.tipo === 'aposta') {
                soma += e.aposta;
                if (e.recusadas.length > 3) conta['aposta que fecha a soma recusada']++;
                if (rodada.cartas === 1 && proximo.tipo === 'carta' && soma === 1) conta['rodada de 1 carta em que a soma fechou']++;
            } else if (e.tipo === 'carta') {
                mesa.push(e);
            } else if (e.tipo === 'vaza') {
                const comuns = mesa.map((m) => valorDe(m.carta)).filter((v) => v !== rodada.viraValor);
                if (!e.vencedor && proximo.tipo === 'carta') conta['vaza melada com outra vaza depois']++;
                if (e.vencedor && new Set(comuns).size < comuns.length) conta['cartas anuladas sem melar a vaza']++;
                if (e.vencedor && valorDe(mesa.at(-1).cartaGanhando) === rodada.viraValor) conta['manilha ganhando a vaza']++;
                mesa = [];
            } else if (e.tipo === 'placar') {
                const vidas = e.resultado.map((r) => r.hp);
                const maior = Math.max(...vidas);
                if (maior <= 0) {
                    conta['todos eliminados na mesma rodada']++;
                    if (vidas.filter((v) => v === maior).length > 1) conta['empate na maior vida com todos eliminados']++;
                }
            }
        });
    }
    return conta;
}

// Mesma ordem de chaves nos dois lados, para comparar e mostrar como texto.
// Chave que só existe no Python vai para o fim e aparece como diferença.
function ordenarComo(modelo, valor) {
    if (Array.isArray(valor)) return valor.map((v, i) => ordenarComo(modelo?.[i], v));
    if (valor === null || typeof valor !== 'object') return valor;
    const chaves = [...new Set([...Object.keys(modelo ?? {}), ...Object.keys(valor)])].filter((k) => k in valor);
    return Object.fromEntries(chaves.map((k) => [k, ordenarComo(modelo?.[k], valor[k])]));
}

const python = acharPython();
// No CI a falta do Python é falha: pular ali seria paridade verde sem rodar.
const pular = !python && !process.env.CI ? 'Python 3 não encontrado (defina PYTHON)' : false;

test('motor JS e motor Python jogam a mesma partida', { skip: pular }, async (t) => {
    assert.ok(python, 'Python 3 não encontrado: a paridade não pode ser conferida');
    const cenarios = montarCenarios();
    const doJs = await Promise.all(cenarios.map(jogarNoJs));
    const doPython = jogarNoPython(python, cenarios);

    await t.test('os cenários passam por todas as regras sensíveis', (t2) => {
        const cobertura = medirCobertura(doJs);
        t2.diagnostic(JSON.stringify(cobertura));
        for (const [regra, vezes] of Object.entries(cobertura)) assert.ok(vezes > 0, `nenhum cenário com: ${regra}`);
    });

    await t.test('nenhuma partida terminou em erro no JS', () => {
        assert.deepEqual(doJs.map((r) => r.at(-1)).filter((e) => e.tipo !== 'fim'), []);
    });

    await t.test('os registros são iguais passo a passo', () => {
        assert.equal(doPython.length, cenarios.length);
        const divergentes = cenarios.flatMap((cenario, i) => {
            const total = Math.max(doJs[i].length, doPython[i].length);
            for (let k = 0; k < total; k++) {
                const js = JSON.stringify(doJs[i][k]);
                const py = JSON.stringify(ordenarComo(doJs[i][k], doPython[i][k]));
                if (js !== py) {
                    const { decisoes, ...mesa } = cenario;
                    return [`${JSON.stringify(mesa)}, passo ${k}\n    JS:     ${js}\n    Python: ${py}`];
                }
            }
            return [];
        });
        assert.equal(divergentes.length, 0,
            `${divergentes.length} de ${cenarios.length} partidas divergem. Primeiras:\n  ${divergentes.slice(0, 3).join('\n  ')}`);
    });
});
