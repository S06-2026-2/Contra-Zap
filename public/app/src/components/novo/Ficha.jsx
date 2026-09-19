// Ficha de aposta pro protótipo de mesa (MesaExperimento) — mesmo espírito
// do Carta.jsx: componente NOVO, classes prefixadas "ficha-exp-" pra não
// colidir com nada do jogo real (que hoje nem tem ficha nenhuma, só o
// número cru da aposta em texto). Todas as fichas são IDÊNTICAS de
// propósito (mesmo valor de denominação) — quem conta é a QUANTIDADE
// empilhada, não um número pintado em cada uma, igual pilha de ficha de
// pôquer de verdade.
//
// Portada do experimento arquivado em public/_intro/index.html (.ficha,
// radial-gradient dourado + anel — ver criarFicha lá) mas com a borda
// "caprichada": um anel de tracinhos alternados PRETO E BRANCO (era
// dourado/vinho antes; ficha de cassino clássica costuma ser assim), que é
// o detalhe que o rascunho original não tinha (lá era só um anel de cor
// sólida).
//
// `hue` (0-360, ver huesPorAssento em MesaExperimento.jsx): quando vem
// preenchido, a FACE (miolo) usa essa cor — é o que faz a ficha de aposta
// de um fantasminha "combinar" com a cor do corpo dele (mesma fonte, ver
// Fantasminha.jsx). Sem `hue` (a SUA ficha, que não tem fantasminha pra
// combinar a cor) cai no dourado clássico de sempre.
export default function Ficha({ destacada = false, hue }) {
    const corFace = hue == null
        ? undefined // undefined = deixa o gradiente dourado fixo do CSS
        : {
            '--ficha-face-clara': `hsl(${hue}, 85%, 88%)`,
            '--ficha-face-media': `hsl(${hue}, 75%, 68%)`,
            '--ficha-face-escura': `hsl(${hue}, 60%, 48%)`,
        };
    return (
        <div className={`ficha-exp${destacada ? ' ficha-exp-destacada' : ''}`}>
            <div className="ficha-exp-borda" />
            <div className={`ficha-exp-face${hue != null ? ' ficha-exp-face-colorida' : ''}`} style={corFace}>
                <div className="ficha-exp-brilho" />
                <div className="ficha-exp-anel-interno" />
            </div>
        </div>
    );
}
