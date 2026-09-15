// Contrato do chat de sala: mensagens prontas (sempre liberadas), texto
// livre (só com chatAberto) e o cooldown por jogador (conexao/PROTOCOLO.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as esperarMs } from 'node:timers/promises';
import { subirServidor } from '../helpers/servidor.js';
import { convidado, convidados, salaCheia, partidaEmAndamento } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';
import { MENSAGENS_CHAT } from '../../conexao/chat/mensagensChat.js';

// Sem cooldown: nestes testes o assunto é o conteúdo da mensagem, e o
// cooldown padrão (3s) faria o segundo envio de cada teste falhar por um
// motivo que não é o testado. O cooldown tem bloco próprio no fim do arquivo.
const SEM_COOLDOWN = { chatCooldownMs: 0 };

test('chat com mensagem pronta (restrita)', async (t) => {
    const servidor = await subirServidor(SEM_COOLDOWN);
    t.after(() => servidor.fechar());

    await t.test('funciona mesmo numa sala sem chatAberto', async () => {
        // É o "chat sempre disponível": não depende da config da sala.
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, chatAberto: false });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
    });

    await t.test('o servidor resolve o texto pelo catálogo', async () => {
        const esperada = MENSAGENS_CHAT[0];
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: esperada.id });

        const mensagem = await cliente.esperar(EventosServidor.CHAT_MENSAGEM);
        assert.equal(mensagem.salaId, salaId);
        assert.equal(mensagem.jogador, cliente.nome);
        assert.equal(mensagem.tipo, 'restrita');
        assert.equal(mensagem.id, esperada.id);
        assert.equal(mensagem.texto, esperada.texto);
    });

    await t.test('o texto do cliente é ignorado — quem manda é o catálogo', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, {
            salaId,
            tipo: 'restrita',
            id: 1,
            texto: 'texto que o cliente tentou injetar',
        });

        const mensagem = await cliente.esperar(EventosServidor.CHAT_MENSAGEM);
        assert.equal(mensagem.texto, MENSAGENS_CHAT.find(m => m.id === 1).texto);
    });

    await t.test('todo o catálogo é aceito', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        for (const item of MENSAGENS_CHAT) {
            await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: item.id });
            const mensagem = await cliente.esperar(
                EventosServidor.CHAT_MENSAGEM,
                { filtro: dados => dados.id === item.id }
            );
            assert.equal(mensagem.texto, item.texto);
        }
    });

    await t.test('CHAT_INVALIDO com id fora do catálogo', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        for (const id of [999, 0, -1, null, undefined, '1']) {
            await cliente.erro(EventosCliente.CHAT, { salaId, tipo: 'restrita', id }, CodigosErro.CHAT_INVALIDO);
        }
    });

    await t.test('a mensagem chega pra sala inteira, inclusive quem enviou', async () => {
        const { salaId, clientes } = await salaCheia(servidor, { humanos: 2 });
        const [remetente, outro] = clientes;

        await remetente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 2 });

        // Filtra por tipo: o servidor já mandou uma linha de sistema
        // ("entrou na sala") quando o segundo jogador entrou, e ela chega
        // no mesmo evento chatMensagem.
        for (const cliente of [remetente, outro]) {
            const mensagem = await cliente.esperar(
                EventosServidor.CHAT_MENSAGEM,
                { filtro: dados => dados.tipo === 'restrita' }
            );
            assert.equal(mensagem.jogador, remetente.nome);
            assert.equal(mensagem.id, 2);
        }
    });

    await t.test('funciona também com a partida em andamento', async () => {
        // Chat é da camada de conexão, não do jogo — não muda de
        // comportamento quando a partida começa.
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        await adm.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 3 });

        const mensagem = await adm.esperar(
            EventosServidor.CHAT_MENSAGEM,
            { filtro: dados => dados.tipo === 'restrita' }
        );
        assert.equal(mensagem.jogador, adm.nome);
    });
});

