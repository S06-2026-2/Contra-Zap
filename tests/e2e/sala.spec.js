// Sala de espera com gente de verdade dos dois lados: o que um jogador faz
// tem que aparecer na tela do OUTRO. É o teste que só existe em E2E — a suíte
// de API prova o broadcast, mas não que a Lobby/Partida o renderizam.
import { test, expect } from './fixtures.js';

test.describe('sala de espera (2 jogadores reais)', () => {
    test('o segundo entra pela lista e o roster atualiza nas duas telas', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);

        const salaId = await anfitriao.criarSala({ jogadores: 2 });
        await expect(anfitriao.page.getByRole('heading', { name: 'Aguardando (1)' })).toBeVisible();

        await convidado.entrarNaSala(salaId);

        // Nas duas telas: contador 2 e os dois nomes na lista.
        for (const jogador of [anfitriao, convidado]) {
            await expect(jogador.page.getByRole('heading', { name: 'Aguardando (2)' })).toBeVisible();
            await expect(jogador.page.getByRole('listitem').filter({ hasText: anfitriao.nome })).toBeVisible();
            await expect(jogador.page.getByRole('listitem').filter({ hasText: convidado.nome })).toBeVisible();
        }
    });

    test('sala cheia avisa a contagem e só o adm vê o botão de forçar início', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);
        const salaId = await anfitriao.criarSala({ jogadores: 2 });
        await convidado.entrarNaSala(salaId);

        for (const jogador of [anfitriao, convidado]) {
            await expect(jogador.page.getByText(/Sala cheia — começa sozinha em \d+s/)).toBeVisible();
        }
        // O botão aparece pros dois (o front não sabe quem é adm), mas só o
        // adm consegue usá-lo — a autorização é do servidor. O que o E2E
        // trava aqui é que ELE existe pra quem criou.
        await expect(anfitriao.page.getByRole('button', { name: /Forçar início/ })).toBeVisible();
    });

    test('o adm força o início e a partida começa para os dois', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);
        const salaId = await anfitriao.criarSala({ jogadores: 2 });
        await convidado.entrarNaSala(salaId);

        await anfitriao.forcarInicio();

        for (const jogador of [anfitriao, convidado]) {
            await expect(jogador.page.getByRole('heading', { name: /^Vez de:/ })).toBeVisible();
            await expect(jogador.page.getByRole('heading', { name: /^Sua mão/ })).toBeVisible();
            // 1 carta na primeira rodada (roundStart default).
            await expect(jogador.cartas()).toHaveCount(1);
        }
    });

    test('quem sai da sala de espera some do roster do outro', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);
        const salaId = await anfitriao.criarSala({ jogadores: 3 });
        await convidado.entrarNaSala(salaId);
        await expect(anfitriao.page.getByRole('heading', { name: 'Aguardando (2)' })).toBeVisible();

        await convidado.page.getByRole('button', { name: 'Sair da sala' }).click();

        // Quem saiu volta pra Lobby; quem ficou vê o contador cair.
        await expect(convidado.page.getByRole('heading', { name: `Olá, ${convidado.nome}` })).toBeVisible();
        await expect(anfitriao.page.getByRole('heading', { name: 'Aguardando (1)' })).toBeVisible();
        await expect(anfitriao.page.getByRole('listitem').filter({ hasText: convidado.nome })).toHaveCount(0);
    });
});
