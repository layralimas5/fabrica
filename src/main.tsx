import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createServices } from './infra/container';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <App services={createServices()} />
  </StrictMode>,
);
