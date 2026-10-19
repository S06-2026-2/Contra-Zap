// Contrato da carteira: minhaCarteira, comprarItem, equiparItem, o visual
// que sobe pra mesa e as fichas pagas por colocação (fichasGanhas) e por
// desistência (ack de desistir). Preços e regras em conexao/loja.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { convidado, jogarSozinho, nomeUnico } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';
import {
    FICHAS_INICIAIS, PRECO_COR, PRECO_CHAPEU, COR_CINZA, SEM_CHAPEU, CHAPEUS_LOJA,
    recompensaColocacao, recompensaDesistencia,
} from '../../conexao/loja.js';

const TURNO_FOLGADO = { tempoTurnoMs: 10_000 };

// Cliente com conta registrada nova (carteira no banco).
async function registrado(servidor) {
    const cliente = await servidor.conectar();
    const nome = nomeUnico('conta');
    const { token } = await cliente.ok(EventosCliente.CADASTRAR, { nome, senha: 'senha-de-teste' });
    cliente.nome = nome;
    cliente.token = token;
    return cliente;
}

test('recompensas (loja.js)', async (t) => {
    await t.test('colocação com 4 jogadores: 250 / 200 / 150 / 100', () => {
        assert.deepEqual([1, 2, 3, 4].map(p => recompensaColocacao(p, 4)), [250, 200, 150, 100]);
    });

    await t.test('desistência: nada antes de 3 rodadas, depois 25 / 30 / 40', () => {
        assert.deepEqual([0, 2, 3, 4, 5, 9].map(recompensaDesistencia), [0, 0, 25, 30, 40, 40]);
    });
});

test('loja', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('conta nova começa com as fichas iniciais, cinza e sem chapéu', async () => {
        const cliente = await registrado(servidor);
        const carteira = await cliente.ok(EventosCliente.MINHA_CARTEIRA);
        assert.equal(carteira.fichas, FICHAS_INICIAIS);
        assert.equal(carteira.cor, COR_CINZA);
        assert.equal(carteira.chapeu, SEM_CHAPEU);
        assert.deepEqual(carteira.coresCompradas, []);
        assert.deepEqual(carteira.chapeusComprados, []);
    });

    await t.test('comprar desconta, guarda pra sempre e já equipa', async () => {
        const cliente = await registrado(servidor);
        const carteira = await cliente.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'cor', valor: 120 });
        assert.equal(carteira.fichas, FICHAS_INICIAIS - PRECO_COR);
        assert.equal(carteira.cor, 120);
        assert.deepEqual(carteira.coresCompradas, [120]);

        // Sobrevive a uma conexão nova (está no banco, não no socket).
        const outra = await servidor.conectar();
        await outra.ok(EventosCliente.RETOMAR_SESSAO, { token: cliente.token });
        assert.equal((await outra.ok(EventosCliente.MINHA_CARTEIRA)).cor, 120);
    });

    await t.test('trocar entre comprados e pro grátis não cobra', async () => {
        const cliente = await registrado(servidor);
        await cliente.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'cor', valor: 0 });
        await cliente.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'cor', valor: 200 });
        const deVolta = await cliente.ok(EventosCliente.EQUIPAR_ITEM, { tipo: 'cor', valor: 0 });
        assert.equal(deVolta.cor, 0);
        const cinza = await cliente.ok(EventosCliente.EQUIPAR_ITEM, { tipo: 'cor', valor: COR_CINZA });
        assert.equal(cinza.cor, COR_CINZA);
        assert.equal(cinza.fichas, FICHAS_INICIAIS - 2 * PRECO_COR);
    });

    await t.test('erros de compra e de troca', async () => {
        const cliente = await registrado(servidor);
        await cliente.erro(EventosCliente.COMPRAR_ITEM, { tipo: 'cor', valor: 15 }, CodigosErro.ITEM_INVALIDO);
        await cliente.erro(EventosCliente.COMPRAR_ITEM, { tipo: 'sapato', valor: 1 }, CodigosErro.ITEM_INVALIDO);
        await cliente.erro(EventosCliente.EQUIPAR_ITEM, { tipo: 'chapeu', valor: CHAPEUS_LOJA[0] }, CodigosErro.ITEM_NAO_COMPRADO);

        await cliente.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'chapeu', valor: CHAPEUS_LOJA[0] });
        await cliente.erro(EventosCliente.COMPRAR_ITEM, { tipo: 'chapeu', valor: CHAPEUS_LOJA[0] }, CodigosErro.ITEM_JA_COMPRADO);
        // 100 - 50 = 50: o segundo chapéu ainda dá, o terceiro não.
        await cliente.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'chapeu', valor: CHAPEUS_LOJA[1] });
        await cliente.erro(EventosCliente.COMPRAR_ITEM, { tipo: 'chapeu', valor: CHAPEUS_LOJA[2] }, CodigosErro.SALDO_INSUFICIENTE);
        assert.equal((await cliente.ok(EventosCliente.MINHA_CARTEIRA)).fichas, FICHAS_INICIAIS - 2 * PRECO_CHAPEU);
    });

    await t.test('convidado também começa com as fichas iniciais e compra', async () => {
        const cliente = await convidado(servidor);
        assert.equal((await cliente.ok(EventosCliente.MINHA_CARTEIRA)).fichas, FICHAS_INICIAIS);
        const carteira = await cliente.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'chapeu', valor: CHAPEUS_LOJA[3] });
        assert.equal(carteira.fichas, FICHAS_INICIAIS - PRECO_CHAPEU);
        assert.equal(carteira.chapeu, CHAPEUS_LOJA[3]);
    });

    await t.test('sem autenticar: NAO_IDENTIFICADO', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(EventosCliente.MINHA_CARTEIRA, {}, CodigosErro.NAO_IDENTIFICADO);
    });
});

