import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { aplicarAparienciaInicial } from './shared/hooks';
import { prepararInstalacion } from './shared/lib/instalar';
import './styles/index.css';

aplicarAparienciaInicial();
prepararInstalacion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
