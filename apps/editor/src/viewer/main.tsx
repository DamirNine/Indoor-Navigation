import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ViewerApp from './ViewerApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewerApp />
  </StrictMode>
);
