import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { GroupProvider } from './contexts/GroupContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <GroupProvider>
        <App />
      </GroupProvider>
    </AuthProvider>
  </StrictMode>,
);
