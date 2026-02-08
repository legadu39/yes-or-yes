import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { 
  Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, 
  LockKeyhole, Loader2, Ban, Eye, PartyPopper, Lock, Sparkles, 
  AlertTriangle, RefreshCw, Timer 
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

  // --- INTELLIGENCE : DÉTECTION DU PLAN & STATUT ---
  // Le plan 'basic' bloque les détails (Logs, Carte), mais PAS le résultat final (Oui/Non)
  const isBasicPlan = data && data.plan === 'basic';
  const hasAnswered = data && data.status === 'accepted';
  const isRejected = data && data.status === 'rejected';

  // Si c'est basic, on "lock" l'accès aux preuves détaillées, mais pas au dashboard global
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
            setAccessDenied(true); // Probablement token invalide après plusieurs essais
        }
      } else {
        consecutiveErrors.current = 0;
        
        // DÉTECTION DE CHANGEMENT D'ÉTAT (Preuve d'Intelligence)
        // Si le statut passe de 'pending' à 'accepted' pendant qu'on regarde
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
    // Premier chargement
    fetchData();

    // Configuration de la visibilité (Réveil Intelligent)
    const handleVisibilityChange = () => {
      pageVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        console.log("👁️ Utilisateur de retour : Rafraîchissement immédiat");
        fetchData(true); // Refresh silencieux
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Algorithme de Polling Adaptatif
    // Si pas de réponse : Check toutes les 5s (pression haute)
    // Si réponse obtenue : Check toutes les 60s (juste pour updates mineures)
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
  }, [fetchData, data?.status]); // Recrée l'intervalle si le statut change

  // --- 3. EFFETS VISUELS & HELPERS ---

  const triggerVictory = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#D24D57', '#E0B0B6', '#FFD700']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#D24D57', '#E0B0B6', '#FFD700']
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

  const getHesitationText = (ms) => {
    if (!ms && ms !== 0) return "En cours...";
    if (ms < 1500) return "⚡️ Coup de foudre";
    if (ms < 5000) return "🤔 Légère réflexion";
    if (ms < 10000) return "😰 Hésitation marquée";
    return "😱 Doute existentiel";
  };

  // --- RENDU ---

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-ruby-dark flex items-center justify-center text-rose-pale">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-rose-gold" size={48} />
          <p className="font-serif animate-pulse">Établissement de la liaison sécurisée...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-ruby-dark flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/40 border border-ruby-light/30 p-8 rounded-xl backdrop-blur-md text-center">
          <Ban className="mx-auto text-ruby-light mb-4" size={64} />
          <h1 className="text-2xl font-serif text-rose-pale mb-2">Accès Refusé</h1>
          <p className="text-rose-pale/60 mb-6">Ce lien de surveillance est invalide ou a expiré.</p>
          <button onClick={() => navigate('/')} className="px-6 py-2 bg-rose-gold text-ruby-dark font-bold rounded-full hover:bg-white transition-colors">
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  // Calculs pour les KPIs
  const totalViews = data?.logs?.filter(l => l.action === 'viewed').length || 0;
  const totalClicks = data?.logs?.filter(l => l.action.includes('click')).length || 0;
  // Récupération du temps d'hésitation (si disponible dans le rapport)
  const hesitationTime = data?.hesitation_time || 0;
  
  // Score d'intérêt (Heuristique simple)
  let interestScore = 0;
  if (data) {
      interestScore += totalViews * 10;
      interestScore += totalClicks * 20;
      if (hasAnswered) interestScore = 100;
      if (interestScore > 100) interestScore = 100;
  }

  // Profil psychologique
  const getProfile = () => {
      if (hasAnswered) return { title: "CONQUISE", desc: "Elle a succombé. Préparez votre soirée." };
      if (isRejected) return { title: "CŒUR DE PIERRE", desc: "Mission échouée. On ne gagne pas à tous les coups." };
      if (interestScore > 50) return { title: "INTÉRESSÉE", desc: "Elle hésite, revient, analyse... C'est bon signe." };
      if (totalViews > 0) return { title: "CURIEUSE", desc: "Elle a ouvert, mais reste prudente." };
      return { title: "EN ATTENTE", desc: "Aucune interaction détectée pour le moment." };
  };
  const profile = getProfile();

  return (
    <div className="min-h-screen bg-fixed bg-cover bg-center relative font-sans text-rose-pale overflow-x-hidden"
         style={{ backgroundImage: `url('https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=2940&auto=format&fit=crop')` }}>
      
      {/* Overlay Sombre */}
      <div className="absolute inset-0 bg-ruby-dark/90 backdrop-blur-sm"></div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        
        {/* Header de Statut */}
        <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-rose-gold/20 pb-6">
            <div>
                <h1 className="text-3xl md:text-4xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-rose-gold to-rose-pale mb-2">
                    Rapport de Surveillance
                </h1>
                <div className="flex items-center gap-2 text-sm text-rose-pale/60">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${connectionStatus === 'connected' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                        {connectionStatus === 'connected' ? 'LIVE' : 'RECONNECTING'}
                    </span>
                    <span className="hidden md:inline">• ID: {id}</span>
                    <span>• MàJ: {lastRefreshed.toLocaleTimeString()}</span>
                </div>
            </div>
            
            {/* Bouton Upgrade si Basic */}
            {isBasicPlan && (
                <a href="https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02" target="_blank" rel="noreferrer" 
                   className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-yellow-600 rounded-lg font-bold text-white shadow-lg hover:scale-105 transition-transform">
                    <LockKeyhole size={18} />
                    <span>Débloquer Tout (1€)</span>
                    <Sparkles size={16} className="group-hover:animate-spin" />
                </a>
            )}
        </header>

        {/* --- ZONE PRINCIPALE : STATUT VITAL --- 
            CETTE ZONE EST TOUJOURS VISIBLE, MÊME EN BASIC
        */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            
            {/* CARTE 1 : Statut Global */}
            <div className={`col-span-1 md:col-span-3 p-6 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-500
                ${hasAnswered 
                    ? 'bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-green-500/50 shadow-[0_0_30px_rgba(16,185,129,0.2)]' 
                    : isRejected
                        ? 'bg-gradient-to-br from-gray-900/80 to-black border-gray-600/50'
                        : 'bg-black/40 border-rose-gold/20'
                }`}>
                
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className={`p-4 rounded-full border-2 ${hasAnswered ? 'border-green-400 bg-green-500/20 text-green-400' : 'border-rose-gold/30 bg-rose-gold/10 text-rose-gold'}`}>
                            {hasAnswered ? <PartyPopper size={48} /> : isRejected ? <Ban size={48} /> : <Loader2 size={48} className="animate-spin-slow" />}
                        </div>
                        <div>
                            <h2 className="text-xl text-rose-pale/60 font-serif tracking-widest uppercase mb-1">Statut de la mission</h2>
                            <div className="text-4xl md:text-5xl font-bold text-white font-serif">
                                {hasAnswered 
                                    ? <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-emerald-500">ELLE A DIT OUI !</span>
                                    : isRejected 
                                        ? "REFUS CATÉGORIQUE"
                                        : "EN ATTENTE..."
                                }
                            </div>
                            {hasAnswered && isBasicPlan && (
                                <p className="mt-2 text-green-300/80 text-sm flex items-center gap-2">
                                    <CheckCircle2 size={14} /> Réponse confirmée. Bravo soldat.
                                </p>
                            )}
                        </div>
                    </div>
                    
                    {/* Lien à partager (Toujours accessible) */}
                    <div className="w-full md:w-auto bg-black/50 p-4 rounded-lg border border-white/10 max-w-sm">
                        <p className="text-xs text-rose-pale/50 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Sparkles size={12} className="text-yellow-500" />
                            Lien de la cible
                        </p>
                        <div className="flex gap-2">
                            <code className="flex-1 bg-black/50 px-3 py-2 rounded text-sm text-rose-gold font-mono truncate border border-rose-gold/10">
                                {`${window.location.origin}/v/${id}`}
                            </code>
                            <button onClick={copyLink} className="p-2 hover:bg-rose-gold/20 rounded-md transition-colors text-rose-gold">
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* COLONNE GAUCHE : Logs Détaillés */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* Section Logs - FLOUTÉE SI BASIC */}
                <div className="relative group">
                    <div className={`bg-black/30 border border-rose-gold/10 rounded-2xl p-6 backdrop-blur-sm overflow-hidden ${areDetailsLocked ? 'blur-sm select-none opacity-50' : ''}`}>
                        <div className="flex items-center gap-3 mb-6">
                            <Clock className="text-rose-gold" size={20} />
                            <h3 className="text-xl font-serif">Journal d'Activité</h3>
                        </div>

                        <div className="space-y-4">
                            {!data?.logs || data.logs.length === 0 ? (
                                <div className="text-center py-8 text-rose-pale/30 italic border border-dashed border-rose-pale/10 rounded-lg">
                                    Aucune activité détectée pour l'instant...
                                </div>
                            ) : (
                                data.logs.slice().reverse().map((log, index) => (
                                    <div key={index} className="flex items-start gap-4 p-3 hover:bg-white/5 rounded-lg transition-colors border-l-2 border-rose-gold/20">
                                        <div className="mt-1">
                                            {log.action === 'viewed' && <Eye size={16} className="text-blue-400" />}
                                            {log.action === 'clicked_yes' && <HeartHandshake size={16} className="text-green-400" />}
                                            {log.action === 'clicked_no' && <Ban size={16} className="text-red-400" />}
                                            {log.action.includes('music') && <Sparkles size={16} className="text-yellow-400" />}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-rose-pale">
                                                {log.action === 'viewed' && "A ouvert l'invitation"}
                                                {log.action === 'clicked_yes' && "A cliqué sur OUI"}
                                                {log.action === 'clicked_no' && "A essayé de fuir (Bouton Non)"}
                                                {log.action === 'music_started' && "A activé la musique"}
                                            </p>
                                            <p className="text-xs text-rose-pale/40 font-mono mt-1">
                                                {new Date(log.timestamp).toLocaleString()} • IP: {log.ip || 'Masquée'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* OVERLAY DE BLOCAGE (Si Basic) */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <div className="bg-black/80 border border-amber-500/30 p-8 rounded-2xl text-center shadow-2xl max-w-sm backdrop-blur-xl transform transition-transform hover:scale-105">
                                <Lock className="mx-auto text-amber-500 mb-4" size={48} />
                                <h3 className="text-xl font-bold text-white mb-2">Preuves Classifiées</h3>
                                <p className="text-rose-pale/70 text-sm mb-6">
                                    Vous avez le statut de la mission (OUI/NON), mais les détails techniques (Heures précises, IP, Tentatives de fuite) sont réservés aux agents SPY.
                                </p>
                                <a href="https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02" target="_blank" rel="noreferrer" 
                                   className="inline-block w-full py-3 bg-gradient-to-r from-amber-600 to-yellow-600 rounded-lg font-bold text-white shadow-lg hover:brightness-110 transition-all">
                                    Débloquer pour 1€
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* COLONNE DROITE : Analyse IA & Profil */}
            <div className="space-y-6">
                
                {/* Carte Profil - FLOUTÉE SI BASIC */}
                <div className="relative">
                    <div className={`bg-gradient-to-b from-ruby-light/10 to-black/40 border border-rose-gold/20 rounded-2xl p-6 ${areDetailsLocked ? 'blur-sm opacity-50' : ''}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="text-rose-gold" size={20} />
                            <h3 className="text-lg font-serif">Analyse Tactique</h3>
                        </div>
                        
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-xs uppercase tracking-widest text-rose-pale/60 mb-2">
                                    <span>Score d'Intérêt</span>
                                    <span>{Math.round(interestScore)}%</span>
                                </div>
                                <div className="w-full bg-ruby-dark/80 h-2 rounded-full overflow-hidden border border-rose-gold/10">
                                    <div className="h-full bg-gradient-to-r from-rose-gold to-ruby-light shadow-[0_0_10px_rgba(210,77,87,0.5)] transition-all duration-1000" style={{width: `${interestScore}%`}}></div>
                                </div>
                            </div>
                            
                            {/* --- NOUVEAU BLOC HÉSITATION (INJECTION CHIRURGICALE) --- */}
                            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="p-2 bg-rose-gold/20 rounded-full">
                                    <Timer className="w-5 h-5 text-rose-gold" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-rose-pale/40">Temps de Réaction</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-white">
                                            {(hesitationTime / 1000).toFixed(1)}s
                                        </span>
                                        <span className="text-xs text-rose-gold italic">
                                            {getHesitationText(hesitationTime)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* --- FIN BLOC --- */}

                            <div className="border-l-2 border-ruby-light pl-4 py-2 bg-ruby-light/5 rounded-r-lg">
                                <h4 className="text-rose-pale font-serif text-lg mb-1">{profile.title}</h4>
                                <p className="text-sm text-cream/80 font-light italic leading-relaxed">
                                    {profile.desc}
                                </p>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <div className="bg-black/40 p-3 rounded-lg border border-white/5 text-center">
                                    <div className="text-2xl font-bold text-white">{totalViews}</div>
                                    <div className="text-[10px] uppercase text-rose-pale/40">Vues</div>
                                </div>
                                <div className="bg-black/40 p-3 rounded-lg border border-white/5 text-center">
                                    <div className="text-2xl font-bold text-white">{totalClicks}</div>
                                    <div className="text-[10px] uppercase text-rose-pale/40">Clics</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* OVERLAY (Si Basic) - Copie simplifiée pour ne pas surcharger */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 z-10 cursor-not-allowed" title="Contenu réservé aux membres Spy"></div>
                    )}
                </div>

                {/* Section Support */}
                <div className="bg-rose-gold/5 border border-rose-gold/10 rounded-xl p-4 text-center">
                    <p className="text-xs text-rose-pale/60 mb-2">Un problème avec le rapport ?</p>
                    <a href="mailto:support@yesoryes.com" className="text-xs text-rose-gold hover:underline">Contacter le QG</a>
                </div>

            </div>
        </div>
        
         <footer className="mt-12 p-4 border-t border-rose-gold/10 text-center relative z-10">
            <button 
                onClick={() => navigate('/')}
                className="text-rose-gold/60 hover:text-rose-gold text-xs uppercase tracking-[0.2em] transition-colors"
            >
                Refermer le carnet
            </button>
        </footer>
      </div>
    </div>
  );
};

export default SpyDashboard;