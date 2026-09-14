import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { registrarSocketServer } from './conexao/socketServer.js';
import { db } from './conexao/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
// pingInterval + pingTimeout = pior caso pra perceber uma queda de conexão
// (aba fechada, rede caiu sem aviso, cabo puxado) — default do socket.io é
// 25s + 20s = 45s. Encolhido pra ~25s (10s + 15s): perceptível rápido o
// bastante pro jogador ver o aviso de conexão perdida (ver public/app/src/socket.js)
// sem exagerar na frequência de ping (ainda troca só um pacote a cada 10s
// por conexão ociosa).
const io = new Server(server, {
  pingInterval: 10_000,
  pingTimeout: 15_000,
});

registrarSocketServer(io);

// Serve o build da interface React (gerado por `npm run build` dentro de
// public/app — ver public/app/vite.config.js, que manda a saída pra cá).
// Se essa pasta não existir ainda, rode o build primeiro; ver README.md.
app.use(express.static(path.join(__dirname, 'public', 'dist')));

// Endpoint de healthcheck: usado pelo Docker (HEALTHCHECK) e por qualquer
// orquestrador/monitoramento pra saber se o processo está de pé e
// respondendo, sem depender de abrir a partida inteira pra testar.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dist', 'index.html'));
});

// PORT vem do ambiente (Docker/Railway/etc. definem essa variável e
// esperam que o processo escute nela) — 3000 só é usado como fallback
// pra rodar local sem configurar nada.
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// --- Encerramento gracioso -------------------------------------------------
//
// Sem isso, um `docker compose down` (ou qualquer redeploy) manda SIGTERM e
// o processo morre na hora, sem terminar o que estava fazendo. O caso mais
// concreto: o banco está em modo WAL (ver conexao/db.js), que só mescla as
// escritas recentes de volta pro banco.sqlite principal quando a conexão é
// fechada direito — matar o processo sem chamar db.close() deixa dados
// novos presos no banco.sqlite-wal, que não é persistido fora do container.

let encerrando = false;

function encerrarGraciosamente(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`\n${sinal} recebido — encerrando graciosamente...`);

  // Para de aceitar conexão HTTP nova (deixa as que já estão em andamento
  // terminarem sozinhas).
  server.close(() => console.log('Servidor HTTP fechado.'));

  // Fecha o Socket.IO — isso derruba as conexões websocket ativas. Pro
  // escopo atual (estado de partida só em memória, sem persistência entre
  // restarts) não tem como fazer diferente sem mudar a arquitetura; ver
  // item de "arquitetura single-process" no backlog.
  io.close(() => console.log('Socket.IO fechado.'));

  // Fecha o banco — em modo WAL, isso aciona o checkpoint automático que
  // mescla o banco.sqlite-wal de volta pro banco.sqlite principal.
  try {
    db.close();
    console.log('Banco de dados fechado (WAL mesclado no arquivo principal).');
  } catch (err) {
    console.error('Erro ao fechar o banco:', err);
  }

  // Dá um tempo curto pros closes acima terminarem antes de forçar saída
  // (evita o processo nunca sair se alguma conexão ficar pendurada).
  setTimeout(() => {
    console.log('Saindo.');
    process.exit(0);
  }, 2000).unref();
}

process.on('SIGTERM', () => encerrarGraciosamente('SIGTERM'));
process.on('SIGINT', () => encerrarGraciosamente('SIGINT'));

// --- Erros não tratados -----------------------------------------------------
//
// Sem isso, um throw dentro de um setTimeout/callback assíncrono (ex.: um
// bug no GameController) derruba o processo Node inteiro — tira do ar até
// quem estava numa partida sem problema nenhum. Logamos o erro em vez de
// deixar o processo morrer silenciosamente sem explicação nenhuma.
//
// Ressalva: continuar rodando depois de um uncaughtException não é 100%
// seguro (o estado interno pode ter ficado inconsistente) — mas pro escopo
// atual do projeto, favorecer "continuar no ar" em vez de "cair sozinho" é
// a troca que faz mais sentido. Se isso virar problema recorrente, vale
// reavaliar pra encerrar graciosamente em vez de só logar.
process.on('uncaughtException', (err) => {
  console.error('Exceção não capturada:', err);
});

process.on('unhandledRejection', (motivo) => {
  console.error('Promise rejeitada sem tratamento:', motivo);
});