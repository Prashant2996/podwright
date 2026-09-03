import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { AutoRefreshProvider } from './hooks/useAutoRefresh';
import { DeploymentEventsProvider } from './hooks/useDeploymentEvents';
import { ProProvider } from './hooks/usePro';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmModal';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AutoRefreshProvider>
          <DeploymentEventsProvider>
            <ProProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <App />
                </ConfirmProvider>
              </ToastProvider>
            </ProProvider>
          </DeploymentEventsProvider>
        </AutoRefreshProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
