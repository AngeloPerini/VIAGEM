import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { GroupProvider } from './contexts/GroupContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';
import { PwaInstallHint } from './components/PwaInstallHint';
import { registerTripFlowPwa } from './pwa';

registerTripFlowPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <GroupProvider>
              <App />
              <PwaInstallHint />
            </GroupProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
