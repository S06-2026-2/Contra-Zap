// A partida pela interface: 1 humano contra 1 bot — a mesa mínima que o
// projeto oferece (README, "Ferramentas de debug"), e a única que dispensa
// um segundo navegador. O que se testa aqui é o que a suíte de API não
// alcança: a mão renderiza, o botão de apostar só existe na vez, a carta
// clicada sai da mão.
//
// Nada depende de qual carta caiu nem de quem joga primeiro (ordem sorteada,
// ver Game.setstartsequence). Onde a vez importa, a fixture ESPERA ela chegar.
import { test, expect } from './fixtures.js';

test.describe('partida (1 humano + 1 bot)', () => {
    test.beforeEach(async ({ jogador }) => {
        // cartas: 3 fixo de propósito — o default da sala hoje é 1 carta
        // ("rodada cega", ver PROTOCOLO.md), que esconde a própria mão e some
        // com a leitura normal da carta. Este describe testa mecânica geral
        // de jogo, não a rodada cega, então pede 3 cartas explicitamente em
        // vez de depender do default (que pode mudar de novo).
        await jogador.criarSala({ jogadores: 2, bots: 1, cartas: 3 });
        // Com o bot já dentro, a sala nasce cheia — o adm pode começar na hora.
        await jogador.forcarInicio();
    });

    test('a mão aparece com o número de cartas da rodada', async ({ jogador }) => {
        await expect(jogador.page.getByRole('heading', { name: /^Sua mão/ })).toBeVisible();
        await expect(jogador.cartas()).toHaveCount(3);
        // O front desenha a carta como rank + símbolo do naipe (ver
        // CartaGrande em Partida.jsx), não o "[K de Espadas]" cru que o
        // protocolo manda no fio — quem trava o formato do protocolo é
        // tests/api/partida.test.js.
        await expect(jogador.cartas().first()).toHaveText(/^(4|5|6|7|Q|J|K|A|2|3)[♦♥♠♣]$/);
    });

    test('a vira é mostrada', async ({ jogador }) => {
        await expect(jogador.page.getByRole('heading', { name: 'Vira' })).toBeVisible();
    });

    test('as cartas ficam desabilitadas enquanto ninguém pode jogar', async ({ jogador }) => {
        // Fase de aposta: existe mão, mas jogar carta ainda não é opção pra ninguém.
        await expect(jogador.page.getByRole('heading', { name: /^Aposta/ })).toBeVisible();
        for (const carta of await jogador.cartas().all()) {
            await expect(carta).toBeDisabled();
        }
    });

    test('o formulário de aposta só existe na minha vez, e a aposta vai pro log', async ({ jogador }) => {
        await jogador.apostar(0, 1);

        // Depois de aceita, o formulário some e o painel de status mostra a
        // aposta em meu nome. Escopo no .status-jogador de propósito: o log
        // de debug (<pre class="log">) repete o mesmo texto, e um getByText
        // solto acharia os dois (strict mode do Playwright).
        await expect(jogador.page.getByRole('button', { name: 'Apostar' })).toBeHidden();
        await expect(
            jogador.page.locator('.status-jogador', { hasText: new RegExp(`${jogador.nome} apostou \\d`) })
        ).toBeVisible();
    });

    test('clicar numa carta na minha vez tira ela da mão', async ({ jogador }) => {
        await jogador.apostar(0, 1);

        // O bot leva ~2s por ação; a fixture espera a vez chegar.
        await expect(jogador.cartas()).toHaveCount(3);
        await jogador.jogarPrimeiraCarta();

        await expect(jogador.cartas()).toHaveCount(2);
        // O log de eventos é a prova de que a jogada foi confirmada pelo
        // servidor (cartaJogada), não só removida localmente.
        await expect(jogador.page.locator('pre.log')).toContainText(new RegExp(`${jogador.nome} jogou \\[`));
    });

    test('"Sair da partida" volta pra Lobby oferecendo reconectar', async ({ jogador }) => {
        await jogador.page.getByRole('button', { name: 'Sair da partida' }).click();

        // O assento virou bot mas a vaga continua reservada: a Lobby oferece
        // voltar. É o caminho que sairDaPartida + minhaSalaAtiva prometem.
        await expect(jogador.page.getByRole('heading', { name: `Olá, ${jogador.nome}` })).toBeVisible();
        await expect(jogador.page.getByText(/Você saiu da sala [0-9A-F]{6}/)).toBeVisible();
        await expect(jogador.page.getByRole('button', { name: 'Reconectar' })).toBeVisible();
    });
});
