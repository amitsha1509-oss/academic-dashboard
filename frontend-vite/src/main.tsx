import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Bootstrap } from './App';

document.documentElement.dir = 'rtl';
document.documentElement.lang = 'he';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
