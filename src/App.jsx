import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';

// Import des pages
import Home from './pages/Home';
import ValentinePage from './pages/ValentinePage';
import Accepted from './pages/Accepted';
import SpyDashboard from './pages/SpyDashboard';
import Legal from './pages/Legal';

function App() {
  return (
    <AppProvider>
      {/* Overlay de texture global pour l'effet "Luxe/Papier" */}
      <div className="bg-noise"></div>
      
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/v/:id" element={<ValentinePage />} />
          <Route path="/accepted" element={<Accepted />} />
          <Route path="/spy/:id" element={<SpyDashboard />} />
          
          {/* Route pour les pages légales */}
          <Route path="/legal/:type" element={<Legal />} />

          {/* Catch-all pour rediriger les mauvaises URLs vers l'accueil */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;