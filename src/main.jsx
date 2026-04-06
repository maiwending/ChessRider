import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import './index.css';

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const redirectedPath = params.get('p');
  if (redirectedPath) {
    const cleanPath = redirectedPath.startsWith('/') ? redirectedPath : `/${redirectedPath}`;
    const nextUrl = `${window.location.pathname.replace(/\/$/, '')}${cleanPath}${window.location.hash || ''}`;
    window.history.replaceState(null, '', nextUrl);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
