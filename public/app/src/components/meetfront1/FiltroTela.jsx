import { useEffect, useState } from 'react';
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

// Choque de manilha: quando uma manilha bate na mesa (a mesa dispara
// EVENTO_IMPACTO_MANILHA, ver dispararImpactoManilha), a aberração da tela
// salta CHOQUE_PICO_PX a mais e volta ao ajuste normal em CHOQUE_DURACAO_MS,
// tremendo no caminho — como se a carta mexesse no próprio aparelho. Só
// soma por cima do ajuste salvo, nunca grava nada.
const EVENTO_IMPACTO_MANILHA = 'mf1-impacto-manilha';
const CHOQUE_PICO_PX = 14;
const CHOQUE_DURACAO_MS = 900;
const CHOQUE_TREMIDO = 0.35;

export function dispararImpactoManilha() {
    window.dispatchEvent(new Event(EVENTO_IMPACTO_MANILHA));
}

function useChoqueAberracao() {
    const [extra, setExtra] = useState(0);
    useEffect(() => {
        let quadro;
        const disparar = () => {
            cancelAnimationFrame(quadro);
            const inicio = performance.now();
            const passo = (agora) => {
                const t = Math.min(1, (agora - inicio) / CHOQUE_DURACAO_MS);
                const base = CHOQUE_PICO_PX * (1 - t) ** 2;
                const tremido = (Math.random() * 2 - 1) * base * CHOQUE_TREMIDO;
                setExtra(t < 1 ? Math.max(0, Math.round(base + tremido)) : 0);
                if (t < 1) quadro = requestAnimationFrame(passo);
            };
            quadro = requestAnimationFrame(passo);
        };
        window.addEventListener(EVENTO_IMPACTO_MANILHA, disparar);
        return () => {
            window.removeEventListener(EVENTO_IMPACTO_MANILHA, disparar);
            cancelAnimationFrame(quadro);
        };
    }, []);
    return extra;
}

export default function FiltroTela({ children }) {
    const filtroSalvo = useFiltros(CHAVE_FILTRO_MF1, FILTRO_PADRAO_MF1);
    const [aberto, setAberto] = useState(false);
    const choque = useChoqueAberracao();
    // Durante o choque a aberração (deslocamento R/B em px, `abInt`) ganha o
    // extra; se o ajuste salvo estiver com a CRT toda desligada, o filtro
    // dela entra só enquanto o choque durar.
    const crtDesligada = filtroSalvo.aberracao <= 0 && filtroSalvo.curvatura <= 0;
    const f = choque > 0
        ? {
            ...filtroSalvo,
            aberracao: Math.max(filtroSalvo.aberracao, 1),
            abInt: filtroSalvo.abInt + choque,
            filtroCss: crtDesligada ? `${filtroSalvo.filtroCss} url(#cz-crt)`.trim() : filtroSalvo.filtroCss,
        }
        : filtroSalvo;

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
