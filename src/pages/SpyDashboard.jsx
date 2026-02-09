import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, 
  LockKeyhole, Loader2, Ban, Eye, PartyPopper, Lock, Sparkles, 
  RefreshCw, TrendingUp, Gem 
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
  
  const consecutiveErrors = useRef(0);
  const prevDataRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const pageVisibleRef = useRef(true);

  // --- LOGIQUE MÉTIER ---
  const isBasicPlan = data && data.plan === 'basic';
  const hasAnswered = data && data.status === 'accepted';
  const isRejected = data && data.status === 'rejected';
  const areDetailsLocked = isBasicPlan; 

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
        if (consecutiveErrors.current > 3) setAccessDenied(true);
      } else {
        consecutiveErrors.current = 0;
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

  useEffect(() => {
    fetchData();
    const handleVisibilityChange = () => {
      pageVisibleRef.current = !document.hidden;
      if (!document.hidden) fetchData(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalDuration = (data && data.status === 'pending') ? 5000 : 60000;
    pollingIntervalRef.current = setInterval(() => {
      if (pageVisibleRef.current) fetchData(true);
    }, intervalDuration);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [fetchData, data?.status]);

  const triggerVictory = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#D4AF37', '#F4C2C2', '#800020'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#D4AF37', '#F4C2C2', '#800020'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  };

  const copyLink = () => {
    if (!data) return;
    const link = `${window.location.origin}/v/${data.id}`;
    navigator.clipboard.writeText(link);
  };

  // KPIs et Profil
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
      if (hasAnswered) return { title: "CIBLE CONQUISE", desc: "Elle a dit OUI. Sortez le champagne." };
      if (isRejected) return { title: "CŒUR DE GLACE", desc: "Mission échouée... pour l'instant." };
      if (interestScore > 50) return { title: "INTÉRESSÉE", desc: "Elle hésite, elle revient... C'est bon signe." };
      if (totalViews > 0) return { title: "CURIEUSE", desc: "Elle a ouvert l'enveloppe." };
      return { title: "EN ATTENTE", desc: "Le corbeau n'est pas encore arrivé." };
  };
  const profile = getProfile();


  // --- RENDU DESIGN "RUBY DARK" ---

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-ruby-dark flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-ruby-DEFAULT/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        </div>
        <Loader2 className="w-12 h-12 text-rose-gold animate-spin mb-4" />
        <p className="text-rose-pale font-serif italic animate-pulse">Infiltration du système...</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-ruby-dark flex items-center justify-center p-6">
         <div className="max-w-md w-full bg-ruby-light/10 border border-rose-gold/30 p-8 rounded-xl backdrop-blur-md text-center shadow-2xl">
            <Ban className="mx-auto text-rose-gold mb-6" size={48} />
            <h1 className="text-3xl font-script text-rose-pale mb-2">Accès Interdit</h1>
            <p className="text-cream/60 font-serif mb-8">Ce dossier est classifié ou n'existe plus.</p>
            <button onClick={() => navigate('/')} className="px-8 py-3 rounded-lg text-xs uppercase tracking-widest text-cream border border-rose-gold/50 hover:bg-rose-gold/10 transition-all font-bold">
                Retour
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ruby-dark text-cream font-sans p-4 md:p-8 relative overflow-x-hidden">
      
      {/* Background Effects (Identiques Home) */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-ruby-DEFAULT/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#4a0a18]/40 rounded-full blur-[150px]"></div>
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        
        {/* Header */}
        <header className="mb-12 text-center md:text-left flex flex-col md:flex-row justify-between items-end gap-6 border-b border-rose-gold/20 pb-6">
            <div>
                <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
                    <Shield className="text-rose-gold w-5 h-5" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-rose-gold font-serif">Rapport Confidentiel</span>
                </div>
                <h1 className="text-5xl md:text-6xl font-script text-rose-pale drop-shadow-lg">
                    Dossier #{id.slice(0, 4)}
                </h1>
            </div>

            <div className="flex flex-col items-center md:items-end gap-2">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${connectionStatus === 'connected' ? 'border-green-900/50 bg-green-900/20 text-green-400' : 'border-rose-gold/30 bg-rose-gold/10 text-rose-gold'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-rose-gold'}`}></div>
                    <span className="text-[10px] uppercase tracking-widest font-bold">{connectionStatus === 'connected' ? 'En Direct' : 'Connexion...'}</span>
                </div>
                <p className="text-[10px] text-rose-gold/50 font-mono">Dernière MàJ: {lastRefreshed.toLocaleTimeString()}</p>
            </div>
        </header>

        {/* --- STATUS PRINCIPAL --- */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
            {/* Carte État (Large) */}
            <div className="md:col-span-8 relative group">
                <div className={`h-full p-8 rounded-xl border backdrop-blur-md transition-all duration-500 flex flex-col justify-center relative overflow-hidden
                    ${hasAnswered 
                        ? 'bg-gradient-to-br from-green-900/80 to-black border-green-500/30 shadow-[0_0_30px_rgba(20,83,45,0.4)]' 
                        : isRejected 
                            ? 'bg-gradient-to-br from-red-950/80 to-black border-red-500/30'
                            : 'bg-ruby-light/10 border-rose-gold/30'
                    }`}>
                    
                    {/* Background Shine */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div className="flex items-center gap-6 relative z-10">
                         <div className={`p-4 rounded-full border ${hasAnswered ? 'border-green-500/50 text-green-400' : 'border-rose-gold/50 text-rose-gold'}`}>
                            {hasAnswered ? <PartyPopper size={40} /> : isRejected ? <Ban size={40} /> : <Loader2 size={40} className="animate-spin-slow" />}
                        </div>
                        <div>
                            <h2 className="text-xs font-serif text-rose-pale/60 uppercase tracking-widest mb-1">Statut Actuel</h2>
                            <div className="text-3xl md:text-5xl font-serif text-cream">
                                {hasAnswered 
                                    ? <span className="text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">ELLE A DIT OUI !</span>
                                    : isRejected 
                                        ? <span className="text-red-400">REFUSÉ...</span>
                                        : "EN ATTENTE..."
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Carte Lien (Petite) */}
            <div className="md:col-span-4 bg-black/40 border border-rose-gold/20 rounded-xl p-6 flex flex-col justify-center">
                <p className="text-[10px] text-rose-gold uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Sparkles size={12} /> Cible
                </p>
                <code className="block w-full bg-black/50 border border-rose-gold/10 p-3 rounded text-rose-pale/80 text-xs font-mono truncate mb-3">
                    {`${window.location.origin}/v/${id}`}
                </code>
                <button 
                    onClick={copyLink}
                    className="w-full py-2 bg-rose-gold/10 hover:bg-rose-gold/20 text-rose-gold text-xs uppercase tracking-widest border border-rose-gold/30 rounded transition-all flex items-center justify-center gap-2 font-bold"
                >
                    <RefreshCw size={14} /> Copier le lien
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* --- COLONNE GAUCHE : LOGS --- */}
            <div className="lg:col-span-2">
                <div className="bg-ruby-light/5 border border-rose-gold/20 rounded-xl overflow-hidden relative min-h-[400px]">
                    {/* Header Logs */}
                    <div className="p-4 border-b border-rose-gold/10 bg-black/20 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-rose-gold" />
                            <span className="text-xs uppercase tracking-widest text-cream/80 font-serif">Mouchard d'Activité</span>
                        </div>
                        {isBasicPlan && <Lock size={14} className="text-purple-400" />}
                    </div>

                    {/* Liste Logs */}
                    <div className={`p-4 space-y-2 max-h-[500px] overflow-y-auto ${areDetailsLocked ? 'blur-sm opacity-30 select-none pointer-events-none' : ''}`}>
                         {!data?.logs || data.logs.length === 0 ? (
                             <div className="text-center py-10 text-rose-gold/30 italic font-serif">
                                 En attente de la première interaction...
                             </div>
                         ) : (
                             data.logs.slice().reverse().map((log, index) => (
                                <div key={index} className="flex items-center gap-4 p-3 rounded bg-white/5 border border-white/5 hover:border-rose-gold/30 transition-all">
                                    <div className="shrink-0">
                                        {log.action === 'viewed' && <Eye size={18} className="text-blue-300" />}
                                        {log.action === 'clicked_yes' && <HeartHandshake size={18} className="text-green-400" />}
                                        {log.action === 'clicked_no' && <Ban size={18} className="text-red-400" />}
                                        {log.action.includes('music') && <Sparkles size={18} className="text-amber-300" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-rose-pale font-serif">
                                            {log.action === 'viewed' && "Ouverture de l'invitation"}
                                            {log.action === 'clicked_yes' && "Clic sur OUI"}
                                            {log.action === 'clicked_no' && "Clic sur NON"}
                                            {log.action === 'music_started' && "Musique lancée"}
                                        </p>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[10px] text-rose-gold/60 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            <span className="text-[10px] text-rose-gold/40 font-mono">IP: {log.ip || '---'}</span>
                                        </div>
                                    </div>
                                </div>
                             ))
                         )}
                    </div>

                    {/* --- LOCK SCREEN CORRIGÉ (MYSTERY PURPLE) --- */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[4px]">
                            <div className="bg-[#1a0510] border border-purple-500/30 p-8 rounded-2xl text-center shadow-[0_0_40px_rgba(147,51,234,0.2)] max-w-sm mx-4 transform hover:scale-105 transition-transform duration-500">
                                
                                <div className="bg-purple-900/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                                    <Gem className="text-purple-400 animate-pulse" size={28} />
                                </div>

                                <h3 className="text-xl font-script text-white mb-2">Données Classifiées</h3>
                                <p className="text-xs text-rose-pale/70 mb-6 leading-relaxed font-serif">
                                    Débloquez le <strong>Mode Espion Pro</strong> pour révéler les heures exactes, les adresses IP et les hésitations.
                                </p>
                                
                                <a href="https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02" target="_blank" rel="noreferrer" 
                                   className="group relative block w-full py-3.5 bg-gradient-to-r from-purple-700 to-pink-600 hover:from-purple-600 hover:to-pink-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-purple-900/50 overflow-hidden">
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        <LockKeyhole size={14} /> Débloquer (1€)
                                    </span>
                                    {/* Shine effect */}
                                    <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:left-full transition-all duration-700 ease-in-out"></div>
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- COLONNE DROITE : IA & STATS --- */}
            <div className="space-y-6">
                
                {/* Carte IA */}
                <div className="bg-ruby-light/5 border border-rose-gold/20 rounded-xl p-6 relative">
                    <div className={`space-y-6 ${areDetailsLocked ? 'blur-sm opacity-50' : ''}`}>
                        <div className="flex items-center gap-2 mb-4">
                             <TrendingUp size={16} className="text-rose-gold" />
                             <h3 className="text-xs uppercase tracking-widest text-cream/80 font-serif">Analyse I.A.</h3>
                        </div>

                        {/* Jauge */}
                        <div>
                            <div className="flex justify-between text-[10px] uppercase tracking-widest text-rose-pale/60 mb-2">
                                <span>Intérêt</span>
                                <span>{Math.round(interestScore)}%</span>
                            </div>
                            <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden border border-rose-gold/10">
                                <div className="h-full bg-gradient-to-r from-rose-gold to-rose-pale transition-all duration-1000 shadow-[0_0_10px_rgba(225,29,72,0.5)]" style={{width: `${interestScore}%`}}></div>
                            </div>
                        </div>

                        {/* Profil Textuel */}
                        <div className="bg-black/20 p-4 rounded-lg border-l-2 border-rose-gold">
                             <h4 className="text-rose-pale font-script text-2xl mb-1">{profile.title}</h4>
                             <p className="text-xs text-cream/70 italic font-serif">{profile.desc}</p>
                        </div>

                        {/* Compteurs */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="text-center p-3 bg-white/5 rounded border border-white/5">
                                <div className="text-2xl font-serif text-cream">{totalViews}</div>
                                <div className="text-[9px] uppercase tracking-widest text-rose-gold/50">Vues</div>
                            </div>
                            <div className="text-center p-3 bg-white/5 rounded border border-white/5">
                                <div className="text-2xl font-serif text-cream">{totalClicks}</div>
                                <div className="text-[9px] uppercase tracking-widest text-rose-gold/50">Clics</div>
                            </div>
                        </div>
                    </div>

                    {/* Blocage Stats si Basic (Invisible clickable overlay) */}
                    {areDetailsLocked && <div className="absolute inset-0 z-30 cursor-not-allowed"></div>}
                </div>

                {/* Footer Support */}
                <div className="text-center space-y-4 pt-4 border-t border-rose-gold/10">
                    <a href="mailto:contact@yesoryes.com" className="text-[10px] uppercase tracking-widest text-rose-gold/50 hover:text-rose-gold transition-colors block">
                        Support Technique
                    </a>
                    <button 
                        onClick={() => navigate('/')}
                        className="text-[10px] uppercase tracking-widest text-cream/30 hover:text-cream transition-colors"
                    >
                        Se déconnecter
                    </button>
                </div>

            </div>
        </div>

      </div>
    </div>
  );
};

export default SpyDashboard;