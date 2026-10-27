// O fluxo de login em etapas do PopupLogin.jsx — a parte que o protocolo
// sozinho não descreve: qual etapa vem depois de qual, e como o erro do
// servidor chega até quem está olhando.
import { test, expect, nomeUnico, abrirLogin, esperarSalas } from './fixtures.js';

test.describe('login em etapas', () => {
    test('nome novo oferece cadastro ou jogar sem conta; convidado entra direto', async ({ page }) => {
        const nome = nomeUnico('visitante');
        await abrirLogin(page);

        await page.getByLabel('Nome').fill(nome);
        await page.getByRole('button', { name: 'CONTINUAR' }).click();

        // A oferta é a consequência de verificarNome ter voltado existe:false.
        await expect(page.getByText(`"${nome}" ainda não tem conta`)).toBeVisible();
        await page.getByRole('button', { name: 'NÃO, SÓ JOGAR' }).click();

        // O JOGAR que abriu o pop-up leva direto pras salas depois do login.
        await esperarSalas(page, nome);
    });

    test('convidado sem nome entra como Fantasma com número sorteado', async ({ page }) => {
        await abrirLogin(page);
        await page.getByRole('button', { name: 'JOGAR COMO CONVIDADO' }).click();

        await page.getByRole('button', { name: 'CONTINUAR SEM NOME' }).click();

        await expect(page.getByText('SALAS ABERTAS')).toBeVisible();
        await expect(page.getByTitle('Você')).toHaveText(/^Fantasma\d{4}$/);
    });

    test('registrar uma conta nova já deixa logado', async ({ page }) => {
        const nome = nomeUnico('novato');
        await abrirLogin(page);

        await page.getByLabel('Nome').fill(nome);
        await page.getByRole('button', { name: 'CONTINUAR' }).click();
        await page.getByRole('button', { name: 'SIM, REGISTRAR' }).click();

        await expect(page.getByText(`Escolha uma senha pra registrar "${nome}"`)).toBeVisible();
        await page.getByLabel('Nova senha').fill('senha-forte-123');
        await page.getByRole('button', { name: 'CADASTRAR' }).click();

        await esperarSalas(page, nome);
    });

    test('nome já registrado pede a senha, e senha errada mostra o erro', async ({ page }) => {
        // henrique vem do banco.json, semeado em todo banco novo.
        await abrirLogin(page);
        await page.getByLabel('Nome').fill('henrique');
        await page.getByRole('button', { name: 'CONTINUAR' }).click();

        await expect(page.getByText('Esse nome já é registrado.')).toBeVisible();
        await page.getByLabel('Senha').fill('claramente-errada');
        await page.getByRole('button', { name: 'ENTRAR', exact: true }).click();

        // O erro do ack aparece no pop-up — e a etapa NÃO avança.
        await expect(page.locator('.az-erro')).toBeVisible();
        await expect(page.getByLabel('Senha')).toBeVisible();
    });

    test('nome curto nem sai da tela: o botão fica desabilitado', async ({ page }) => {
        // O front barra antes de mandar (mínimo de conexao/limites.js), então
        // CONVIDADO_INVALIDO não é alcançável pela interface — quem cobre
        // esse código é tests/api/limites.test.js. O que o E2E trava aqui é
        // que a barreira de fato existe na tela.
        await abrirLogin(page);
        const continuar = page.getByRole('button', { name: 'CONTINUAR' });
        const convidado = page.getByRole('button', { name: 'JOGAR COMO CONVIDADO' });

        await page.getByLabel('Nome').fill('ab');
        await expect(continuar).toBeDisabled();
        await expect(convidado).toBeDisabled();

        await page.getByLabel('Nome').fill('abc');
        await expect(continuar).toBeEnabled();
        await expect(convidado).toBeEnabled();
    });

    test('senha curta demais não deixa cadastrar', async ({ page }) => {
        // Mesmo princípio, do outro lado do formulário: o mínimo de senha
        // desabilita o botão em vez de deixar o servidor recusar.
        await abrirLogin(page);
        await page.getByLabel('Nome').fill(nomeUnico('curto'));
        await page.getByRole('button', { name: 'CONTINUAR' }).click();
        await page.getByRole('button', { name: 'SIM, REGISTRAR' }).click();

        const cadastrar = page.getByRole('button', { name: 'CADASTRAR' });
        await page.getByLabel('Nova senha').fill('1234');
        await expect(cadastrar).toBeDisabled();

        await page.getByLabel('Nova senha').fill('senha-longa-o-bastante');
        await expect(cadastrar).toBeEnabled();
    });

    test('"Voltar" na tela de senha retorna ao nome sem perder o campo', async ({ page }) => {
        await abrirLogin(page);
        await page.getByLabel('Nome').fill('henrique');
        await page.getByRole('button', { name: 'CONTINUAR' }).click();
        await page.getByRole('button', { name: 'Voltar' }).click();

        await expect(page.getByLabel('Nome')).toHaveValue('henrique');
    });
});
