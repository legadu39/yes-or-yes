import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, LockKeyhole, Loader2, Ban, Eye, PartyPopper, Lock, Sparkles, AlertTriangle, RefreshCw, Heart } from 'lucide-react';
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
  
  const consecutiveErrors = useRef(0);
  const prevDataRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const pageVisibleRef = useRef(true);

  // --- INTELLIGENCE : DÉTECTION DU PLAN & STATUT ---
  const isBasicPlan = data && data.plan === 'basic';
  const hasAnswered = data && data.status === 'accepted';
  const isRejected = data && data.status === 'rejected';
  const areDetailsLocked = isBasicPlan; 

  // --- 1. CHARGEMENT & SMART POLLING ---
  
  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    try {
      const token = searchParams.get('token');
      if (!token) {
          setAccessDenied(true);
          setLoading(false);
          return;
      }

      if (!isBackgroundRefresh) setLoading(true);

      const result = await getSpyReport(id, token);

      if (!result) {
        consecutiveErrors.current += 1;
        if (consecutiveErrors.current > 3) {
            setAccessDenied(true);
        }
      } else {
        consecutiveErrors.current = 0;
        
        // Trigger victoire si changement d'état
        if (prevDataRef.current && prevDataRef.current.status === 'pending' && result.status === 'accepted') {
            triggerVictory();
        }

        setData(result);
        prevDataRef.current = result;
        setLastRefreshed(new Date());
        setConnectionStatus('connected');
      }
    } catch (err) {
      console.error("Erreur polling spy:", err);
      setConnectionStatus('error');
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  }, [id, searchParams, getSpyReport]);

  // --- 2. CYCLE DE VIE & HEURISTIQUES ---

  useEffect(() => {
    fetchData();

    const handleVisibilityChange = () => {
      pageVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        fetchData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalDuration = (data && data.status === 'pending') ? 5000 : 60000;

    pollingIntervalRef.current = setInterval(() => {
      if (pageVisibleRef.current) {
        fetchData(true);
      }
    }, intervalDuration);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [fetchData, data?.status]);

  // --- 3. EFFETS VISUELS ---

  const triggerVictory = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#fb7185', '#f472b6', '#e11d48'] // Couleurs Roses/Rouges
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#fb7185', '#f472b6', '#e11d48']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const copyLink = () => {
    if (!data) return;
    const link = `${window.location.origin}/v/${data.id}`;
    navigator.clipboard.writeText(link);
    alert("Lien copié ! Envoyez-le à votre Valentine.");
  };

  // KPI Calculations
  const totalViews = data?.logs?.filter(l => l.action === 'viewed').length || 0;
  const totalClicks = data?.logs?.filter(l => l.action.includes('click')).length || 0;
  
  let interestScore = 0;
  if (data) {
      interestScore += totalViews * 10;
      interestScore += totalClicks * 20;
      if (hasAnswered) interestScore = 100;
      if (interestScore > 100) interestScore = 100;
  }

  const getProfile = () => {
      if (hasAnswered) return { title: "CONQUISE 💘", desc: "Elle a dit OUI ! Préparez le champagne !", color: "text-rose-600" };
      if (isRejected) return { title: "DUR À CUIRE 💔", desc: "C'est un non... pour l'instant.", color: "text-gray-500" };
      if (interestScore > 50) return { title: "INTÉRESSÉE 🤔", desc: "Elle hésite, elle revient... C'est bon signe.", color: "text-rose-400" };
      if (totalViews > 0) return { title: "CURIEUSE 👀", desc: "Elle a ouvert l'enveloppe.", color: "text-blue-400" };
      return { title: "EN ATTENTE ⏳", desc: "Le message n'a pas encore été ouvert.", color: "text-gray-400" };
  };
  const profile = getProfile();

  // --- RENDU ---

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <Heart className="text-rose-400 animate-pulse mx-auto" size={64} fill="currentColor" />
            <Loader2 className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" size={24} />
          </div>
          <p className="mt-4 text-rose-800 font-serif text-lg">Connexion au cœur de la cible...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center border border-pink-100">
          <Ban className="mx-auto text-red-400 mb-4" size={64} />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Lien Expiré</h1>
          <p className="text-gray-500 mb-6">Ce rapport d'espionnage n'est plus accessible.</p>
          <button onClick={() => navigate('/')} className="px-8 py-3 bg-rose-500 text-white font-bold rounded-full hover:bg-rose-600 transition-all shadow-lg hover:shadow-rose-300/50">
            Retour à l'amour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 font-sans text-slate-700 pb-20">
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none opacity-40" 
           style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(253, 164, 175, 0.3) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(244, 114, 182, 0.3) 0%, transparent 40%)' }}>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        
        {/* Header */}
        <header className="mb-10 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-2 font-serif">
                    Rapport Secret 🕵️‍♂️
                </h1>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm text-gray-500">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-sm border ${connectionStatus === 'connected' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                        <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                        {connectionStatus === 'connected' ? 'EN LIGNE' : 'CONNEXION...'}
                    </span>
                    <span>Dossier #{id.slice(0, 6)}</span>
                </div>
            </div>
            
            {/* Bouton Upgrade (Si Basic) */}
            {isBasicPlan && (
                <a href="https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02" target="_blank" rel="noreferrer" 
                   className="group flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full font-bold text-white shadow-lg hover:shadow-orange-300/50 hover:scale-105 transition-all">
                    <LockKeyhole size={18} />
                    <span>Tout voir (1€)</span>
                </a>
            )}
        </header>

        {/* STATUS VITAL (Toujours visible) */}
        <div className="mb-8">
            <div className={`relative overflow-hidden rounded-3xl p-8 border shadow-xl transition-all duration-500
                ${hasAnswered 
                    ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white border-rose-400 shadow-rose-300/50' 
                    : 'bg-white border-pink-100 shadow-lg'
                }`}>
                
                {/* Confetti Decoration if Yes */}
                {hasAnswered && <div className="absolute top-0 right-0 p-10 opacity-20"><Heart size={200} fill="currentColor" /></div>}

                <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                    <div className="flex items-center gap-6">
                        <div className={`p-5 rounded-full shadow-inner ${hasAnswered ? 'bg-white/20 text-white' : 'bg-pink-50 text-rose-500'}`}>
                            {hasAnswered ? <PartyPopper size={48} /> : isRejected ? <Ban size={48} /> : <Loader2 size={48} className="animate-spin-slow" />}
                        </div>
                        <div className="text-center md:text-left">
                            <h2 className={`text-sm font-bold uppercase tracking-widest mb-1 ${hasAnswered ? 'text-rose-100' : 'text-gray-400'}`}>État actuel</h2>
                            <div className={`text-3xl md:text-5xl font-black font-serif ${hasAnswered ? 'text-white' : 'text-gray-800'}`}>
                                {hasAnswered 
                                    ? "ELLE A DIT OUI ! 💖"
                                    : isRejected 
                                        ? "REFUSÉ 💔"
                                        : "EN ATTENTE..."
                                }
                            </div>
                        </div>
                    </div>
                    
                    {/* Lien Partage */}
                    <div className={`flex flex-col gap-2 w-full md:w-auto p-4 rounded-2xl ${hasAnswered ? 'bg-white/10 border border-white/20' : 'bg-gray-50 border border-gray-100'}`}>
                        <p className={`text-xs uppercase font-bold flex items-center gap-2 ${hasAnswered ? 'text-rose-100' : 'text-gray-400'}`}>
                            <Sparkles size={12} /> Lien Unique
                        </p>
                        <div className="flex gap-2">
                            <code className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono truncate ${hasAnswered ? 'bg-black/20 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                                {`${window.location.origin}/v/${id}`}
                            </code>
                            <button onClick={copyLink} className={`p-2 rounded-lg transition-colors ${hasAnswered ? 'hover:bg-white/20 text-white' : 'hover:bg-pink-100 text-rose-500 bg-white shadow-sm'}`}>
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* GAUCHE : Logs */}
            <div className="lg:col-span-2">
                <div className="relative group h-full">
                    <div className={`bg-white/80 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-xl h-full flex flex-col ${areDetailsLocked ? 'blur-[2px] opacity-60 pointer-events-none select-none' : ''}`}>
                        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                                <Clock size={20} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">Activité en direct</h3>
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-2 scrollbar-hide">
                            {!data?.logs || data.logs.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <p className="text-gray-400">Rien à signaler pour le moment... 💤</p>
                                </div>
                            ) : (
                                data.logs.slice().reverse().map((log, index) => (
                                    <div key={index} className="flex items-center gap-4 p-4 bg-white border border-gray-50 shadow-sm rounded-2xl hover:shadow-md transition-shadow">
                                        <div className="shrink-0">
                                            {log.action === 'viewed' && <div className="p-2 bg-blue-50 text-blue-500 rounded-full"><Eye size={18} /></div>}
                                            {log.action === 'clicked_yes' && <div className="p-2 bg-green-50 text-green-500 rounded-full"><HeartHandshake size={18} /></div>}
                                            {log.action === 'clicked_no' && <div className="p-2 bg-red-50 text-red-500 rounded-full"><Ban size={18} /></div>}
                                            {log.action.includes('music') && <div className="p-2 bg-yellow-50 text-yellow-500 rounded-full"><Sparkles size={18} /></div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-700">
                                                {log.action === 'viewed' && "A ouvert l'invitation"}
                                                {log.action === 'clicked_yes' && "A cliqué sur OUI !"}
                                                {log.action === 'clicked_no' && "A hésité (Clic Non)"}
                                                {log.action === 'music_started' && "Écoute la musique"}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
                                                    {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                                <span className="text-xs text-gray-400 truncate max-w-[100px]">
                                                    IP: {log.ip || '???'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* LOCK OVERLAY */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 rounded-3xl overflow-hidden">
                            <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl text-center shadow-2xl max-w-sm border border-amber-100">
                                <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-500">
                                    <Lock size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">Détails Privés</h3>
                                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                                    Pour voir l'heure exacte des clics et l'adresse IP de votre Valentine, passez au mode Espion Pro.
                                </p>
                                <a href="https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02" target="_blank" rel="noreferrer" 
                                   className="block w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-200 transition-all transform hover:scale-105">
                                    Débloquer (1€)
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* DROITE : Stats & Analyse */}
            <div className="space-y-6">
                
                {/* Carte Analyse */}
                <div className="relative">
                    <div className={`bg-white/80 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-xl ${areDetailsLocked ? 'blur-[2px] opacity-60' : ''}`}>
                        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                            <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
                                <Shield size={20} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">IA de Cupidon</h3>
                        </div>
                        
                        <div className="space-y-6">
                            {/* Jauge */}
                            <div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                                    <span>Niveau d'intérêt</span>
                                    <span className="text-rose-500">{Math.round(interestScore)}%</span>
                                </div>
                                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-rose-300 to-rose-500 rounded-full transition-all duration-1000 ease-out" style={{width: `${interestScore}%`}}></div>
                                </div>
                            </div>
                            
                            <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                                <h4 className={`font-serif text-lg font-bold mb-1 ${profile.color}`}>{profile.title}</h4>
                                <p className="text-sm text-gray-600 italic">
                                    "{profile.desc}"
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                                    <div className="text-2xl font-black text-gray-800">{totalViews}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-400">Ouvertures</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                                    <div className="text-2xl font-black text-gray-800">{totalClicks}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-400">Interactions</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Blocage Stats (Si Basic) */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 z-20 cursor-not-allowed"></div>
                    )}
                </div>

                {/* Support */}
                <div className="bg-white/50 border border-white rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">Besoin d'aide ?</p>
                    <a href="mailto:support@yesoryes.com" className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:underline">
                        Contacter l'Agence
                    </a>
                </div>

            </div>
        </div>
        
         <footer className="mt-12 text-center">
            <button 
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-rose-500 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
            >
                ← Fermer le dossier
            </button>
        </footer>
      </div>
    </div>
  );
};

export default SpyDashboard;