import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import ResumeApp from './ResumeApp.jsx';
import './resume.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ResumeApp />
    <Analytics />
  </React.StrictMode>,
);
