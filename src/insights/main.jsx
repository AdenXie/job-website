import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import InsightsApp from './InsightsApp.jsx';
import './insights.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <InsightsApp />
    <Analytics />
  </React.StrictMode>,
);
