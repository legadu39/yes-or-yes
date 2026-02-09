import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, 
  LockKeyhole, Loader2, Ban, Eye, PartyPopper, Lock, Sparkles, 
  RefreshCw, TrendingUp, Fingerprint, ChevronRight, Key, Heart, Thermometer, Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';

// LIEN STRIPE UPSELL (1€)
const STRIPE_UPSELL_LINK = "https://buy.stripe.com/9B614ma3YexJ7X82Ft6Vq03";

const SpyDashboard = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getSpyReport, verifyPaymentStatus, ownedInvitations } = useApp();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); 
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  
  const [storedOfferPrice, setStoredOfferPrice] = useState('1€');

  const consecutiveErrors = useRef(0);
  const prevDataRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const pageVisibleRef = useRef(true);

  // --- LOGIQUE DE VÉRITÉ ---
  const urlIndicatesSuccess = searchParams.get('success') === 'true';
  const localKnowledge = ownedInvitations.find(i => i.id === id);
  const sessionUnlocked = sessionStorage.getItem(`spy_unlocked_${id}`) === 'true';

  if (urlIndicatesSuccess && !sessionUnlocked) {
      sessionStorage.setItem(`spy_unlocked_${id}`, 'true');
  }

  const isSpy = 
    (data?.plan === 'spy') || 
    (localKnowledge?.plan === 'spy') || 
    (localKnowledge?.payment_status === 'paid') ||
    sessionUnlocked || 
    urlIndicatesSuccess;

  const hasAnswered = data && data.status === 'accepted';
  const isRejected = data && data.status === 'rejected';
  
  const areDetailsLocked = !isSpy;

  // --- PRÉPARATION LIENS ---
  const token = searchParams.get('token');
  const compositeId = token ? `${id}___${token}` : id;
  const upsellUrl = `${STRIPE_UPSELL_LINK}?client_reference_id=${compositeId}`;

  useEffect(() => {
    const memory = sessionStorage.getItem(`offer_seen_${id}`);
    if (memory === '1_euro' || urlIndicatesSuccess) {
        setStoredOfferPrice('1€');
    }
  }, [id, urlIndicatesSuccess]);

  const handleUpsellClick = () => {
      if (id && token) {
          sessionStorage.setItem('pending_upsell_context', JSON.stringify({
              id: id,
              token: token,
              timestamp: Date.now()
          }));
      }
      sessionStorage.setItem(`offer_seen_${id}`, '1_euro');
  };

  // --- FETCHING ---
  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    try {
      const currentToken = searchParams.get('token');
      if (!currentToken) {
          setAccessDenied(true);
          setLoading(false);
          return;
      }
      if (!isBackgroundRefresh) setLoading(true);

      if (urlIndicatesSuccess || localKnowledge?.plan === 'spy' || sessionUnlocked) {
         await verifyPaymentStatus(id, currentToken);
      }

      const result = await getSpyReport(id, currentToken);

      if (!result) {
        consecutiveErrors.current += 1;
        if (consecutiveErrors.current > 3) setAccessDenied(true);
      } else {
        consecutiveErrors.current = 0;
        
        if (prevDataRef.current && prevDataRef.current.status === 'pending' && result.status === 'accepted') {
            triggerVictory();
        }
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
  }, [id, searchParams, getSpyReport, verifyPaymentStatus, urlIndicatesSuccess, localKnowledge?.plan, sessionUnlocked]);

  useEffect(() => {
    fetchData();
    const handleVisibilityChange = () => {
      pageVisibleRef.current = !document.hidden;
      if (!document.hidden) fetchData(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    let intervalDuration = 60000; 
    if (data?.status === 'pending') intervalDuration = 5000;
    if ((urlIndicatesSuccess || sessionUnlocked) && data?.plan === 'basic') intervalDuration = 1000; 

    pollingIntervalRef.current = setInterval(() => {
      if (pageVisibleRef.current) fetchData(true);
    }, intervalDuration);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [fetchData, data?.status, data?.plan, urlIndicatesSuccess, sessionUnlocked]);

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

  // --- RECONSTRUCTION INTELLIGENTE DES LOGS ---
  // C'est ici que la magie opère : on comble les trous de la base de données
  const enrichedLogs = useMemo(() => {
      if (!data) return [];
      
      const rawLogs = [...(data.logs || [])];
      const realAttempts = data.attempts || 0;
      const isAccepted = data.status === 'accepted';
      const isRefused = data.status === 'rejected';

      // 1. Si "Accepted" mais pas de log OUI -> On l'ajoute
      const hasYesLog = rawLogs.some(l => l.action === 'clicked_yes');
      if (isAccepted && !hasYesLog) {
          rawLogs.push({
              action: 'clicked_yes',
              timestamp: new Date().toISOString(), // On simule le "Maintenant" ou une date proche
              ip: 'Reconstitué'
          });
      }

      // 2. Si "Rejected" mais pas de log NON -> On l'ajoute
      const hasNoLog = rawLogs.some(l => l.action === 'clicked_no');
      if (isRefused && !hasNoLog) {
           rawLogs.push({
              action: 'clicked_no',
              timestamp: new Date().toISOString(),
              ip: 'Reconstitué'
          });
      }

      // 3. Si le compteur de refus > logs de refus -> On comble les trous
      const countNoLogs = rawLogs.filter(l => l.action === 'clicked_no').length;
      if (realAttempts > countNoLogs) {
          const missing = realAttempts - countNoLogs;
          for (let i = 0; i < missing; i++) {
              rawLogs.push({
                  action: 'clicked_no',
                  timestamp: new Date(Date.now() - (i * 1000 * 60)).toISOString(), // On étale dans le temps
                  ip: 'Reconstitué'
              });
          }
      }

      // 4. Si la liste est toujours vide mais qu'on a un status -> On ajoute une "Vue" implicite
      if (rawLogs.length === 0 && (isAccepted || isRefused || realAttempts > 0)) {
           rawLogs.push({
              action: 'viewed',
              timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
              ip: 'Reconstitué'
          });
      }

      // Tri chronologique inverse (plus récent en haut) pour l'affichage, ou standard pour le traitement
      return rawLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [data]);


  // --- ANALYSE PSYCHOLOGIQUE (CALCUL DES SCORES) ---
  const totalRefusals = data?.attempts || 0; 
  const totalViews = enrichedLogs.filter(l => l.action === 'viewed').length;
  
  // Score d'Intérêt / Attirance
  let loveScore = 0;
  if (data) {
      loveScore += totalViews * 15;
      loveScore += totalRefusals * 5; 
      
      if (hasAnswered) loveScore = 100;
      else if (isRejected) loveScore = 0;
      
      if (loveScore > 95 && !hasAnswered) loveScore = 95;
  }

  let hesitationMessage = "Aucune hésitation détectée";
  if (totalRefusals > 0 && totalRefusals < 3) hesitationMessage = "Petite taquinerie (Elle a essayé NON)";
  if (totalRefusals >= 3 && totalRefusals < 10) hesitationMessage = "Elle joue la difficile ! (Jeu de séduction)";
  if (totalRefusals >= 10) hesitationMessage = "Grosse résistance (Elle s'acharne sur le NON)";

  const translateLog = (log) => {
      switch(log.action) {
          case 'viewed': return "Elle a ouvert votre lettre...";
          case 'clicked_yes': return "🔥 ELLE A CLIQUÉ SUR OUI !";
          case 'clicked_no': return "😈 Elle essaie de cliquer sur NON (Le bouton fuit !)";
          case 'music_started': return "🎵 L'ambiance monte (Musique lancée)";
          default: return "Interaction détectée";
      }
  };

  // --- RENDER UI ---

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-ruby-dark flex flex-col items-center justify-center relative overflow-hidden">
        <div className="relative z-10 text-center">
            <Loader2 className="w-16 h-16 text-rose-gold animate-spin mx-auto mb-6" />
            <h2 className="text-4xl font-script text-rose-pale mb-2">Infiltration...</h2>
            <p className="text-cream/60 font-serif italic">Récupération des preuves d'amour</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-ruby-dark flex items-center justify-center p-6">
         <div className="text-center">
            <Ban className="mx-auto text-rose-gold/80 mb-6" size={64} />
            <h1 className="text-5xl font-script text-rose-pale mb-4">Accès Interdit</h1>
            <button onClick={() => navigate('/')} className="px-8 py-3 bg-rose-gold/10 text-rose-gold border border-rose-gold/50 rounded-full">
                Retour
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ruby-dark text-cream font-sans relative overflow-x-hidden selection:bg-rose-gold/30 selection:text-white">
      
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-ruby-DEFAULT/15 rounded-full blur-[150px] animate-pulse-slow"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        
        {/* HEADER */}
        <header className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6 border-b border-rose-gold/10 pb-6">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="bg-rose-gold/20 text-rose-gold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-bold">
                        Dossier Confidentiel
                    </span>
                    {!areDetailsLocked && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider animate-pulse border border-emerald-500/30">
                            Mode Espion ACTIF
                        </span>
                    )}
                </div>
                <h1 className="text-5xl md:text-6xl font-script text-transparent bg-clip-text bg-gradient-to-r from-rose-pale via-cream to-rose-gold">
                    Analyse Sentimentale
                </h1>
            </div>
            
            <div className="flex items-center gap-3">
                 <div className="text-right">
                    <p className="text-[10px] text-rose-gold/60 uppercase tracking-widest">Dernière activité</p>
                    <p className="text-xs font-mono text-rose-pale">{lastRefreshed.toLocaleTimeString()}</p>
                 </div>
                 <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            </div>
        </header>

        {/* DASHBOARD GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* GAUCHE : INDICATEURS ÉMOTIONNELS */}
            <div className="lg:col-span-5 space-y-6">
                
                {/* 1. CARTE PRINCIPALE : LE VERDICT */}
                <div className={`relative overflow-hidden rounded-3xl p-8 border backdrop-blur-xl transition-all duration-700
                    ${hasAnswered 
                        ? 'bg-gradient-to-br from-ruby-dark via-[#4a0a18] to-black border-rose-gold shadow-[0_0_40px_rgba(225,29,72,0.3)]' 
                        : 'bg-gradient-to-br from-white/5 to-black/40 border-rose-gold/20'
                    }`}>
                    
                    <div className="flex flex-col items-center text-center">
                        <div className={`mb-6 p-6 rounded-full border-2 shadow-inner ${hasAnswered ? 'bg-ruby-light/10 border-rose-gold text-rose-gold animate-bounce-slow' : 'bg-rose-gold/5 border-rose-gold/20 text-rose-gold'}`}>
                            {hasAnswered ? <HeartHandshake size={56} /> : isRejected ? <Ban size={56} /> : <Loader2 size={56} className="animate-spin-slow" />}
                        </div>
                        
                        <h2 className="text-xs font-serif text-rose-pale/50 uppercase tracking-[0.2em] mb-2">Verdict Actuel</h2>
                        <div className="text-4xl md:text-5xl font-script text-cream leading-tight mb-4">
                            {hasAnswered 
                                ? <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-gold via-cream to-rose-gold">Elle a dit Oui !</span>
                                : "En Réflexion..."
                            }
                        </div>
                    </div>
                </div>

                {/* 2. LE THERMOMÈTRE D'AMOUR */}
                <div className="bg-black/20 border border-rose-gold/10 rounded-2xl p-6 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-gold/10 rounded-lg text-rose-gold"><Thermometer size={20} /></div>
                            <div>
                                <h3 className="text-sm font-bold text-rose-pale">Température</h3>
                                <p className="text-[10px] text-rose-gold/50 uppercase tracking-widest">Niveau d'intérêt détecté</p>
                            </div>
                        </div>
                        <span className="text-2xl font-script text-rose-gold">{Math.round(loveScore)}°C</span>
                    </div>

                    {/* Jauge */}
                    <div className="h-4 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative">
                        <div 
                            className={`h-full transition-all duration-1000 ease-out shadow-[0_0_15px_currentColor] ${loveScore > 80 ? 'bg-gradient-to-r from-rose-gold to-red-500' : 'bg-rose-gold/50'}`} 
                            style={{width: `${loveScore}%`}}
                        ></div>
                    </div>
                    
                    <p className="mt-4 text-xs text-center italic text-cream/70">
                        {loveScore === 0 ? "En attente d'ouverture..." : 
                         loveScore < 30 ? "Elle regarde, elle est curieuse..." :
                         loveScore < 70 ? "Ça chauffe ! Elle hésite..." :
                         "C'est bouillant ! Elle est prête à craquer."}
                    </p>
                </div>

                {/* 3. LE DÉTECTEUR DE "JEU" (NON BUTTON) */}
                <div className="bg-black/20 border border-rose-gold/10 rounded-2xl p-6 backdrop-blur-md">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Zap size={20} /></div>
                        <div>
                            <h3 className="text-sm font-bold text-purple-200">Indice de "Hard to Get"</h3>
                            <p className="text-[10px] text-purple-400/50 uppercase tracking-widest">Tentatives de résistance</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-black/30 p-4 rounded-xl border border-white/5">
                        <span className="text-xs text-cream/80">{hesitationMessage}</span>
                        <div className="flex items-center gap-2">
                             <span className="text-2xl font-bold text-white">{totalRefusals}</span>
                             <span className="text-[10px] text-white/40 uppercase">Fois</span>
                        </div>
                    </div>
                </div>

                {/* 4. LIEN À COPIER */}
                <div className="bg-rose-gold/5 border border-rose-gold/20 rounded-xl p-4 flex items-center gap-3">
                    <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] text-rose-gold/70 uppercase tracking-widest mb-1">Lien de la cible</p>
                        <p className="text-xs font-mono text-cream/60 truncate select-all">{`${window.location.origin}/v/${id}`}</p>
                    </div>
                    <button onClick={copyLink} className="p-2 hover:bg-rose-gold/20 rounded text-rose-gold transition-colors">
                        <RefreshCw size={18} />
                    </button>
                </div>

            </div>

            {/* DROITE : JOURNAL INTIME (TIMELINE) */}
            <div className="lg:col-span-7 relative">
                <div className="h-full min-h-[500px] bg-gradient-to-b from-white/5 to-black/20 border border-rose-gold/20 rounded-3xl overflow-hidden relative backdrop-blur-md flex flex-col">
                    
                    <div className="px-8 py-6 border-b border-rose-gold/10 bg-black/20 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-serif text-rose-pale mb-1">Journal de ses Réactions</h3>
                            <p className="text-[10px] text-rose-gold/50 font-mono uppercase tracking-widest">Ce qu'elle fait en ce moment...</p>
                        </div>
                        <Eye className="text-rose-gold/40 animate-pulse" size={24} />
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                         {(!enrichedLogs || enrichedLogs.length === 0) && totalRefusals === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-rose-gold/30">
                                 <Fingerprint size={48} className="mb-4 opacity-50" />
                                 <p className="font-serif italic text-lg">En attente qu'elle clique...</p>
                                 <p className="text-xs uppercase tracking-widest mt-2 opacity-50 animate-pulse">Le piège est tendu</p>
                             </div>
                         ) : (
                             <div className={`space-y-4 transition-all duration-500 ${areDetailsLocked ? 'blur-[6px] opacity-40 select-none pointer-events-none' : ''}`}>
                                 
                                 {enrichedLogs.slice().reverse().map((log, index) => (
                                    <div key={index} className="flex gap-4 group">
                                        <div className="flex flex-col items-center">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-lg z-10 
                                                ${log.action === 'clicked_yes' ? 'bg-emerald-500 border-emerald-400 text-white' : 
                                                  log.action === 'clicked_no' ? 'bg-purple-600 border-purple-400 text-white' : 
                                                  log.action === 'music_started' ? 'bg-blue-500 border-blue-400 text-white' :
                                                  'bg-rose-gold border-rose-gold text-ruby-dark'}`}>
                                                
                                                {log.action === 'viewed' ? <Eye size={14} /> : 
                                                 log.action === 'clicked_yes' ? <Heart size={14} fill="currentColor" /> : 
                                                 log.action === 'clicked_no' ? <MousePointer2 size={14} /> : 
                                                 <Sparkles size={14} />}
                                            </div>
                                            {index !== enrichedLogs.length - 1 && <div className="w-0.5 h-full bg-white/10 -my-2"></div>}
                                        </div>
                                        
                                        <div className="flex-1 pb-6">
                                            <div className="bg-white/5 border border-white/5 p-4 rounded-r-xl rounded-bl-xl hover:bg-white/10 transition-colors">
                                                <p className="text-sm font-bold text-rose-pale mb-1">
                                                    {translateLog(log)}
                                                </p>
                                                <p className="text-[10px] text-white/30 font-mono">
                                                    {/* On gère l'affichage de l'heure même si c'est un log synthétique */}
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'À l\'instant'} • 
                                                    {log.action === 'clicked_no' ? " Tentative d'esquive" : " Action confirmée"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                 ))}
                             </div>
                         )}
                    </div>

                    {/* LOCK SCREEN (SI PAS PAYÉ) */}
                    {areDetailsLocked && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
                            <div className="w-full max-w-sm mx-4 bg-[#1a0b12] border border-rose-gold/40 p-8 rounded-2xl shadow-2xl relative">
                                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-rose-gold text-ruby-dark text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">
                                    Zone Espion
                                </div>

                                <div className="flex flex-col items-center text-center mt-4">
                                    <div className="bg-rose-gold/10 p-4 rounded-full mb-4 border border-rose-gold/20 animate-pulse">
                                        <LockKeyhole size={32} className="text-rose-gold" />
                                    </div>
                                    
                                    <h3 className="text-2xl font-script text-rose-pale mb-2">
                                        Que fait-elle vraiment ?
                                    </h3>
                                    
                                    <ul className="text-xs text-left text-rose-pale/70 font-sans mb-6 space-y-2 bg-black/30 p-4 rounded-lg border border-white/5">
                                        <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-400"/> Voir si elle a hésité avant de dire OUI</li>
                                        <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-400"/> Voir combien de fois elle a essayé NON</li>
                                        <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-400"/> Savoir si elle a écouté la musique</li>
                                    </ul>

                                    <a 
                                       href={upsellUrl} 
                                       onClick={handleUpsellClick}
                                       className="group w-full py-4 rounded-lg bg-gradient-to-r from-rose-gold via-[#e8b594] to-rose-gold background-animate hover:bg-white text-ruby-dark text-xs font-bold uppercase tracking-[0.2em] shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer transform hover:scale-[1.02]"
                                    >
                                        <span>Débloquer le Rapport ({storedOfferPrice})</span>
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