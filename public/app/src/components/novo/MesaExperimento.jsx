import { useMemo, useState } from 'react';
import Fantasminha from './Fantasminha.jsx';

// Sandbox pro layout da tela de Partida — desligado do socket/protocolo de
// propósito, só o esqueleto visual (fundo, mesa oval estilo poker,
// retângulo de assento por jogador) pra fechar o arranjo antes de mexer no
// Partida.jsx de verdade. Este arquivo era o experimento de fichas/cartas
// arremessadas (ver public/_intro/, onde o original continua arquivado, e o
// commit "testando mecanica de carta e mesa aleatoria"); aposentado pra dar
// lugar a este.
//
// Elementos que o Partida.jsx de verdade (novo/ e o antigo, hoje idênticos)
// já precisam mostrar, levantados pra guiar os próximos passos deste
// protótipo:
//   - Sala: título com o salaId, botão sair (texto muda antes/depois de
//     iniciar), senha (só se privada e só pra quem criou).
//   - Espera: lista de quem já entrou, contador de "sala cheia, começa em
//     Xs", botão forçar início.
//   - Status por jogador durante a partida: 💀 morreu, 🤖 no automático
//     (desconectado), quanto já apostou nesta rodada.
//   - Cabeçalho de turno: de quem é a vez / quem venceu o jogo.
//   - Pós-vitória: botão "jogar de novo" (só o dono da sala) e convite de
//     revanche (aceitar/recusar) pros demais.
//   - Mesa (vaza atual): uma carta por jogador que já jogou nesta vaza, com
//     destaque na vencedora durante a pausa antes de limpar.
//   - Vira/manilha: a carta virada que define o naipe/valor que vale mais.
//   - Rodada cega ("testa", 1 carta): mostra a mão dos OUTROS jogadores,
//     nunca a própria.
//   - Aposta: input de quantas vazas você acha que vai fazer, só na sua
//     vez; mensagem de espera nas vezes dos outros.
//   - Sua mão: cartas clicáveis (só na sua vez), viradas na rodada cega.
//   - Placar da última rodada (hp de cada jogador).
//   - Chat: mensagens prontas, feed (sistema vs jogador), input livre
//     (quando habilitado), cooldown de envio.
//   - Erro de ação e log de eventos (debug).
// Este primeiro passo cobre só fundo + mesa + assentos; o resto entra por
// cima depois que o arranjo espacial estiver bom.

const MIN_JOGADORES = 2;
const MAX_JOGADORES = 8;

// "Você" sempre no ângulo de baixo (90°: em coordenadas de tela, com y
// crescendo pra baixo, sen(90°)=1 é o ponto mais embaixo da elipse); os
// outros N-1 assentos se espalham em partes iguais ao redor da mesma
// elipse. Com 2 jogadores isso já dá "cara a cara" (um embaixo, um em
// cima); com 3, um triângulo (você embaixo, os outros dois em cima); daí
// pra frente vai virando um leque cada vez mais fechado ao redor da mesa.
// Raios em % do próprio tamanho da mesa (não da tela). 50% cairia exatamente
// EM CIMA da borda da mesa (a elipse "cheia" que ela ocupa); qualquer coisa
// acima disso (62-80%) empurra o assento pra FORA dela, na mesma proporção
// largura/altura da mesa — o seu assento usa um raio ainda maior, pra ficar
// mais destacado/perto de quem está olhando a tela.
const RAIO_X_OUTROS = 62;
const RAIO_Y_OUTROS = 68;
const RAIO_X_VOCE = 62;
const RAIO_Y_VOCE = 80;

function calcularAssentos(quantidade) {
    return Array.from({ length: quantidade }, (_, i) => {
        const eVoce = i === 0;
        const angulo = (Math.PI / 2) + i * ((2 * Math.PI) / quantidade);
        const raioX = eVoce ? RAIO_X_VOCE : RAIO_X_OUTROS;
        const raioY = eVoce ? RAIO_Y_VOCE : RAIO_Y_OUTROS;
        return {
            eVoce,
            x: 50 + raioX * Math.cos(angulo),
            y: 50 + raioY * Math.sin(angulo),
        };
    });
}

export default function MesaExperimento({ onFechar }) {
    const [quantidade, setQuantidade] = useState(4);
    const assentos = useMemo(() => calcularAssentos(quantidade), [quantidade]);

    return (
        <div className="mesa-exp-tela">
            {onFechar && (
                <button type="button" className="mesa-exp-fechar" onClick={onFechar}>← Voltar</button>
            )}

            {/* Só pra testar o arranjo com quantidades diferentes de
                jogador — não existe no jogo de verdade (lá a quantidade vem
                de jogadores.length). */}
            <div className="mesa-exp-controle">
                <span>{quantidade} jogadores</span>
                <div className="botoes">
                    <button
                        type="button"
                        onClick={() => setQuantidade((q) => Math.max(MIN_JOGADORES, q - 1))}
                        disabled={quantidade <= MIN_JOGADORES}
                    >
                        −
                    </button>
                    <button
                        type="button"
                        onClick={() => setQuantidade((q) => Math.min(MAX_JOGADORES, q + 1))}
                        disabled={quantidade >= MAX_JOGADORES}
                    >
                        +
                    </button>
                </div>
            </div>

            <div className="mesa-exp-mesa">
                {assentos.map((assento, i) => (
                    <div
                        key={i}
                        className={`mesa-exp-assento${assento.eVoce ? ' mesa-exp-assento-voce' : ''}`}
                        style={{ left: `${assento.x}%`, top: `${assento.y}%` }}
                    >
                        {assento.eVoce ? (
                            'Você'
                        ) : (
                            <>
                                <Fantasminha />
                                <span className="mesa-exp-assento-legenda">Player {i}</span>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
