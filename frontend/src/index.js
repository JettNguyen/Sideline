import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import sidelineLogo from './logo.svg';

// Keep the tab icon synced with the app logo from src assets.
const favicon = document.querySelector("link[rel='icon']") || document.createElement('link');
favicon.setAttribute('rel', 'icon');
favicon.setAttribute('href', sidelineLogo);
document.head.appendChild(favicon);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
