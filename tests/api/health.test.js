// Testes do único endpoint HTTP do projeto. Todo o resto da API é socket.io
// (ver conexao/PROTOCOLO.md) — este arquivo cobre o que o Docker HEALTHCHECK
// e qualquer monitoramento externo consomem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';

test('GET /health', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('responde 200 com JSON de status', async () => {
        const resposta = await fetch(`${servidor.url}/health`);

        assert.equal(resposta.status, 200);
        assert.match(resposta.headers.get('content-type'), /application\/json/);

        const corpo = await resposta.json();
        assert.equal(corpo.status, 'ok');
        assert.equal(typeof corpo.uptime, 'number');
        assert.ok(corpo.uptime >= 0);
        // timestamp precisa ser uma data ISO de verdade — o healthcheck do
        // Docker não olha, mas um painel de monitoramento olha.
        assert.equal(new Date(corpo.timestamp).toISOString(), corpo.timestamp);
    });

    await t.test('não exige autenticação nenhuma', async () => {
        // Sem cookie, sem token, sem socket autenticado: o healthcheck roda
        // de fora do jogo e não pode depender de login.
        const resposta = await fetch(`${servidor.url}/health`, { headers: {} });
        assert.equal(resposta.status, 200);
    });

    await t.test('rota inexistente devolve 404', async () => {
        const resposta = await fetch(`${servidor.url}/rota-que-nao-existe`);
        assert.equal(resposta.status, 404);
    });
});
