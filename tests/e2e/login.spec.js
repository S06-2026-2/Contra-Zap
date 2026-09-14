// O fluxo de login em etapas do Login.jsx — a parte que o protocolo sozinho
// não descreve: qual tela vem depois de qual, e como o erro do servidor
// chega até quem está olhando.
import { test, expect, nomeUnico } from './fixtures.js';

test.describe('login em etapas', () => {
    test('nome novo oferece cadastro ou jogar sem conta; convidado entra direto', async ({ page }) => {
        const nome = nomeUnico('visitante');
        await page.goto('/');

        await page.getByLabel('Nome').fill(nome);
        await page.getByRole('button', { name: 'Continuar' }).click();

        // A oferta é a consequência de verificarNome ter voltado existe:false.
        await expect(page.getByText(`"${nome}" ainda não tem conta`)).toBeVisible();
        await page.getByRole('button', { name: 'Não, só jogar' }).click();

        await expect(page.getByRole('heading', { name: `Olá, ${nome}` })).toBeVisible();
    });

    test('registrar uma conta nova já deixa logado', async ({ page }) => {
        const nome = nomeUnico('novato');
        await page.goto('/');

        await page.getByLabel('Nome').fill(nome);
        await page.getByRole('button', { name: 'Continuar' }).click();
        await page.getByRole('button', { name: 'Sim, registrar' }).click();

        await expect(page.getByText(`Escolha uma senha pra registrar "${nome}"`)).toBeVisible();
        await page.getByLabel('Senha').fill('senha-forte-123');
        await page.getByRole('button', { name: 'Cadastrar' }).click();

        await expect(page.getByRole('heading', { name: `Olá, ${nome}` })).toBeVisible();
    });

    test('nome já registrado pede a senha, e senha errada mostra o código do erro', async ({ page }) => {
        // henrique vem do banco.json, semeado em todo banco novo.
        await page.goto('/');
        await page.getByLabel('Nome').fill('henrique');
        await page.getByRole('button', { name: 'Continuar' }).click();

        await expect(page.getByText('Usuário registrado. Confirme sua identidade, henrique.')).toBeVisible();
        await page.getByLabel('Senha').fill('claramente-errada');
        await page.getByRole('button', { name: 'Entrar' }).click();

        // O erro do ack aparece na tela com o código — e a tela NÃO avança.
        await expect(page.locator('.erro')).toContainText('SENHA_INCORRETA');
        await expect(page.getByLabel('Senha')).toBeVisible();
    });

    test('nome curto nem sai da tela: o botão fica desabilitado', async ({ page }) => {
        // O front barra antes de mandar (mínimo de conexao/limites.js), então
        // CONVIDADO_INVALIDO não é alcançável pela interface — quem cobre
        // esse código é tests/api/limites.test.js. O que o E2E trava aqui é
        // que a barreira de fato existe na tela.
        await page.goto('/');
        const continuar = page.getByRole('button', { name: 'Continuar' });

        await page.getByLabel('Nome').fill('ab');
        await expect(continuar).toBeDisabled();

        await page.getByLabel('Nome').fill('abc');
        await expect(continuar).toBeEnabled();
    });

    test('senha curta demais não deixa cadastrar', async ({ page }) => {
        // Mesmo princípio, do outro lado do formulário: o mínimo de senha
        // desabilita o botão em vez de deixar o servidor recusar.
        await page.goto('/');
        await page.getByLabel('Nome').fill(nomeUnico('curto'));
        await page.getByRole('button', { name: 'Continuar' }).click();
        await page.getByRole('button', { name: 'Sim, registrar' }).click();

        const cadastrar = page.getByRole('button', { name: 'Cadastrar' });
        await page.getByLabel('Senha').fill('1234');
        await expect(cadastrar).toBeDisabled();

        await page.getByLabel('Senha').fill('senha-longa-o-bastante');
        await expect(cadastrar).toBeEnabled();
    });

    test('"Voltar" na tela de senha retorna ao nome sem perder o campo', async ({ page }) => {
        await page.goto('/');
        await page.getByLabel('Nome').fill('henrique');
        await page.getByRole('button', { name: 'Continuar' }).click();
        await page.getByRole('button', { name: 'Voltar' }).click();

        await expect(page.getByLabel('Nome')).toHaveValue('henrique');
    });
});
