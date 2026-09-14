import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Bola from './Bola.jsx';
import './bola.css';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <Bola />
    </StrictMode>,
);
