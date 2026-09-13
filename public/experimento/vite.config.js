import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Motor separado de propósito: nenhum proxy pro Server.js, nenhum import de
// conexao/*, nenhum socket.io-client. `npm run dev` aqui dentro sobe sozinho
// — não precisa buildar nada, não precisa do GameStart, não precisa do
// backend rodando em :3000. Porta própria (5175) pra rodar junto com o
// `npm run dev` de public/app (5173) sem brigar.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5175,
    },
    // Multi-página: cada experimento novo ganha seu próprio .html na raiz
    // (index.html = telas de nome, bola.html = a bola). Em `dev` o Vite já
    // serve qualquer .html sem precisar disto — só o `build` (que aqui nem é
    // o fluxo normal, ver README.md) exige listar as entradas explicitamente.
    build: {
        rollupOptions: {
            input: {
                index: path.resolve(import.meta.dirname, 'index.html'),
                bola: path.resolve(import.meta.dirname, 'bola.html'),
            },
        },
    },
});
