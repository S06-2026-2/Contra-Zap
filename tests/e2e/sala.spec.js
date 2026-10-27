// Sala de espera com gente de verdade dos dois lados: o que um jogador faz
// tem que aparecer na tela do OUTRO. É o teste que só existe em E2E — a suíte
// de API prova o broadcast, mas não que a Lobby/mesa o renderizam.
import { test, expect, esperarSalas } from './fixtures.js';

test.describe('sala de espera (2 jogadores reais)', () => {
    test('o segundo entra pela lista e o roster atualiza nas duas telas', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);

        const salaId = await anfitriao.criarSala({ jogadores: 2 });
        await expect(anfitriao.page.getByText('Esperando a mesa encher — 1/2 jogadores.')).toBeVisible();

        await convidado.entrarNaSala(salaId);

        // Nas duas telas: contador 2/2 e os dois nomes nos assentos.
        for (const jogador of [anfitriao, convidado]) {
            await expect(jogador.page.getByText('Mesa cheia — 2/2 jogadores.')).toBeVisible();
            await expect(jogador.roster().getByText(anfitriao.nome)).toBeVisible();
            await expect(jogador.roster().getByText(convidado.nome)).toBeVisible();
        }
    });

    test('sala cheia começa a contagem e só o adm vê o botão de forçar início', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);
        const salaId = await anfitriao.criarSala({ jogadores: 2 });
        await convidado.entrarNaSala(salaId);

        for (const jogador of [anfitriao, convidado]) {
            await expect(jogador.page.locator('.az-contagem-valor')).toHaveText(/^\d+$/);
        }
        // O front só entrega o botão a quem é adm (ver souDono em
        // meetfront1/Partida.jsx) — a autorização de verdade é do servidor.
        await expect(anfitriao.page.getByRole('button', { name: /Forçar início/i })).toBeEnabled();
        await expect(convidado.page.getByRole('button', { name: /Forçar início/i })).toHaveCount(0);
    });

    test('o adm força o início e a partida começa para os dois', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);
        const salaId = await anfitriao.criarSala({ jogadores: 2 });
        await convidado.entrarNaSala(salaId);

        await anfitriao.forcarInicio();

        for (const jogador of [anfitriao, convidado]) {
            await expect(jogador.page.getByRole('button', { name: 'Sair da partida' })).toBeVisible();
            // 1 carta na primeira rodada (roundStart default) — a rodada
            // cega: a carta chega virada, nem o dono vê qual é.
            await expect(jogador.cartas()).toHaveCount(1);
            await expect(jogador.cartas().getByRole('img')).toHaveAccessibleName('Carta virada');
        }
    });

    test('quem sai da sala de espera some do roster do outro', async ({ jogadores }) => {
        const [anfitriao, convidado] = await jogadores(2);
        const salaId = await anfitriao.criarSala({ jogadores: 3 });
        await convidado.entrarNaSala(salaId);
        await expect(anfitriao.page.getByText('Esperando a mesa encher — 2/3 jogadores.')).toBeVisible();

        await convidado.page.getByRole('button', { name: 'Sair da fila' }).click();

        // Quem saiu volta pras salas; quem ficou vê o contador cair.
        await esperarSalas(convidado.page, convidado.nome);
        await expect(anfitriao.page.getByText('Esperando a mesa encher — 1/3 jogadores.')).toBeVisible();
        await expect(anfitriao.roster().getByText(convidado.nome)).toHaveCount(0);
    });
});
