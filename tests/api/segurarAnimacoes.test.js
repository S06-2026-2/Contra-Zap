// Contrato de "Segurar pelas animações" pelo socket de verdade
// (conexao/PROTOCOLO.md): os avisos do front (animacoesConcluidas /
// aindaAnimando) chegam SEM callback — o front não espera resposta — e
// mesmo assim têm que chegar no controller. A lógica de espera em si é
// coberta em game/segurarAnimacoes.test.js; aqui só o caminho pelo socket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { partidaEmAndamento, salaCheia } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor } from '../../conexao/eventos.js';

test('segurar pelas animações pelo socket', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());

    await t.test('animacoesConcluidas sem callback registra o aviso no controller', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [cliente] = clientes;
        const controller = servidor.salaManager.salas.get(salaId).controller;
        const jogador = controller.jogadores.find((j) => j.nome === cliente.nome);

        // Igual ao front: emit cru, sem ack.
        cliente.socket.emit(EventosCliente.ANIMACOES_CONCLUIDAS, { salaId, seq: 1 });
        // Um evento com ack logo depois, no mesmo socket, só volta quando o
        // servidor já processou o aviso (mesma ordem de chegada).
        await cliente.emitir(EventosCliente.MINHA_SALA_ATIVA);

        assert.equal(controller._animacoesEmDia.get(jogador.id), 1);
    });

    await t.test('com callback continua respondendo ok', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const resposta = await clientes[0].emitir(EventosCliente.ANIMACOES_CONCLUIDAS, { salaId, seq: 1 });
        assert.equal(resposta.ok, true);
        const animando = await clientes[0].emitir(EventosCliente.AINDA_ANIMANDO, { salaId });
        assert.equal(animando.ok, true);
    });
});

test('aderir na sala de espera já segura a distribuição da rodada 1', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());
    const { salaId, clientes, adm } = await salaCheia(servidor, { humanos: 2 });
    const controller = servidor.salaManager.salas.get(salaId).controller;
    // Distribuição curta pro teste não esperar a estimativa inteira.
    controller.duracaoDistribuicaoMs = 50;

    // Antes da partida começar, sem callback — igual ao front abrindo.
    adm.socket.emit(EventosCliente.ANIMACOES_CONCLUIDAS, { salaId, seq: 0 });
    await adm.emitir(EventosCliente.MINHA_SALA_ATIVA);

    await adm.ok(EventosCliente.FORCAR_INICIO, { salaId });
    const distribuicao = await Promise.all(clientes.map((c) => c.esperar(EventosServidor.DISTRIBUICAO_CONCLUIDA)));
    assert.equal(distribuicao[0].numero, 1);
});
