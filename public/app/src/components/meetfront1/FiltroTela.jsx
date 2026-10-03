import { useState } from 'react';
import { FILTRO_PADRAO, useFiltros } from '../arcade/filtros.js';
import { DefsFiltro, PainelFiltro } from '../arcade/PainelFiltro.jsx';

// "FILTRO DE TELA" do meetfront1: o mesmo filtro e o mesmo painel da casca
// arcade (ver arcade/Casca.jsx), aplicados em tudo do meetfront1 — tela de
// espera (forçar início) e mesa. Lembrado à parte do arcade, com um ponto
// de partida próprio. O volume do som é o do app inteiro (somArcade.js,
// já começa em 70). O painel fica fora da camada filtrada, no canto de
// cima à direita (ver .mf1-filtro em meetfront1.css) — embaixo à direita
// é o canto do seu fantasminha/medalhão da vida.
const CHAVE_FILTRO_MF1 = 'contrazap-meetfront1-filtro';
// Painel escondido por enquanto: o filtro continua aplicado com o padrão
// abaixo (ou o último ajuste salvo neste navegador). true mostra de novo.
const MOSTRAR_PAINEL_FILTRO = false;
const FILTRO_PADRAO_MF1 = {
    ...FILTRO_PADRAO,
    grao: 2,
    graoAnimado: true,
    curvatura: 0,
    scanlines: 51,
    scanlinePasso: 4,
    aberracao: 23,
};

export default function FiltroTela({ children }) {
    const f = useFiltros(CHAVE_FILTRO_MF1, FILTRO_PADRAO_MF1);
    const [aberto, setAberto] = useState(false);

    // A camada filtrada é fixa e do tamanho da janela: `filter` vira o
    // bloco de referência dos position:fixed de dentro, então ela precisa
    // cobrir a tela inteira pra eles continuarem no lugar.
    return (
        <>
            <DefsFiltro f={f} />
            <div
                className="mf1-filtro-tela"
                style={{
                    filter: f.filtroCss || undefined,
                    transform: f.overscan !== 1 ? `scale(${f.overscan})` : undefined,
                }}
            >
                {children}
                {f.scanlines > 0 && (
                    <div className="az-scanlines" style={{ background: f.scanlineBg, opacity: f.scanlineOp }} />
                )}
            </div>
            {MOSTRAR_PAINEL_FILTRO && (
                <div className="mf1-filtro">
                    <PainelFiltro f={f} aberto={aberto} onAlternar={() => setAberto((a) => !a)} />
                </div>
            )}
        </>
    );
}
