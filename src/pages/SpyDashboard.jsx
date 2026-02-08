import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { 
  Heart, Clock, MousePointer2, CheckCircle2, Lock, 
  Loader2, Eye, Sparkles, MapPin, RefreshCw, PartyPopper 
} from 'lucide-react';
import confetti from 'canvas-confetti';

const SpyDashboard = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getSpyReport } = useApp();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); 
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  
  // Simulation BPM pour l'effet "Stress" (Cucu touch)
  const [bpm, setBpm] = useState(72);

  const consecutiveErrors = useRef(0);
  const prevDataRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const pageVisibleRef = useRef(true);

  // --- INTELLIGENCE : DÉTECTION DU PLAN & STATUT ---
  const isBasicPlan = data && data.plan === 'basic';
  const token = searchParams.get('token');

  // --- 1. FONCTIONS TECHNIQUES (On garde ta logique robuste) ---

  const handleUnlock = () => {
    // Lien Stripe pour l'upgrade SPY
    window.location.href = "https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02";
  };

  const loadReport = useCallback(async (isPolling = false) => {
    try {
      if (!isPolling) setLoading(true);
      
      const report = await getSpyReport(id);

      if (!report) {
        if (!isPolling) setAccessDenied(true);
        return;
      }

      // SÉCURITÉ : Vérification du Token
      if (report.token && report.token !== token) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      // Comparaison pour détecter les changements (Nouvelle réponse ?)
      if (prevDataRef.current) {
        if (prevDataRef.current.status !== 'accepted' && report.status === 'accepted') {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#fda4af', '#fb7185', '#fff'] // Confetti Rose/Blanc
          });
        }
      }

      prevDataRef.current = report;
      setData(report);
      setLastRefreshed(new Date());
      setConnectionStatus('connected');
      consecutiveErrors.current = 0;

    } catch (err) {
      console.error("Erreur chargement rapport:", err);
      consecutiveErrors.current += 1;
      if (consecutiveErrors.current > 3) {
        setConnectionStatus('error');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [id, token, getSpyReport]);

  // --- 2. POLLING & VISIBILITÉ (Ton moteur intact) ---

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    console.log("💓 Démarrage du scan temps réel...");
    pollingIntervalRef.current = setInterval(() => {
        if (pageVisibleRef.current) {
            loadReport(true);
            // Variation aléatoire du BPM pour le fun
            setBpm(prev => prev + (Math.random() > 0.5 ? 2 : -2));
        }
    }, 3000); 
  }, [loadReport]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    loadReport(); 
    startPolling();

    const handleVisibilityChange = () => {
        pageVisibleRef.current = !document.hidden;
        if (document.hidden) {
            stopPolling();
        } else {
            loadReport(true); 
            startPolling();
        }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
        stopPolling();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadReport, startPolling, stopPolling]);


  // --- 3. FORMATAGE DES DONNÉES (Pour le rendu visuel) ---

  const formatTimeAgo = (dateString) => {
      if (!dateString) return "En attente...";
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      if (diffInSeconds < 60) return "À l'instant";
      if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} min`;
      return `Il y a ${Math.floor(diffInSeconds / 3600)}h`;
  };

  const formatDuration = (ms) => {
    if (!ms) return "0s";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };


  // --- 4. RENDER : ÉTATS DE CHARGEMENT / ERREUR ---

  if (loading) {
    return (
      <div className="min-h-screen bg-rose-50 flex items-center justify-center">
        <div className="text-center space-y-4">
            <Loader2 className="animate-spin text-rose-400 mx-auto" size={48} />
            <p className="text-rose-400 font-serif animate-pulse">Connexion au satellite de l'Amour...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-rose-500/30 text-center max-w-md">
            <Lock className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Accès Interdit ✋</h1>
            <p className="text-rose-200/60 mb-6">Ce lien est invalide ou sécurisé. Tu tentes de tricher ?</p>
            <button onClick={() => navigate('/')} className="bg-rose-600 text-white px-6 py-2 rounded-full">Retourner sagement</button>
        </div>
      </div>
    );
  }

  // --- 5. RENDER : LE DASHBOARD "CUCU" ---

  const totalClicks = (data?.interactions?.clicks || 0) + (data?.interactions?.attempts || 0);
  const statusMessage = data.status === 'accepted' ? "C'est un OUI ! 💍" : 
                        data.status === 'refused' ? "C'est un Non..." : "En train de réfléchir...";

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-100 text-slate-700 font-sans selection:bg-rose-200">
      
      {/* BARRE DE STATUT FLOTTANTE */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 flex justify-center pointer-events-none">
         <div className="bg-white/80 backdrop-blur-md border border-rose-200 shadow-lg rounded-full px-4 py-1.5 flex items-center gap-3 animate-slide-down pointer-events-auto">
            <div className={`w-2.5 h-2.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-orange-400'}`}></div>
            <span className="text-[10px] uppercase tracking-widest text-rose-400 font-bold">
                {connectionStatus === 'connected' ? 'Liaison Sécurisée Active' : 'Reconnexion...'}
            </span>
            <button onClick={() => loadReport()} className="text-slate-400 hover:text-rose-500 transition-colors">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>
            </button>
         </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-20 pb-12 space-y-6">

        {/* HEADER */}
        <header className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-rose-100 text-rose-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                <Sparkles size={12} /> Dossier Confidentiel #{data.id.slice(0, 4)}
            </div>
            <h1 className="text-3xl md:text-4xl font-serif text-slate-800">
                Le Carnet Secret <span className="text-rose-500 italic">de {data.target_name}</span>
            </h1>
            <p className="text-slate-400 text-sm">
                Dernière activité détectée : {formatTimeAgo(data.last_active)}
            </p>
        </header>

        {/* CARTE PRINCIPALE : STATUT */}
        <div className={`relative overflow-hidden rounded-3xl p-8 text-center transition-all duration-500 shadow-xl shadow-rose-200/50 ${data.status === 'accepted' ? 'bg-gradient-to-br from-rose-400 to-pink-600 text-white' : 'bg-white border border-rose-100'}`}>
            {data.status === 'accepted' && (
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            )}
            
            <div className="relative z-10 flex flex-col items-center">
                {data.status === 'accepted' ? (
                    <div className="bg-white/20 p-4 rounded-full mb-4 animate-bounce">
                        <PartyPopper size={40} className="text-white" />
                    </div>
                ) : (
                    <div className="bg-rose-50 p-4 rounded-full mb-4">
                        <Loader2 size={40} className="text-rose-400 animate-spin-slow" />
                    </div>
                )}
                
                <h2 className="text-2xl font-bold mb-2">{statusMessage}</h2>
                <p className={`text-sm ${data.status === 'accepted' ? 'text-rose-100' : 'text-slate-400'}`}>
                   {data.status === 'pending' ? "Le suspense est à son comble..." : "L'attente est enfin terminée."}
                </p>
            </div>
        </div>

        {/* GRID METRICS "CUCU" */}
        <div className="grid grid-cols-2 gap-4">
            
            {/* Metric 1 : Temps */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-rose-50 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 text-rose-300 mb-2">
                    <Clock size={16} />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Temps de Rêverie</span>
                </div>
                <div className="text-2xl font-serif text-slate-700">
                    {formatDuration(data.interactions?.time_spent)}
                </div>
            </div>

            {/* Metric 2 : BPM (Fake but Cute) */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-rose-50 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 text-rose-300 mb-2">
                    <Heart size={16} className="animate-pulse fill-rose-300" />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Stress (BPM)</span>
                </div>
                <div className="text-2xl font-serif text-slate-700">
                    {bpm} <span className="text-xs font-sans text-slate-400">moyenne</span>
                </div>
            </div>

            {/* Metric 3 : Clics/Hésitations */}
            <div className="col-span-2 bg-white p-5 rounded-3xl shadow-sm border border-rose-50 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-rose-300 mb-1">
                        <MousePointer2 size={16} />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Hésitations de la souris</span>
                    </div>
                    <div className="text-2xl font-serif text-slate-700">
                        {totalClicks} <span className="text-sm font-sans text-slate-400">interactions</span>
                    </div>
                </div>
                {totalClicks > 5 && (
                    <div className="px-3 py-1 bg-rose-100 text-rose-500 text-xs rounded-full font-bold animate-pulse">
                        Agité(e) !
                    </div>
                )}
            </div>
        </div>

        {/* SECTION "HONEYPOT" : MAP & LOGS (LE UPSELL) */}
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
                <MapPin size={16} className="text-rose-500" />
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                    Localisation & Preuves
                </h3>
            </div>

            <div className="relative group">
                {/* CONTENEUR PRINCIPAL (Flouté ou Clair) */}
                <div className={`bg-white rounded-3xl border border-rose-100 overflow-hidden transition-all duration-500 ${isBasicPlan ? 'h-72 select-none' : 'h-auto'}`}>
                    
                    {/* LE CONTENU RÉEL (Ou Fake pour le teasing) */}
                    <div className={`h-full flex flex-col ${isBasicPlan ? 'filter blur-md opacity-60 scale-[0.98]' : ''}`}>
                        
                        {/* Map Area */}
                        <div className="h-40 bg-rose-50 w-full relative border-b border-rose-100">
                             {/* Si SPY, on met la vraie map (ici simulée par une image ou iframe) */}
                             {!isBasicPlan && data.location ? (
                                <iframe 
                                    width="100%" 
                                    height="100%" 
                                    frameBorder="0" 
                                    scrolling="no" 
                                    marginHeight="0" 
                                    marginWidth="0" 
                                    src={`https://maps.google.com/maps?q=${data.location.lat},${data.location.lng}&z=15&output=embed`}
                                    className="opacity-80 mix-blend-multiply"
                                ></iframe>
                             ) : (
                                 // Fake Map Visual pour le flou
                                 <div className="absolute inset-0 flex items-center justify-center bg-[url('https://assets.website-files.com/5e832e12eb7ca02ee9064d42/5f7911b339230f0c0888924b_Map%20Placeholder.png')] bg-cover opacity-50">
                                     <div className="w-4 h-4 bg-rose-500 rounded-full animate-ping"></div>
                                 </div>
                             )}
                        </div>

                        {/* Logs Area */}
                        <div className="p-4 bg-white font-mono text-xs space-y-3">
                             {/* Si SPY, on affiche les vrais logs, sinon des fakes pour le teasing */}
                             {(isBasicPlan || !data.logs || data.logs.length === 0 ? [
                                 {time: '14:02', msg: 'A zoomé sur ta photo...'},
                                 {time: '14:03', msg: 'Hésitation détectée (3s)'},
                                 {time: '14:03', msg: 'Curseur sur le bouton OUI'},
                                 {time: '14:04', msg: 'Tentative de fermeture bloquée'}
                             ] : data.logs).map((log, i) => (
                                 <div key={i} className="flex gap-3 text-slate-500 border-b border-rose-50 pb-2 last:border-0">
                                     <span className="text-rose-400 font-bold">{log.created_at ? new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : log.time}</span>
                                     <span>{log.action || log.msg}</span>
                                 </div>
                             ))}
                        </div>
                    </div>

                    {/* L'OVERLAY DE VENTE (LE PENDING LOCK) */}
                    {isBasicPlan && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/30 backdrop-blur-[2px] p-6 text-center transition-all hover:bg-white/40">
                            
                            <div className="bg-white p-4 rounded-full shadow-2xl shadow-rose-300 mb-4 animate-bounce hover:scale-110 transition-transform cursor-pointer" onClick={handleUnlock}>
                                <Lock className="text-rose-500" size={32} />
                            </div>
                            
                            <h3 className="text-xl font-serif text-slate-800 mb-2">Chut... C'est confidentiel 🤫</h3>
                            <p className="text-sm text-slate-500 mb-6 max-w-[260px] leading-relaxed">
                                On a capté sa localisation exacte et tous ses petits secrets.
                            </p>
                            
                            <button 
                                onClick={handleUnlock}
                                className="group relative bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold py-3 px-8 rounded-full shadow-[0_10px_20px_rgba(244,63,94,0.4)] transition-all transform hover:-translate-y-1 overflow-hidden"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    <Eye size={16} /> DÉBLOQUER LES PREUVES
                                </span>
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>
                            
                            <p className="text-[10px] text-slate-400 mt-4 flex items-center gap-1">
                                <Sparkles size={10} /> 
                                Mise à niveau instantanée (2.99€)
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* FOOTER */}
        <footer className="text-center pt-8 border-t border-rose-100">
            <button 
                onClick={() => navigate('/')}
                className="text-rose-300 hover:text-rose-500 text-xs font-medium uppercase tracking-widest transition-colors hover:underline underline-offset-4"
            >
                Refermer mon journal
            </button>
            <p className="text-[9px] text-slate-300 mt-4">
                Toutes les données sont cryptées avec Amour. YesOrYes © {new Date().getFullYear()}
            </p>
        </footer>

      </div>
    </div>
  );
};

export default SpyDashboard;