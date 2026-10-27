// O caminho com mais peças integradas do sistema: sessionStorage +
// retomarSessao + minhaSalaAtiva + reconectar, todos trabalhando juntos pra
// um F5 no meio da partida não jogar o jogador fora. A suíte de API prova
// cada evento; só o E2E prova que a interface costura os quatro.
import { test, expect } from './fixtures.js';

test.describe('reconexão pela interface', () => {
    test('F5 no meio da partida: a sessão volta sozinha e as salas oferecem reconectar', async ({ jogador }) => {
        const salaId = await jogador.criarSala({ jogadores: 2, bots: 1 });
        await jogador.forcarInicio();
        await expect(jogador.cartas()).toHaveCount(1);

        await jogador.page.reload();

        // Sem pedir nome nem senha: a sessão veio do sessionStorage e foi
        // retomada com retomarSessao — a tela inicial já mostra quem eu sou.
        await expect(jogador.page.getByTitle('Você')).toHaveText(jogador.nome);
        await jogador.page.getByRole('button', { name: 'JOGAR', exact: true }).click();
        await expect(jogador.page.getByText('ENTRE PRA JOGAR')).toHaveCount(0);

        // E o servidor lembrou do assento (minhaSalaAtiva) — daí o aviso.
        await expect(jogador.page.getByText(`VOCÊ SAIU DA SALA ${salaId}`)).toBeVisible();
        await expect(jogador.page.getByText('Sua vaga na partida continua reservada.')).toBeVisible();
    });

    test('"Reconectar" devolve a mesma partida, com a mão intacta', async ({ jogador }) => {
        // 3 cartas: na rodada cega (1 carta) a mão vem virada e não dá pra
        // comparar antes e depois.
        const salaId = await jogador.criarSala({ jogadores: 2, bots: 1, cartas: 3 });
        await jogador.forcarInicio();
        await expect(jogador.cartas()).toHaveCount(3);
        const maoAntes = await jogador.nomesDasCartas();

        await jogador.page.reload();
        await jogador.page.getByRole('button', { name: 'JOGAR', exact: true }).click();
        await jogador.page.getByRole('button', { name: 'RECONECTAR' }).click();

        await expect(jogador.page.getByText(`SALA ${salaId}`, { exact: true })).toBeVisible();
        await expect(jogador.page.getByRole('button', { name: 'Sair da partida' })).toBeVisible();
        await expect(jogador.cartas().first()).toBeVisible();
        // A mão é a MESMA de antes do F5 — o estado veio do servidor, não foi
        // sorteado de novo. (Se a vez passou nesse meio-tempo e a minha carta
        // foi jogada pelo automático, a mão pode ter menos cartas, mas nunca
        // cartas diferentes.)
        const maoDepois = await jogador.nomesDasCartas();
        for (const carta of maoDepois) expect(maoAntes).toContain(carta);
    });

    test('queda de rede mostra o aviso, e ele some quando a rede volta', async ({ jogador }) => {
        await jogador.criarSala({ jogadores: 2, bots: 1 });
        const aviso = jogador.page.getByText('Conexão perdida — tentando reconectar...');

        await jogador.context.setOffline(true);
        await expect(aviso).toBeVisible({ timeout: 30_000 });

        await jogador.context.setOffline(false);
        // O socket.io-client reconecta sozinho e o App retoma a sessão; o
        // aviso é o sinal visível de que a rede voltou.
        await expect(aviso).toBeHidden({ timeout: 30_000 });
        // E a identidade sobreviveu: continuo na sala, sem pop-up de login.
        await expect(jogador.page.getByRole('button', { name: 'Sair da fila' })).toBeVisible();
        await expect(jogador.page.getByLabel('Nome')).toHaveCount(0);
    });
});
