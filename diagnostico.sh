#!/usr/bin/env bash
# diagnostico.sh — checagem rápida do ambiente de infra do Contra-Zap.
#
# Roda todos os checks que a gente historicamente teve que fazer um por um
# durante debug (versão do Node, porta ocupada, volumes comentados, etc.)
# num único comando. Rode isso ANTES de pedir ajuda de debug — na maioria
# das vezes já aponta a causa direto.
#
# Uso: bash diagnostico.sh   (rodar na raiz do projeto Contra-Zap)

set -uo pipefail

VERMELHO='\033[0;31m'
VERDE='\033[0;32m'
AMARELO='\033[1;33m'
SEM_COR='\033[0m'

ok()   { echo -e "${VERDE}✔${SEM_COR} $1"; }
erro() { echo -e "${VERMELHO}✘${SEM_COR} $1"; }
avisa(){ echo -e "${AMARELO}!${SEM_COR} $1"; }

echo "=== Diagnóstico Contra-Zap ==="
echo ""

# --- 1. Está na pasta certa? ------------------------------------------------
if [ ! -f "package.json" ] || [ ! -f "Server.js" ]; then
    erro "Não parece a raiz do projeto (falta package.json ou Server.js). Rode este script na pasta do Contra-Zap."
    exit 1
fi
ok "Rodando na raiz do projeto."
echo ""

# --- 2. Docker Desktop rodando? --------------------------------------------
if ! docker info > /dev/null 2>&1; then
    erro "Docker não está respondendo. Abra o Docker Desktop e espere o ícone da baleia ficar estável."
    exit 1
fi
ok "Docker Desktop está rodando."
echo ""

# --- 3. Versão do Node no Dockerfile ---------------------------------------
if [ -f "Dockerfile" ]; then
    NODE_VERSION_DOCKERFILE=$(grep -m1 -oE 'node:[0-9]+' Dockerfile | grep -oE '[0-9]+')
    if [ -z "$NODE_VERSION_DOCKERFILE" ]; then
        avisa "Não consegui identificar a versão do Node no Dockerfile — confira manualmente."
    elif [ "$NODE_VERSION_DOCKERFILE" -lt 22 ]; then
        erro "Dockerfile usa Node $NODE_VERSION_DOCKERFILE — better-sqlite3@13 exige Node >=22. Isso VAI causar segfault (exit 139)."
    else
        ok "Dockerfile usa Node $NODE_VERSION_DOCKERFILE (>=22, ok)."
    fi
else
    avisa "Dockerfile não encontrado nessa pasta."
fi
echo ""

# --- 4. docker-compose.yml: volumes comentados? -----------------------------
if [ -f "docker-compose.yml" ]; then
    if grep -qE '^\s*#\s*-\s*\./banco\.sqlite' docker-compose.yml; then
        erro "Os volumes de banco.sqlite/jwt.secret parecem estar COMENTADOS no docker-compose.yml — contas vão sumir a cada rebuild."
    else
        ok "Volumes de persistência (banco.sqlite/jwt.secret) não estão comentados."
    fi

    if grep -qE '^\s*platform:\s*linux/' docker-compose.yml; then
        avisa "docker-compose.yml tem 'platform:' fixo — isso quebra em máquinas/CI de arquitetura diferente. Considere remover."
    fi
else
    avisa "docker-compose.yml não encontrado nessa pasta."
fi
echo ""

# --- 5. banco.sqlite / jwt.secret existem como ARQUIVO (não diretório)? ----
for arquivo in banco.sqlite jwt.secret; do
    if [ -d "$arquivo" ]; then
        erro "$arquivo é um DIRETÓRIO, não um arquivo — o bind mount vai quebrar. Apague a pasta e rode: touch $arquivo"
    elif [ -f "$arquivo" ]; then
        ok "$arquivo existe como arquivo normal."
    else
        avisa "$arquivo ainda não existe — rode 'touch banco.sqlite jwt.secret' antes do primeiro 'docker compose up'."
    fi
done
echo ""

# --- 6. Porta 3000 já ocupada? ----------------------------------------------
if command -v lsof > /dev/null 2>&1; then
    OCUPANTE=$(lsof -i :3000 -sTCP:LISTEN -t 2>/dev/null | head -n1)
    if [ -n "$OCUPANTE" ]; then
        PROCESSO=$(ps -p "$OCUPANTE" -o comm= 2>/dev/null)
        avisa "Porta 3000 já está em uso pelo processo PID $OCUPANTE ($PROCESSO). Se não for o container atual, mate com: kill -9 $OCUPANTE"
    else
        ok "Porta 3000 está livre."
    fi
else
    avisa "Comando 'lsof' não disponível — pule este check."
fi
echo ""

# --- 7. public/dist existe (build do front já rodou)? ----------------------
if [ -d "public/dist" ] && [ -f "public/dist/index.html" ]; then
    ok "public/dist/index.html existe (build do frontend já rodou)."
else
    avisa "public/dist/index.html não existe. Se for rodar 'npm start' SEM Docker, rode antes: cd public/app && npm run build"
fi
echo ""

# --- 8. .dockerignore cobre os pontos conhecidos? ---------------------------
if [ -f ".dockerignore" ]; then
    for padrao in "node_modules" "training/" "public/app/node_modules"; do
        if ! grep -qF "$padrao" .dockerignore; then
            avisa ".dockerignore não menciona '$padrao' — pode inflar o contexto de build à toa."
        fi
    done
fi
echo ""

echo "=== Fim do diagnóstico ==="
