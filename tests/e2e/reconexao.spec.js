// O caminho com mais peças integradas do sistema: sessionStorage +
// retomarSessao + minhaSalaAtiva + reconectar, todos trabalhando juntos pra
// um F5 no meio da partida não jogar o jogador fora. A suíte de API prova
// cada evento; só o E2E prova que a interface costura os quatro.
import { test, expect } from './fixtures.js';

test.describe('reconexão pela interface', () => {
    test('F5 no meio da partida: a sessão volta sozinha e a Lobby oferece reconectar', async ({ jogador }) => {
        const salaId = await jogador.criarSala({ jogadores: 2, bots: 1 });
        await jogador.forcarInicio();
        await expect(jogador.cartas()).toHaveCount(1);

        await jogador.page.reload();

        // Sem pedir nome nem senha: a sessão veio do sessionStorage e foi
        // retomada com retomarSessao antes da tela de login aparecer.
        await expect(jogador.page.getByRole('heading', { name: `Olá, ${jogador.nome}` })).toBeVisible();
        // E o servidor lembrou do assento (minhaSalaAtiva) — daí o banner.
        await expect(jogador.page.getByText(`Você saiu da sala ${salaId}`)).toBeVisible();
        await expect(jogador.page.getByText('Sua vaga na partida continua reservada.')).toBeVisible();
    });

    test('"Reconectar" devolve a mesma partida, com a mão intacta', async ({ jogador }) => {
        const salaId = await jogador.criarSala({ jogadores: 2, bots: 1 });
        await jogador.forcarInicio();
        const maoAntes = await jogador.cartas().allTextContents();
        expect(maoAntes).toHaveLength(1);

        await jogador.page.reload();
        await jogador.page.getByRole('button', { name: 'Reconectar' }).click();

        await expect(jogador.page.getByRole('heading', { name: `Sala ${salaId}` })).toBeVisible();
        await expect(jogador.page.getByRole('heading', { name: /^Sua mão/ })).toBeVisible();
        // A mão é a MESMA de antes do F5 — o estado veio do servidor, não foi
        // sorteado de novo. (Se o bot já jogou uma vaza nesse meio-tempo a
        // mão pode ter menos cartas, mas nunca cartas diferentes.)
        const maoDepois = await jogador.cartas().allTextContents();
        for (const carta of maoDepois) expect(maoAntes).toContain(carta);
        await expect(jogador.page.getByText('🔌 Reconectado')).toBeVisible();
    });

    test('queda de rede mostra o aviso, e ele some quando a rede volta', async ({ jogador }) => {
        await jogador.criarSala({ jogadores: 2, bots: 1 });

        await jogador.context.setOffline(true);
        await expect(jogador.page.getByText('Conexão perdida — tentando reconectar...')).toBeVisible({ timeout: 30_000 });

        await jogador.context.setOffline(false);
        // O socket.io-client reconecta sozinho e o App retoma a sessão; o
        // banner é o sinal visível de que a rede voltou.
        await expect(jogador.page.getByText('Conexão perdida — tentando reconectar...')).toBeHidden({ timeout: 30_000 });
        // E a identidade sobreviveu: a Lobby/sala continua com o meu nome, não a tela de login.
        await expect(jogador.page.getByLabel('Nome')).toHaveCount(0);
    });
});
