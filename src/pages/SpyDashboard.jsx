import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, 
  LockKeyhole, Loader2, Ban, Eye, PartyPopper, Lock, Sparkles, 
  RefreshCw, TrendingUp, Fingerprint, ChevronRight, Key
} from 'lucide-react';
import confetti from 'canvas-confetti';

// LIEN STRIPE UPSELL (1€)
const STRIPE_UPSELL_LINK = "https://buy.stripe.com/9B614ma3YexJ7X82Ft6Vq03";

const SpyDashboard = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // INTELLIGENCE N°3 : Connexion au Cerveau Global (Context) pour la synchro d'état
  const { getSpyReport, verifyPaymentStatus, ownedInvitations } = useApp();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); 
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  
  // INTELLIGENCE N°2 : Mémoire de l'offre (Prix affiché cohérent)
  const [storedOfferPrice, setStoredOfferPrice] = useState('2.50€');

  const consecutiveErrors = useRef(0);
  const prevDataRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const pageVisibleRef = useRef(true);

  // --- LOGIQUE INTELLIGENTE D'ÉTAT (Fusion Optimiste) ---
  
  // 1. Détection de l'intention de succès via l'URL (Retour Stripe)
  const isPaymentSuccessUrl = searchParams.get('success') === 'true';

  // 2. Récupération de la connaissance locale (Context)
  // Si le contexte sait déjà qu'on est "spy", on l'utilise.
  const localKnowledge = ownedInvitations.find(i => i.id === id);
  const contextPlan = localKnowledge?.plan;

  // 3. Calcul du plan effectif (Priorité : URL Optimiste > Context > DB Fetch)
  const rawPlan = data?.plan || 'basic';
  const effectivePlan = isPaymentSuccessUrl ? 'spy' : (contextPlan === 'spy' ? 'spy' : rawPlan);

  const isBasicPlan = effectivePlan === 'basic';
  const hasAnswered = data && data.status === 'accepted';
  const isRejected = data && data.status === 'rejected';
  
  // Si on est "optimiste" (success=true), on déverrouille visuellement tout de suite
  const areDetailsLocked = isBasicPlan && !isPaymentSuccessUrl; 

  // --- PRÉPARATION DU LIEN UPSELL ---
  const token = searchParams.get('token');
  const compositeId = token ? `${id}___${token}` : id;
  const upsellUrl = `${STRIPE_UPSELL_LINK}?client_reference_id=${compositeId}`;

  // Initialisation : Vérifier si l'utilisateur avait vu l'offre 1€
  useEffect(() => {
    const memory = sessionStorage.getItem(`offer_seen_${id}`);
    if (memory === '1_euro') {
        setStoredOfferPrice('1€');
    }
  }, [id]);

  // Handler intelligent pour le clic Upsell
  const handleUpsellClick = () => {
      // On note dans le cerveau local qu'on a proposé 1€
      sessionStorage.setItem(`offer_seen_${id}`, '1_euro');
  };

  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    try {
      const currentToken = searchParams.get('token');
      if (!currentToken) {
          setAccessDenied(true);
          setLoading(false);
          return;
      }
      if (!isBackgroundRefresh) setLoading(true);

      // Si on revient de paiement, on force une vérif DB via le Context
      if (isPaymentSuccessUrl && !isBackgroundRefresh) {
         console.log("🚀 Retour paiement détecté : Forçage synchro immédiate.");
         await verifyPaymentStatus(id);
      }

      const result = await getSpyReport(id, currentToken);

      if (!result) {
        consecutiveErrors.current += 1;
        if (consecutiveErrors.current > 3) setAccessDenied(true);
      } else {
        consecutiveErrors.current = 0;
        
        // Détection Victoire (Pending -> Accepted)
        if (prevDataRef.current && prevDataRef.current.status === 'pending' && result.status === 'accepted') {
            triggerVictory();
        }

        // Si on passe de Basic à Spy (DB confirmée)
        if (prevDataRef.current && prevDataRef.current.plan === 'basic' && result.plan === 'spy') {
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
  }, [id, searchParams, getSpyReport, verifyPaymentStatus, isPaymentSuccessUrl]);

  useEffect(() => {
    fetchData();
    const handleVisibilityChange = () => {
      pageVisibleRef.current = !document.hidden;
      if (!document.hidden) fetchData(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Polling adaptatif
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

  const totalRefusals = data?.attempts || 0; 
  const totalViews = data?.logs?.filter(l => l.action === 'viewed').length || 0;
  
  let interestScore = 0;
  if (data) {
      interestScore += totalViews * 10;
      interestScore += totalRefusals * 5; 
      if (hasAnswered) interestScore = 100;
      if (interestScore > 100) interestScore = 100;
  }

  // --- UI RENDERING ---

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-ruby-dark flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
             <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-ruby-DEFAULT/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        </div>
        <div className="relative z-10 text-center">
            <Loader2 className="w-16 h-16 text-rose-gold animate-spin mx-auto mb-6" />
            <h2 className="text-4xl font-script text-rose-pale mb-2">Connexion...</h2>
            <p className="text-cream/60 font-serif italic">Infiltration du cœur de la cible</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-ruby-dark flex items-center justify-center p-6 relative">
         <div className="max-w-lg w-full bg-black/40 border border-rose-gold/30 p-10 rounded-3xl backdrop-blur-xl text-center shadow-2xl relative z-10">
            <Ban className="mx-auto text-rose-gold/80 mb-6" size={64} />
            <h1 className="text-5xl font-script text-rose-pale mb-4">Accès Interdit</h1>
            <p className="text-cream/70 font-serif mb-8 text-lg leading-relaxed">
                Ce dossier est classifié ou le lien a expiré.
            </p>
            <button onClick={() => navigate('/')} className="px-8 py-3 bg-rose-gold/10 hover:bg-rose-gold/20 text-rose-gold border border-rose-gold/50 rounded-full transition-all uppercase tracking-widest text-xs font-bold">
                Retour à la base
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ruby-dark text-cream font-sans relative overflow-x-hidden selection:bg-rose-gold/30 selection:text-white">
      
      {/* 1. FOND D'AMBIANCE */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-ruby-DEFAULT/15 rounded-full blur-[150px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#4a0a18]/60 rounded-full blur-[150px]"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        
        {/* 2. HEADER */}
        <header className="mb-12 flex flex-col md:flex-row justify-between items-end gap-6 border-b border-rose-gold/10 pb-8">
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="bg-rose-gold/10 p-1.5 rounded text-rose-gold border border-rose-gold/20">
                        <Fingerprint size={16} />
                    </div>
                    <span className="text-xs uppercase tracking-[0.3em] text-rose-gold/80 font-serif font-bold">
                        Dossier Confidentiel
                    </span>
                    {/* Badge Mode Spy Actif */}
                    {!areDetailsLocked && (
                        <span className="ml-2 bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-wider">
                            Mode Espion Activé
                        </span>
                    )}
                </div>
                <h1 className="text-6xl md:text-7xl font-script text-transparent bg-clip-text bg-gradient-to-r from-rose-pale via-cream to-rose-gold drop-shadow-md">
                    Rapport Cupidon
                </h1>
            </div>

            <div className="flex flex-col items-end gap-2 text-right">
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border backdrop-blur-sm ${connectionStatus === 'connected' ? 'border-emerald-500/30 bg-emerald-900/10 text-emerald-400' : 'border-rose-gold/30 bg-rose-gold/10 text-rose-gold'}`}>
                    <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-gold'}`}></span>
                    <span className="text-[10px] uppercase tracking-widest font-bold">
                        {connectionStatus === 'connected' ? 'Système en Ligne' : 'Connexion...'}
                    </span>
                </div>
                <p className="text-[10px] text-rose-gold/40 font-mono flex items-center gap-2">
                    <Clock size={10} /> Dernière mise à jour : {lastRefreshed.toLocaleTimeString()}
                </p>
            </div>
        </header>

        {/* 3. GRID PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* A. COLONNE GAUCHE (Status & Analyse) */}
            <div className="lg:col-span-4 space-y-6">
                
                {/* Carte STATUS */}
                <div className={`relative overflow-hidden rounded-3xl p-8 border backdrop-blur-xl transition-all duration-700 group
                    ${hasAnswered 
                        ? 'bg-gradient-to-br from-ruby-dark via-[#4a0a18] to-black border-rose-gold shadow-[0_0_40px_rgba(225,29,72,0.3)]' 
                        : isRejected 
                            ? 'bg-gradient-to-br from-red-950/40 to-black border-red-500/30'
                            : 'bg-gradient-to-br from-white/5 to-black/40 border-rose-gold/20'
                    }`}>
                    
                    {hasAnswered && <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay animate-pulse-slow"></div>}

                    <div className="relative z-10 flex flex-col items-center text-center">
                        <div className={`mb-6 p-6 rounded-full border-2 shadow-inner ${hasAnswered ? 'bg-ruby-light/10 border-rose-gold text-rose-gold animate-bounce-slow' : 'bg-rose-gold/5 border-rose-gold/20 text-rose-gold'}`}>
                            {hasAnswered ? <HeartHandshake size={48} /> : isRejected ? <Ban size={48} /> : <Loader2 size={48} className="animate-spin-slow" />}
                        </div>
                        
                        <h2 className="text-xs font-serif text-rose-pale/50 uppercase tracking-[0.2em] mb-3">Statut de la Cible</h2>
                        
                        <div className="text-4xl md:text-5xl font-script text-cream leading-tight mb-2">
                            {hasAnswered 
                                ? <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-gold via-cream to-rose-gold drop-shadow-lg">Elle a dit Oui !</span>
                                : isRejected 
                                    ? <span className="text-red-300">Refusé...</span>
                                    : "En Attente..."
                            }
                        </div>
                        
                        <div className="w-full mt-8">
                            <div className="flex justify-between text-[10px] uppercase tracking-widest text-rose-gold/60 mb-2">
                                <span>Probabilité de Succès</span>
                                <span>{Math.round(interestScore)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                                <div 
                                    className={`h-full transition-all duration-1000 ease-out shadow-[0_0_15px_currentColor] ${interestScore > 80 ? 'bg-rose-gold text-white' : 'bg-ruby-light/50 text-ruby-light'}`} 
                                    style={{width: `${interestScore}%`}}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Carte LIEN */}
                <div className="bg-black/20 border border-rose-gold/10 rounded-2xl p-6 backdrop-blur-md">
                     <p className="text-[10px] text-rose-gold/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles size={12} /> Lien Unique
                    </p>
                    <div className="flex gap-2">
                        <div className="flex-1 bg-black/40 border border-rose-gold/10 rounded-lg px-3 py-2 text-rose-pale/80 text-xs font-mono truncate select-all">
                            {`${window.location.origin}/v/${id}`}
                        </div>
                        <button onClick={copyLink} className="p-2 bg-rose-gold/10 hover:bg-rose-gold/20 text-rose-gold rounded-lg border border-rose-gold/30 transition-colors">
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-script text-cream mb-1">{totalViews}</div>
                        <div className="text-[9px] uppercase tracking-widest text-rose-gold/50 font-serif">Ouvertures</div>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-script text-cream mb-1">{totalRefusals}</div>
                        <div className="text-[9px] uppercase tracking-widest text-rose-gold/50 font-serif">Refus / Esquives</div>
                    </div>
                </div>

            </div>

            {/* B. COLONNE DROITE (Logs & Unlock) */}
            <div className="lg:col-span-8 relative">
                
                {/* Conteneur Principal des Logs */}
                <div className="h-full min-h-[500px] bg-gradient-to-b from-white/5 to-black/20 border border-rose-gold/20 rounded-3xl overflow-hidden relative backdrop-blur-md flex flex-col">
                    
                    {/* Header Logs */}
                    <div className="px-8 py-6 border-b border-rose-gold/10 flex justify-between items-center bg-black/20">
                        <div>
                            <h3 className="text-xl font-serif text-rose-pale mb-1 tracking-wide">Journal d'Activité</h3>
                            <p className="text-[10px] text-rose-gold/50 font-mono uppercase tracking-widest">Surveillance Temps Réel</p>
                        </div>
                        <Shield className="text-rose-gold/30" size={24} />
                    </div>

                    {/* Zone de Scroll des Logs */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                         {(!data?.logs || data.logs.length === 0) && totalRefusals === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-rose-gold/30">
                                 <Fingerprint size={48} className="mb-4 opacity-50" />
                                 <p className="font-serif italic text-lg">Aucune trace détectée...</p>
                                 <p className="text-xs uppercase tracking-widest mt-2 opacity-50">Le système est en écoute</p>
                             </div>
                         ) : (
                             <div className={`space-y-3 transition-all duration-500 ${areDetailsLocked ? 'blur-[4px] opacity-30 select-none pointer-events-none' : ''}`}>
                                 
                                 {/* Résumé des esquives */}
                                 {totalRefusals > 0 && (
                                     <div className="flex items-center gap-5 p-4 rounded-xl bg-ruby-dark/30 border border-rose-gold/20 animate-pulse-slow">
                                         <div className="shrink-0 p-2 rounded-full bg-black/30 border border-ruby-light/30 text-ruby-light">
                                             <MousePointer2 size={18} />
                                         </div>
                                         <div className="flex-1">
                                             <p className="text-sm text-rose-pale font-medium">
                                                 Bataille acharnée détectée !
                                             </p>
                                             <div className="flex items-center gap-3 mt-1 text-[10px] text-rose-gold/50 font-mono">
                                                 <span>Le bouton NON a fui {totalRefusals} fois.</span>
                                             </div>
                                         </div>
                                     </div>
                                 )}

                                 {/* Logs standards */}
                                 {data.logs && data.logs.slice().reverse().map((log, index) => (
                                    <div key={index} className="group flex items-center gap-5 p-4 rounded-xl bg-white/5 border border-transparent hover:border-rose-gold/20 hover:bg-white/10 transition-all">
                                        <div className="shrink-0 p-2 rounded-full bg-black/30 border border-white/5 text-rose-gold">
                                            {log.action === 'viewed' ? <Eye size={18} /> : 
                                             log.action === 'clicked_yes' ? <HeartHandshake size={18} className="text-emerald-400" /> : 
                                             log.action === 'clicked_no' ? <Ban size={18} className="text-red-400" /> : 
                                             <MousePointer2 size={18} />}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-cream font-medium">
                                                {log.action === 'viewed' && "Invitation Ouverte"}
                                                {log.action === 'clicked_yes' && <span className="text-emerald-300">A cliqué sur OUI</span>}
                                                {log.action === 'clicked_no' && <span className="text-red-300">A cliqué sur NON</span>}
                                                {log.action === 'music_started' && "Musique activée 🎵"}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1 text-[10px] text-rose-gold/50 font-mono">
                                                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                <span className="w-1 h-1 rounded-full bg-rose-gold/30"></span>
                                                <span>IP: {log.ip || '192.168.X.X'}</span>
                                            </div>
                                        </div>
                                    </div>
                                 ))}
                             </div>
                         )}
                    </div>

                    {/* 4. LE LOCK SCREEN INTELLIGENT */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[6px]">
                            <div className="w-full max-w-sm mx-4 bg-[#1a0b12]/90 border border-rose-gold/30 p-8 rounded-2xl shadow-2xl relative">
                                <div className="flex flex-col items-center text-center">
                                    <div className="bg-rose-gold/10 p-4 rounded-full mb-4 border border-rose-gold/20">
                                        <LockKeyhole size={24} className="text-rose-gold" />
                                    </div>
                                    <h3 className="text-xl font-serif text-cream mb-3">
                                        Données Verrouillées
                                    </h3>
                                    <p className="text-xs text-rose-pale/70 font-sans mb-8 leading-relaxed px-4">
                                        L'accès aux adresses IP, heures exactes et détails des interactions est réservé au Rapport Complet.
                                    </p>

                                    {/* BOUTON D'ACTION DYNAMIQUE (PRIX ADAPTATIF) */}
                                    <a 
                                       href={upsellUrl} 
                                       onClick={handleUpsellClick}
                                       className="group w-full py-4 rounded-lg bg-rose-gold hover:bg-white text-ruby-dark text-xs font-bold uppercase tracking-[0.2em] shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer"
                                    >
                                        <span>Débloquer ({storedOfferPrice})</span>
                                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>

        <footer className="mt-12 text-center border-t border-rose-gold/5 pt-8">
            <button 
                onClick={() => navigate('/')}
                className="text-[10px] uppercase tracking-[0.3em] text-rose-gold/40 hover:text-rose-gold transition-colors font-serif"
            >
                Fermer le Dossier
            </button>
        </footer>

      </div>
    </div>
  );
};

export default SpyDashboard;