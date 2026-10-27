// A partida pela interface: 1 humano contra 1 bot — a mesa mínima que o
// projeto oferece, e a única que dispensa um segundo navegador. O que se
// testa aqui é o que a suíte de API não alcança: a mão chega na tela, a
// aposta só abre na vez, a carta clicada sai da mão.
//
// Nada depende de qual carta caiu nem de quem joga primeiro (ordem sorteada,
// ver Game.setstartsequence). Onde a vez importa, a fixture ESPERA ela chegar.
import { test, expect, esperarSalas, CARTA_ABERTA } from './fixtures.js';

test.describe('partida (1 humano + 1 bot)', () => {
    let salaId;

    test.beforeEach(async ({ jogador }) => {
        // cartas: 3 fixo de propósito — o default da sala hoje é 1 carta
        // ("rodada cega", ver PROTOCOLO.md), que esconde a própria mão. Este
        // describe testa mecânica geral de jogo, não a rodada cega, então
        // pede 3 cartas explicitamente em vez de depender do default.
        salaId = await jogador.criarSala({ jogadores: 2, bots: 1, cartas: 3 });
        // Com o bot já dentro, a sala nasce cheia — o adm pode começar na hora.
        await jogador.forcarInicio();
    });

    test('a mão aparece com o número de cartas da rodada, de face pra cima', async ({ jogador }) => {
        await expect(jogador.cartas()).toHaveCount(3);
        for (const carta of await jogador.cartas().getByRole('img').all()) {
            await expect(carta).toHaveAccessibleName(CARTA_ABERTA);
        }
    });

    test('a vira é mostrada', async ({ jogador }) => {
        // A vira gira na chegada: tem o verso e a frente no DOM, a frente é
        // a que diz qual carta é.
        await expect(jogador.page.locator('.mesa-exp-vira-face-frente').getByRole('img')).toHaveAccessibleName(CARTA_ABERTA);
    });

    test('a aposta só abre na minha vez, e o pop-up fecha quando o servidor aceita', async ({ jogador }) => {
        await jogador.apostar(0, 1);

        // Aceita: pop-up e placa somem, e a vez segue (minha de jogar ou
        // do bot) — o banner nunca mais pede a minha aposta nesta rodada.
        await expect(jogador.page.getByRole('heading', { name: 'Quantas vazas você vai fazer?' })).toBeHidden();
        await expect(jogador.page.getByRole('button', { name: 'Apostar', exact: true })).toBeHidden();
        await expect(jogador.page.getByText('Sua vez de apostar!')).toBeHidden();
    });

    test('clicar numa carta na minha vez tira ela da mão', async ({ jogador }) => {
        await jogador.apostar(0, 1);

        await expect(jogador.cartas()).toHaveCount(3);
        const antes = await jogador.nomesDasCartas();
        await jogador.jogarUmaCarta();

        // A carta só sai da mão quando o cartaJogada do servidor chega — é a
        // prova de que a jogada foi aceita, não só removida localmente.
        await expect(jogador.cartas()).toHaveCount(2);
        const depois = await jogador.nomesDasCartas();
        for (const carta of depois) expect(antes).toContain(carta);
    });

    test('"Sair da partida" volta pras salas oferecendo reconectar', async ({ jogador }) => {
        await jogador.page.getByRole('button', { name: 'Sair da partida' }).click();

        // O assento virou bot mas a vaga continua reservada: a Lobby oferece
        // voltar. É o caminho que sairDaPartida + minhaSalaAtiva prometem.
        await esperarSalas(jogador.page, jogador.nome);
        await expect(jogador.page.getByText(`VOCÊ SAIU DA SALA ${salaId}`)).toBeVisible();
        await expect(jogador.page.getByRole('button', { name: 'RECONECTAR' })).toBeVisible();
    });
});
