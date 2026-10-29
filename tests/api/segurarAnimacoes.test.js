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

test('a tela que cai para de segurar o turno de quem ficou', async (t) => {
    // Regressão de "dois players morrendo junto não buga o timer do back"
    // (294eceb). A correção tem duas metades: o GameController ignora quem
    // já foi eliminado (coberto em game/segurarAnimacoes.test.js) e o
    // socketServer tira do segurar quem CAIU no meio da partida — esta
    // segunda só existe no caminho do socket, então só dá pra cobrir daqui.
    //
    // Sem ela, a tela fechada continua contando como "ainda animando" e todo
    // turno seguinte espera limiteSeguraMs inteiro por um navegador que não
    // existe mais.
    const servidor = await subirServidor({ tempoTurnoMs: 10_000, limiteSeguraMs: 3_000 });
    t.after(() => servidor.fechar());

    const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
    const [quemCai, quemFica] = clientes;
    const controller = servidor.salaManager.salas.get(salaId).controller;
    const idDe = (cliente) => controller.jogadores.find((j) => j.nome === cliente.nome).id;

    // Os dois aderem ao segurar, como o front faz ao abrir a tela.
    for (const cliente of clientes) {
        cliente.socket.emit(EventosCliente.ANIMACOES_CONCLUIDAS, { salaId, seq: 1 });
        await cliente.emitir(EventosCliente.MINHA_SALA_ATIVA);
    }
    assert.equal(controller._animacoesEmDia.get(idDe(quemCai)), 1, 'pré-condição: a tela dele estava na conta');

    await quemCai.desconectar();

    // A limpeza do disconnect é silenciosa: o servidor não emite nada pra
    // sala, e o socket que provocaria a ordem de chegada é justamente o que
    // caiu. Sem evento pra esperar, resta perguntar até mudar — com teto, pra
    // falhar rápido e com mensagem em vez de travar a suíte.
    const saiuDaConta = await aguardarAte(
        () => !controller._animacoesEmDia.has(idDe(quemCai)),
        'a tela que caiu continuou segurando o turno',
    );
    assert.ok(saiuDaConta);

    // E a limpeza é cirúrgica: quem continua na sala segue segurando.
    assert.equal(controller._animacoesEmDia.get(idDe(quemFica)), 1, 'tirou da conta quem não devia');
});

// Espera uma condição silenciosa virar verdadeira. Existe só para o caso em
// que o servidor age sem emitir nada — todo o resto da suíte espera evento.
async function aguardarAte(condicao, mensagem, { timeoutMs = 2_000, intervaloMs = 10 } = {}) {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
        if (condicao()) return true;
        await new Promise((resolve) => setTimeout(resolve, intervaloMs));
    }
    throw new Error(`${mensagem} (${timeoutMs}ms)`);
}

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
