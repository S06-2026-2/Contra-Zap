import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { assinarAvisoFichas } from '../../avisoFichas.js';
import Ficha from '../meetfront1/Ficha.jsx';
import './inicio.css';

// Espera a animação de eliminação começar antes de aparecer — o
// fichasGanhas sai no mesmo instante do jogadoresEliminados.
const ATRASO_MS = 900;
const DURACAO_MS = 4500;

// Aviso "+N FICHAS" por cima de qualquer tela (vai por portal pro <body>,
// mesmo motivo do Modal da arcade). Some sozinho ou no clique.
export default function AvisoFichas() {
    const [aviso, setAviso] = useState(null);

    useEffect(() => {
        const timers = [];
        const parar = assinarAvisoFichas((novo) => {
            if (!(novo.fichas > 0)) return;
            timers.push(setTimeout(() => setAviso({ ...novo, chave: Date.now() }), ATRASO_MS));
        });
        return () => {
            parar();
            timers.forEach(clearTimeout);
        };
    }, []);

    useEffect(() => {
        if (!aviso) return undefined;
        const timer = setTimeout(() => setAviso(null), DURACAO_MS);
        return () => clearTimeout(timer);
    }, [aviso]);

    if (!aviso) return null;
    const subtitulo = aviso.motivo === 'desistencia'
        ? 'pela desistência'
        : aviso.posicao === 1 ? 'você venceu!' : `${aviso.posicao}º lugar de ${aviso.total}`;
    return createPortal(
        <button type="button" key={aviso.chave} className="az-raiz mf2-aviso-fichas" onClick={() => setAviso(null)}>
            <span className="mf2-aviso-fichas-ficha"><Ficha /></span>
            <span className="az-px mf2-aviso-fichas-valor">+{aviso.fichas} FICHAS</span>
            <span className="az-px mf2-aviso-fichas-sub">{subtitulo}</span>
            {aviso.saldo != null && <span className="mf2-aviso-fichas-saldo">saldo: {aviso.saldo}</span>}
        </button>,
        document.body
    );
}
