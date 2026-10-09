import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Eager, side-effecting import: installs the native FCM token receivers before React
// mounts. The Flutter wrapper resolves getToken() during app boot, so a lazily installed
// receiver missed the handover and no `platform: "app"` token was ever registered.
import '@core/firebase/nativePushBridge';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