test('mensagens de sistema', async (t) => {
    const servidor = await subirServidor(SEM_COOLDOWN);
    t.after(() => servidor.fechar());

    await t.test('entrar na sala vira uma linha de sistema pra quem já estava', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        dono.limparHistorico();

        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });

        const linha = await dono.esperar(
            EventosServidor.CHAT_MENSAGEM,
            { filtro: dados => dados.tipo === 'sistema' }
        );
        assert.equal(linha.salaId, salaId);
        assert.equal(linha.jogador, visitante.nome);
        assert.equal(linha.texto, 'entrou na sala');
        assert.equal(linha.id, null);
    });

    await t.test('sair da sala também', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });
        dono.limparHistorico();

        await visitante.ok(EventosCliente.SAIR_SALA, { salaId });

        const linha = await dono.esperar(
            EventosServidor.CHAT_MENSAGEM,
            { filtro: dados => dados.tipo === 'sistema' }
        );
        assert.equal(linha.jogador, visitante.nome);
        assert.equal(linha.texto, 'saiu da sala');
    });

    await t.test('não passa por cooldown nem exige chatAberto', async () => {
        // Duas entradas seguidas, sala sem chatAberto: as duas linhas saem.
        const servidorComCooldown = await subirServidor({ chatCooldownMs: 60_000 });
        t.after(() => servidorComCooldown.fechar());

        const [dono, a, b] = await convidados(servidorComCooldown, 3);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, chatAberto: false });
        dono.limparHistorico();

        await a.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await b.ok(EventosCliente.ENTRAR_SALA, { salaId });

        await dono.esperar(EventosServidor.CHAT_MENSAGEM, { filtro: d => d.tipo === 'sistema' && d.jogador === a.nome });
        await dono.esperar(EventosServidor.CHAT_MENSAGEM, { filtro: d => d.tipo === 'sistema' && d.jogador === b.nome });
    });
});

test('chat de texto livre (aberta)', async (t) => {
    const servidor = await subirServidor(SEM_COOLDOWN);
    t.after(() => servidor.fechar());

    // Sala com chat liberado, pronta pra usar.
    async function salaComChatAberto() {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, chatAberto: true });
        return { cliente, salaId };
    }

    await t.test('CHAT_DESABILITADO numa sala criada sem chatAberto', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.erro(
            EventosCliente.CHAT,
            { salaId, tipo: 'aberta', texto: 'oi' },
            CodigosErro.CHAT_DESABILITADO
        );
    });

    await t.test('envia o texto digitado quando a sala permite', async () => {
        const { cliente, salaId } = await salaComChatAberto();
        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'aberta', texto: 'boa sorte a todos' });

        const mensagem = await cliente.esperar(EventosServidor.CHAT_MENSAGEM);
        assert.equal(mensagem.tipo, 'aberta');
        assert.equal(mensagem.id, null); // texto livre não tem id de catálogo
        assert.equal(mensagem.texto, 'boa sorte a todos');
        assert.equal(mensagem.jogador, cliente.nome);
    });

    await t.test('o texto vai com trim', async () => {
        const { cliente, salaId } = await salaComChatAberto();
        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'aberta', texto: '   com espaços   ' });

        const mensagem = await cliente.esperar(EventosServidor.CHAT_MENSAGEM);
        assert.equal(mensagem.texto, 'com espaços');
    });

    await t.test('CHAT_INVALIDO com texto vazio ou só espaços', async () => {
        const { cliente, salaId } = await salaComChatAberto();
        for (const texto of ['', '   ', '\n\t', null, undefined, 42]) {
            await cliente.erro(EventosCliente.CHAT, { salaId, tipo: 'aberta', texto }, CodigosErro.CHAT_INVALIDO);
        }
    });

    await t.test('aceita exatamente 200 caracteres e recusa 201', async () => {
        const { cliente, salaId } = await salaComChatAberto();

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'aberta', texto: 'a'.repeat(200) });
        await cliente.erro(
            EventosCliente.CHAT,
            { salaId, tipo: 'aberta', texto: 'a'.repeat(201) },
            CodigosErro.CHAT_INVALIDO
        );
    });

    await t.test('o limite é medido depois do trim', async () => {
        const { cliente, salaId } = await salaComChatAberto();
        // 200 caracteres de verdade, com espaços em volta que não contam.
        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'aberta', texto: `  ${'a'.repeat(200)}  ` });
    });

    await t.test('CHAT_INVALIDO com tipo desconhecido', async () => {
        const { cliente, salaId } = await salaComChatAberto();
        for (const tipo of ['privada', '', undefined, null, 1]) {
            await cliente.erro(EventosCliente.CHAT, { salaId, tipo, texto: 'oi' }, CodigosErro.CHAT_INVALIDO);
        }
    });
});