test('carteira na partida', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    await t.test('o visual equipado sobe pra lista e pra mesa; bot vem sorteado', async () => {
        const dono = await registrado(servidor);
        await dono.ok(EventosCliente.COMPRAR_ITEM, { tipo: 'cor', valor: 60 });
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2, botNumber: 1 });

        const lista = dono.recebidos(EventosServidor.LISTA_JOGADORES).at(-1);
        assert.equal(lista.jogadores.find(j => j.nome === dono.nome).cor, 60);

        await dono.ok(EventosCliente.FORCAR_INICIO, { salaId });
        const rodada = await dono.esperar(EventosServidor.NOVA_RODADA_INICIADA);
        assert.equal(rodada.visuais.length, rodada.ordem.length);
        const meu = rodada.visuais[rodada.ordem.indexOf(dono.nome)];
        assert.deepEqual(meu, { cor: 60, chapeu: SEM_CHAPEU });
        const doBot = rodada.visuais[rodada.ordem.findIndex(nome => nome !== dono.nome)];
        assert.ok(CHAPEUS_LOJA.includes(doBot.chapeu));
        assert.notEqual(doBot.cor, COR_CINZA);
    });

    await t.test('cada conta recebe as fichas da própria colocação; convidado não recebe', async () => {
        const [a, b] = [await registrado(servidor), await registrado(servidor)];
        const visitante = await convidado(servidor);
        const { salaId } = await a.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 3 });
        await b.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await a.ok(EventosCliente.FORCAR_INICIO, { salaId });
        const clientes = [a, b, visitante];
        await Promise.all(clientes.map(cliente => cliente.esperar(EventosServidor.NOVA_RODADA_INICIADA)));
        const parar = clientes.map(cliente => jogarSozinho(cliente, salaId));
        t.after(() => parar.forEach(fn => fn()));

        const fim = await a.esperar(EventosServidor.JOGO_FINALIZADO, { timeoutMs: 60_000 });
        for (const conta of [a, b]) {
            const ganho = await conta.esperar(EventosServidor.FICHAS_GANHAS);
            assert.equal(ganho.total, 3);
            assert.equal(ganho.fichas, recompensaColocacao(ganho.posicao, 3));
            if (conta.nome === fim.vencedor) assert.equal(ganho.posicao, 1);
            assert.equal(ganho.saldo, FICHAS_INICIAIS + ganho.fichas);
            assert.equal((await conta.ok(EventosCliente.MINHA_CARTEIRA)).fichas, ganho.saldo);
        }
        assert.equal(visitante.recebidos(EventosServidor.FICHAS_GANHAS).length, 0);
        assert.equal((await visitante.ok(EventosCliente.MINHA_CARTEIRA)).fichas, FICHAS_INICIAIS);
    });

    await t.test('desistir logo no começo não paga nada', async () => {
        const conta = await registrado(servidor);
        const { salaId } = await conta.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2, botNumber: 1 });
        await conta.ok(EventosCliente.FORCAR_INICIO, { salaId });
        await conta.esperar(EventosServidor.NOVA_RODADA_INICIADA);

        const resposta = await conta.ok(EventosCliente.DESISTIR, { salaId });
        assert.equal(resposta.fichasGanhas, 0);
        assert.equal(resposta.saldo, null);
        assert.equal((await conta.ok(EventosCliente.MINHA_CARTEIRA)).fichas, FICHAS_INICIAIS);
    });
});
