// modelo.js
// Contas sobre o modelo comum de teste (ver gerar.js), usadas tanto por quem
// roda quanto por quem desenha — o número do terminal e o da página têm que
// sair da mesma conta.

export function somaDuracao(nos) {
    return nos.reduce((total, n) => total + (n.duracaoMs ?? 0), 0);
}

export function temFalha(no) {
    return no.estado === 'falhou' || (no.filhos ?? []).some(temFalha);
}

// Conta só as folhas: um `test()` com cinco `t.test()` dentro são cinco
// verificações, não seis.
export function contar(nos, total = { passou: 0, falhou: 0, pulou: 0, instavel: 0, total: 0 }) {
    for (const no of nos) {
        if (no.filhos?.length) {
            contar(no.filhos, total);
            // Pai que falhou sozinho (hook, setup) sem nenhum filho falho
            // ainda é uma falha que precisa aparecer na conta.
            if (no.estado === 'falhou' && !no.erro?.soPorFilhos && !no.filhos.some(temFalha)) {
                total.falhou++;
                total.total++;
            }
        } else {
            total[no.estado]++;
            total.total++;
        }
    }
    return total;
}