test('chat: pertencer à sala', async (t) => {
    const servidor = await subirServidor(SEM_COOLDOWN);
    t.after(() => servidor.fechar());

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(
            EventosCliente.CHAT,
            { salaId: 'NAOEXISTE', tipo: 'restrita', id: 1 },
            CodigosErro.SALA_NAO_ENCONTRADA
        );
    });

    await t.test('NAO_ESTA_NA_SALA por quem está de fora', async () => {
        const [dono, forasteiro] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, chatAberto: true });

        await forasteiro.erro(
            EventosCliente.CHAT,
            { salaId, tipo: 'restrita', id: 1 },
            CodigosErro.NAO_ESTA_NA_SALA
        );
    });

    await t.test('quem saiu da sala não manda mais mensagem nela', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await visitante.ok(EventosCliente.SAIR_SALA, { salaId });

        await visitante.erro(
            EventosCliente.CHAT,
            { salaId, tipo: 'restrita', id: 1 },
            CodigosErro.NAO_ESTA_NA_SALA
        );
    });
});

test('cooldown do chat', async (t) => {
    const COOLDOWN_MS = 250;
    const servidor = await subirServidor({ chatCooldownMs: COOLDOWN_MS });
    t.after(() => servidor.fechar());

    await t.test('CHAT_EM_COOLDOWN no envio logo em seguida', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
        await cliente.erro(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 2 }, CodigosErro.CHAT_EM_COOLDOWN);
    });

    await t.test('a mensagem barrada não vira broadcast', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
        await cliente.esperar(EventosServidor.CHAT_MENSAGEM);
        cliente.limparHistorico();

        await cliente.erro(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 2 }, CodigosErro.CHAT_EM_COOLDOWN);
        // Só o que veio de um `chat` de jogador conta — linha de sistema do
        // servidor não passa por cooldown nenhum.
        const deJogador = cliente.recebidos(EventosServidor.CHAT_MENSAGEM).filter(m => m.tipo !== 'sistema');
        assert.deepEqual(deJogador, []);
    });

    await t.test('libera de novo depois do prazo', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
        // Aqui a espera por relógio é legítima: o fim do cooldown é silencioso,
        // o servidor não emite nada quando ele passa. Não existe evento pra
        // aguardar — só o tempo.
        await esperarMs(COOLDOWN_MS + 100);
        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 2 });
    });

    await t.test('o cooldown é checado antes do conteúdo', async () => {
        // Precedência real (ver SalaManager.enviarChat): dentro da janela,
        // até uma mensagem inválida volta como CHAT_EM_COOLDOWN — o servidor
        // nem chega a olhar o conteúdo.
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
        await cliente.erro(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 999 }, CodigosErro.CHAT_EM_COOLDOWN);
    });

    await t.test('tentativa inválida não consome o prazo do próximo envio', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
        await esperarMs(COOLDOWN_MS + 100);

        // Fora da janela: agora a recusa é por conteúdo mesmo...
        await cliente.erro(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 999 }, CodigosErro.CHAT_INVALIDO);
        // ...e ela não pode ter aberto uma janela de cooldown nova: só uma
        // mensagem ACEITA move o relógio.
        await cliente.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 2 });
    });

    await t.test('o cooldown é por jogador, não por sala', async () => {
        // Entrar em duas salas não dobra o limite de mensagens.
        const cliente = await convidado(servidor);
        const primeira = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        const segunda = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.ok(EventosCliente.CHAT, { salaId: primeira.salaId, tipo: 'restrita', id: 1 });
        await cliente.erro(
            EventosCliente.CHAT,
            { salaId: segunda.salaId, tipo: 'restrita', id: 1 },
            CodigosErro.CHAT_EM_COOLDOWN
        );
    });

    await t.test('o cooldown de um jogador não afeta os outros', async () => {
        const { salaId, clientes } = await salaCheia(servidor, { humanos: 2 });
        const [a, b] = clientes;

        await a.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
        await b.ok(EventosCliente.CHAT, { salaId, tipo: 'restrita', id: 1 });
    });
});
