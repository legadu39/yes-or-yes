import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Eye, Sparkles, Copy, Heart, TrendingUp, CreditCard, 
  Timer, Loader2, Check, Shield, RefreshCw, PartyPopper, Lock, Crown
} from 'lucide-react';

// --- CONFIGURATION ---
const FAKE_NOTIFICATIONS = [
  { name: "Lucas (Paris)", action: "a piégé sa copine", time: "à l'instant" },
  { name: "Sarah (Lyon)", action: "a pris le pack Espion", time: "il y a 2 min" },
  { name: "Amine (Marseille)", action: "a reçu un OUI", time: "il y a 5 min" },
  { name: "Julie (Bordeaux)", action: "consulte le rapport", time: "à l'instant" },
  { name: "Thomas (Lille)", action: "a piégé son crush", time: "il y a 1 min" }
];

const STRIPE_LINKS = {
  basic: "https://buy.stripe.com/cNi6oG0to3T51yKcg36Vq01", 
  spy: "https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02"
};

const Home = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    createInvitation, 
    verifyPaymentStatus, 
    getPublicInvitation, 
    getOwnedInvitations,
    saveDraft, 
    recoverDraft
  } = useApp();

  // --- ÉTATS GLOBAUX ---
  const [formData, setFormData] = useState({ sender: '', valentine: '', plan: 'spy' });
  const [generatedLinks, setGeneratedLinks] = useState(null);
  // Status: idle | processing | paying | verifying | verifying_long | success | error
  const [status, setStatus] = useState('idle'); 
  const [activeNotif, setActiveNotif] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [mounted, setMounted] = useState(false);

  // --- ÉTATS INTELLIGENCE (LIVE MONITORING) ---
  const [answerReceived, setAnswerReceived] = useState(null); // Stocke la réponse si reçue en direct
  const pollingIntervalRef = useRef(null); // Pour nettoyer le polling
  const [monitoringToken, setMonitoringToken] = useState(null); // Token admin conservé en mémoire

  // --- INITIALISATION ---
  useEffect(() => setMounted(true), []);

  // 1. PERSISTANCE BROUILLON (Anti-Amnésie)
  useEffect(() => {
    if (status === 'idle') {
        const draft = recoverDraft();
        if (draft) setFormData(draft);
    }
  }, []);

  useEffect(() => {
    if (status === 'idle') saveDraft(formData);
  }, [formData, status, saveDraft]);

  // 2. GESTION RETOUR PAIEMENT (Smart Recovery)
  useEffect(() => {
    const urlId = searchParams.get('payment_id') || searchParams.get('id') || searchParams.get('client_reference_id');
    const fromStripe = searchParams.get('success') === 'true';
    const stateParam = searchParams.get('state');

    // Cas A : Retour direct de Stripe
    if (urlId && !generatedLinks && (fromStripe || stateParam)) {
        handlePaymentReturn(urlId, stateParam);
    } 
    // Cas B : Rafraîchissement page ou lien direct sans params Stripe
    else if (urlId && !generatedLinks) {
        handleBackgroundCheck(urlId);
    }
    // Cas C : Perte de contexte Stripe (Fallback)
    else if (fromStripe && !urlId && !generatedLinks) {
       console.log("⚠️ Retour Stripe sans ID explicite. Tentative de restauration heuristique.");
       restoreLastOrder();
    }
  }, [searchParams]);

  // 3. INTELLIGENCE : SURVEILLANCE RÉPONSE (LIVE MONITORING)
  // S'active uniquement quand le statut est SUCCESS
  useEffect(() => {
    if (status !== 'success' || !generatedLinks || answerReceived) return;

    // On extrait l'ID de l'URL générée ou du state local
    const currentId = generatedLinks.valentine.split('/').pop();
    if (!currentId) return;

    let checkCount = 0;
    const MAX_CHECKS = 120; // 10 minutes de surveillance

    const checkLiveStatus = async () => {
        try {
            checkCount++;
            const serverData = await getPublicInvitation(currentId);

            // DÉTECTION VICTOIRE
            if (serverData && serverData.status === 'accepted') {
                // 🎉 TRIGGER UI
                setAnswerReceived({
                    name: serverData.valentine || formData.valentine,
                    timestamp: new Date()
                });
                
                // 📳 HAPTIC FEEDBACK
                if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

                clearInterval(pollingIntervalRef.current);
            }

            if (checkCount >= MAX_CHECKS) clearInterval(pollingIntervalRef.current);
        } catch (e) {
            console.warn("Silent polling error", e);
        }
    };

    pollingIntervalRef.current = setInterval(checkLiveStatus, 5000);

    // Visibility API : Vérifier immédiatement si l'utilisateur revient sur l'onglet
    const handleVisibilityChange = () => {
        if (!document.hidden && !answerReceived) {
            console.log("👀 Retour utilisateur -> Check immédiat");
            checkLiveStatus();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status, generatedLinks, answerReceived]);


  // --- LOGIQUE MÉTIER ---

  const preloadAssets = () => {
    if (window.hasPreloaded) return;
    const audio = new Audio('/assets/music.ogg'); // Préchargement musique potentielle
    audio.load();
    window.hasPreloaded = true;
  };

  // Restauration silencieuse (F5 sur page succès)
  const handleBackgroundCheck = async (urlId) => {
    const isPaid = await verifyPaymentStatus(urlId);
    if (isPaid) {
        const serverData = await getPublicInvitation(urlId);
        const owned = getOwnedInvitations();
        const foundLocal = owned.find(i => i.id === urlId);
        
        // Fusion des données serveur et locales
        const finalData = { ...foundLocal, ...serverData, id: urlId };
        displaySuccess(finalData, foundLocal?.token);
    }
  };

  // Traitement retour Stripe (avec décodage State)
  const handlePaymentReturn = async (paymentId, stateParam) => {
    console.log("Traitement retour paiement pour:", paymentId);
    
    const owned = getOwnedInvitations();
    let foundToken = null;
    let recoveredData = null;

    // 1. Décodage du State (si présent) pour récupérer Token & Plan
    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(stateParam));
        if (decoded.t && decoded.id === paymentId) {
          foundToken = decoded.t;
          recoveredData = { sender: decoded.s, valentine: decoded.v, plan: decoded.p };
          repairLocalMemory(paymentId, foundToken, recoveredData);
        }
      } catch (e) { console.error("Échec décodage state URL", e); }
    }

    // 2. Recherche locale (Fallback)
    if (!foundToken) {
        const foundLocal = owned.find(i => i.id === paymentId);
        if (foundLocal) {
            foundToken = foundLocal.token;
            recoveredData = foundLocal;
        }
    }

    // 3. Vérité Serveur
    try {
        const serverData = await getPublicInvitation(paymentId);
        
        if (serverData && serverData.payment_status === 'paid') {
            // Fix ID reconciliation (Stripe ID vs UUID)
            if (!foundToken) {
                const realLocal = owned.find(i => i.id === serverData.id);
                if (realLocal) foundToken = realLocal.token;
            }

            const finalInvite = {
                id: serverData.id,
                sender: serverData.sender || recoveredData?.sender || "Vous",
                valentine: serverData.valentine || recoveredData?.valentine || "...",
                plan: serverData.plan // Source de vérité pour le plan
            };

            repairLocalMemory(finalInvite.id, foundToken, finalInvite);

            // INTELLIGENCE DE REDIRECTION (UPSell Fix) :
            if (!stateParam && foundToken && finalInvite.plan === 'spy') {
                 console.log("🔄 Retour Upsell détecté -> Redirection Dashboard");
                 navigate(`/spy/${finalInvite.id}?token=${foundToken}`);
                 return;
            }

            displaySuccess(finalInvite, foundToken);
        } else {
            // Paiement pas encore propagé -> Polling
            waitForServerValidation(paymentId, { ...recoveredData, id: paymentId });
        }
    } catch (e) {
        waitForServerValidation(paymentId, recoveredData); // Fallback total
    }
  };

  const repairLocalMemory = (id, token, data) => {
    if (!id) return;
    const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
    const filtered = stored.filter(i => i.id !== id);
    const newEntry = { id, token, createdAt: new Date().toISOString(), ...data };
    localStorage.setItem('yesoryes_owned', JSON.stringify([newEntry, ...filtered]));
  };

  // Polling adaptatif (Backoff) pour attendre la validation Stripe
  const waitForServerValidation = async (paymentId, contextData) => {
    setStatus('verifying');
    let attempt = 0;
    const maxAttempts = 25;
    const delays = [1000, 1000, 2000, 2000, 3000, 3000, 5000]; // Délais progressifs

    const poll = async () => {
      attempt++;
      const serverData = await getPublicInvitation(paymentId);
      
      if (serverData && serverData.payment_status === 'paid') {
        localStorage.removeItem('draft_invitation');
        
        // Tentative de récupération du token via l'ID final
        let finalToken = contextData?.token;
        if (!finalToken) {
             const owned = getOwnedInvitations();
             const realLocal = owned.find(i => i.id === serverData.id);
             if (realLocal) finalToken = realLocal.token;
        }

        const finalData = { ...contextData, id: serverData.id, plan: serverData.plan };
        if (finalToken) repairLocalMemory(serverData.id, finalToken, finalData);

        displaySuccess(finalData, finalToken);

      } else if (attempt < maxAttempts) {
        const nextDelay = delays[Math.min(attempt, delays.length - 1)] || 5000;
        setTimeout(poll, nextDelay);
      } else {
        setStatus('verifying_long');
      }
    };
    poll();
  };

  const displaySuccess = (invite, token) => {
    if (!invite) return;
    
    setFormData({ 
        sender: invite.sender || "Vous", 
        valentine: invite.valentine || "...", 
        plan: invite.plan || 'spy' 
    });
    
    // Le lien espion n'est généré que si on a le token (sécurité)
    const showSpyLink = token ? true : false;
    setMonitoringToken(token); // Sauvegarde pour usage interne

    setGeneratedLinks({
      valentine: `${window.location.origin}/v/${invite.id}`,
      spy: showSpyLink ? `${window.location.origin}/spy/${invite.id}?token=${token}` : null
    });
    
    setStatus('success');
  };

  const restoreLastOrder = async () => {
    const owned = getOwnedInvitations();
    if (owned.length > 0) waitForServerValidation(owned[0].id, owned[0]);
    else {
        alert("Impossible de retrouver la commande. Contactez le support.");
        setStatus('idle');
    }
  };

  // --- ACTIONS UI ---

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.sender.trim() || !formData.valentine.trim()) return;

    setStatus('processing');

    try {
      const result = await createInvitation(
        formData.sender.trim(),
        formData.valentine.trim(),
        formData.plan
      );

      if (!result || !result.id) throw new Error("Erreur création");

      const { id, token } = result;
      setStatus('paying');

      // State Payload : On encode tout pour survivre au redirect Stripe
      const statePayload = btoa(JSON.stringify({ 
        t: token, id: id, s: formData.sender, v: formData.valentine, p: formData.plan 
      }));
      
      const returnUrl = encodeURIComponent(`${window.location.origin}?payment_id=${id}&success=true&state=${statePayload}`);
      const stripeUrl = (formData.plan === 'spy' || formData.plan === 'premium') ? STRIPE_LINKS.spy : STRIPE_LINKS.basic;
      
      // PRODUCTION : Redirection Stripe
      window.location.href = `${stripeUrl}?client_reference_id=${id}&redirect_url=${returnUrl}`;

    } catch (error) {
      console.error("Erreur handleSubmit:", error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleShare = async (text, field) => {
    if (navigator.share && navigator.canShare) {
      try {
        await navigator.share({
          title: 'YesOrYes',
          text: field === 'valentine' ? "Pour toi..." : "Mon accès secret",
          url: text
        });
        setCopiedField(field);
      } catch (err) { copyToClipboard(text, field); }
    } else { copyToClipboard(text, field); }
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
  };

  // Fake Notifs Logic
  useEffect(() => {
    const showNotification = () => {
      const randomNotif = FAKE_NOTIFICATIONS[Math.floor(Math.random() * FAKE_NOTIFICATIONS.length)];
      setActiveNotif(randomNotif);
      setTimeout(() => setActiveNotif(null), 6000);
    };
    const t1 = setTimeout(showNotification, 2000);
    const t2 = setInterval(showNotification, 18000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, []);

  // --- RENDU ---

  // VUE SUCCÈS
  if (status === 'success' && generatedLinks) {
    return (
      <div className="min-h-screen bg-ruby-dark flex flex-col items-center justify-center p-6 animate-fade-in relative z-10 overflow-hidden">
        
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none">
           <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-rose-gold/10 rounded-full blur-[120px] animate-pulse-slow"></div>
        </div>

        <div className="max-w-2xl w-full bg-ruby-DEFAULT/10 backdrop-blur-md border border-rose-gold/20 rounded-3xl p-8 text-center shadow-2xl relative">
          
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-rose-gold/10 rounded-full flex items-center justify-center border border-rose-gold/30 shadow-[0_0_30px_rgba(225,29,72,0.3)]">
              <Check className="text-rose-gold w-8 h-8" />
            </div>
          </div>

          <h2 className="text-3xl font-script text-rose-pale mb-2">Invitation Prête</h2>
          <p className="text-rose-pale/60 mb-8">Le destin de {formData.valentine} est entre vos mains.</p>

          {/* --- NOTIFICATION LIVE "ELLE A DIT OUI" (REDESIGN LUXE) --- */}
          {answerReceived && (
              <div className="mb-10 p-1 relative group transform hover:scale-105 transition-transform duration-500 animate-bounce-slow cursor-pointer">
                  {/* Bordure brillante animée */}
                  <div className="absolute inset-0 bg-gradient-to-r from-rose-gold via-ruby-light to-rose-gold rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 animate-pulse"></div>
                  
                  <div className="relative bg-ruby-dark border border-rose-gold/50 rounded-2xl p-6 flex flex-col items-center text-center shadow-2xl overflow-hidden">
                      {/* Effet de brillance traversant */}
                      <div className="absolute top-0 -left-[100%] w-[50%] h-full bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-25 animate-shine pointer-events-none"></div>

                      <div className="flex items-center justify-center gap-4 mb-3">
                          <Heart className="w-8 h-8 text-ruby-light fill-ruby-light animate-ping absolute opacity-50" />
                          <Heart className="w-8 h-8 text-rose-gold fill-ruby-DEFAULT animate-pulse relative z-10" />
                          
                          <h3 className="text-3xl md:text-4xl font-script text-transparent bg-clip-text bg-gradient-to-r from-rose-gold via-cream to-rose-gold drop-shadow-md">
                              ELLE A DIT OUI !
                          </h3>
                          
                          <Heart className="w-8 h-8 text-rose-gold fill-ruby-DEFAULT animate-pulse relative z-10" />
                      </div>

                      <p className="text-rose-pale/90 font-serif italic text-lg mb-4">
                          <span className="font-bold text-white">{answerReceived.name}</span> a accepté votre invitation à l'instant.
                      </p>

                      {/* Bouton pour voir le détail si on a le token */}
                      {monitoringToken && (
                           <button 
                             onClick={() => window.open(generatedLinks.spy, '_blank')}
                             className="mt-2 px-8 py-3 bg-gradient-to-r from-rose-gold to-amber-200 hover:to-white text-ruby-dark rounded-full font-bold text-xs uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(225,183,144,0.4)] transition-all transform active:scale-95 flex items-center gap-2"
                           >
                             <Eye size={16} /> Voir le Rapport
                           </button>
                      )}
                  </div>
              </div>
          )}

          {/* LIEN PUBLIC */}
          <div className="bg-ruby-dark/50 rounded-xl p-6 mb-6 border border-rose-gold/30">
            <h3 className="text-rose-gold font-serif mb-4 flex items-center justify-center gap-2">
              <Heart size={18} className="fill-rose-gold" />
              Lien pour {formData.valentine}
            </h3>
            <div className="flex gap-2 items-center bg-black/30 p-3 rounded-lg border border-rose-gold/10">
              <code className="text-rose-pale/80 text-sm flex-1 truncate font-mono select-all">
                {generatedLinks.valentine}
              </code>
              <button 
                onClick={() => handleShare(generatedLinks.valentine, 'valentine')}
                className="p-2 hover:bg-rose-gold/20 rounded-md transition-colors text-rose-gold"
              >
                {copiedField === 'valentine' ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
              </button>
            </div>
            <div className="mt-2 flex justify-center">
                 <span className="flex items-center gap-1 text-[10px] text-rose-gold/60 bg-rose-gold/5 px-2 py-0.5 rounded-full border border-rose-gold/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-gold animate-pulse"></div>
                    En attente de clic...
                 </span>
            </div>
          </div>

          {/* DASHBOARD ESPION (Différencié selon Plan) */}
          {generatedLinks.spy ? (
            <div className="bg-black/40 rounded-xl p-6 mb-8 border border-purple-500/30 relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-purple-500/20 px-3 py-1 rounded-bl-lg text-[10px] text-purple-300 uppercase tracking-widest font-bold border-l border-b border-purple-500/20">
                {formData.plan === 'spy' || formData.plan === 'premium' ? 'Activé' : 'Limité'}
              </div>
              
              <h3 className="text-purple-300 font-serif mb-4 flex items-center justify-center gap-2">
                <Shield size={18} />
                {formData.plan === 'spy' || formData.plan === 'premium' ? 'Espace Espion' : 'Suivi Basique'}
              </h3>
              
              <div className="flex gap-2 items-center bg-black/50 p-3 rounded-lg border border-purple-500/20">
                <code className="text-purple-200/60 text-sm flex-1 truncate font-mono select-all blur-[2px] group-hover:blur-0 transition-all duration-500">
                  {generatedLinks.spy}
                </code>
                <button 
                  onClick={() => handleShare(generatedLinks.spy, 'spy')}
                  className="p-2 hover:bg-purple-500/20 rounded-md transition-colors text-purple-400"
                >
                  {copiedField === 'spy' ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                </button>
              </div>
              
              <div className="flex justify-center gap-4 mt-4">
                  <button
                      onClick={() => window.open(generatedLinks.spy, '_blank')}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm rounded-full transition-all border border-purple-500/30"
                  >
                      <Eye size={14} /> Ouvrir le Dashboard
                  </button>
              </div>
            </div>
          ) : (
            // UPSELL si Plan Basic
             <div className="bg-gradient-to-br from-gray-900 to-black rounded-xl p-6 mb-8 border border-white/10 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-gray-400">
                        <Lock size={18} /> <span className="font-serif">Mode Espion Verrouillé</span>
                    </div>
                    <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">BASIC</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                    Vous ne saurez pas combien de fois elle a hésité ou cliqué sur "NON".
                </p>
                <a
                    href={`${STRIPE_LINKS.spy}?client_reference_id=${generatedLinks.valentine.split('/').pop()}`}
                    className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-900 to-purple-800 hover:brightness-110 text-purple-100 text-sm rounded-lg transition-all border border-purple-500/30 shadow-lg"
                >
                    <Sparkles size={14} /> Débloquer le Carnet Secret (2.50€)
                </a>
             </div>
          )}

          <button 
            onClick={() => {
                setStatus('idle');
                setGeneratedLinks(null);
                setAnswerReceived(null);
                setFormData({ ...formData, valentine: '' });
            }}
            className="text-rose-pale/50 hover:text-rose-pale text-sm underline underline-offset-4 transition-colors"
          >
            Créer une autre invitation
          </button>
        </div>
      </div>
    );
  }

  // VUE FORMULAIRE
  return (
    <div className={`min-h-screen bg-ruby-dark p-4 flex flex-col items-center justify-center relative overflow-x-hidden pt-16 ${mounted ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}>
      
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-ruby-DEFAULT/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#4a0a18]/40 rounded-full blur-[150px]"></div>
      </div>

      <div className="fixed top-0 left-0 w-full bg-ruby-dark/95 border-b border-rose-gold/30 backdrop-blur-md z-50 py-2 px-4 flex justify-center items-center gap-3">
        <Timer size={14} className="text-rose-gold animate-pulse" />
        <p className="text-xs md:text-sm text-cream font-medium tracking-wide">
          Faites votre demande avant le <span className="text-rose-gold font-bold">14 Février</span>.
        </p>
      </div>

      <header className="text-center mb-10 relative z-10 max-w-2xl px-4">
        <div className="inline-flex items-center justify-center p-3 mb-6 rounded-full bg-rose-gold/10 border border-rose-gold/20 shadow-lg shadow-ruby-DEFAULT/10">
            <Sparkles className="text-rose-gold w-6 h-6 animate-spin-slow" />
        </div>
        <h1 className="text-7xl md:text-8xl font-script text-rose-pale mb-4 drop-shadow-lg">YesOrYes</h1>
        
        <p className="text-cream/90 text-sm md:text-base font-serif italic mb-6 leading-relaxed border-l-2 border-rose-gold/50 pl-4 py-2 bg-ruby-light/10 rounded-r-lg shadow-lg">
          Envoyez le lien. Le bouton "NON" s'enfuira quand elle essaiera de cliquer. <br/>
          <span className="text-rose-gold/70 text-xs uppercase tracking-widest not-italic font-bold">
            (Regardez-la galérer...)
          </span>
        </p>
      </header>

      <main className="card-valentine w-full max-w-2xl p-8 md:p-12 z-10 relative mb-8">
        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="group relative">
              <label className="block text-rose-gold text-xs uppercase tracking-widest mb-2 ml-1">De la part de</label>
              <input 
                required type="text" maxLength={20} disabled={status !== 'idle'}
                className="w-full p-3 bg-transparent border-b border-rose-gold/30 text-cream text-xl focus:border-rose-gold outline-none transition-all font-serif italic"
                placeholder="Votre Prénom"
                value={formData.sender}
                onFocus={preloadAssets}
                onChange={(e) => setFormData({...formData, sender: e.target.value})}
              />
            </div>
            <div className="group relative">
               <label className="block text-rose-gold text-xs uppercase tracking-widest mb-2 ml-1">Pour</label>
               <input 
                required type="text" maxLength={20} disabled={status !== 'idle'}
                className="w-full p-3 bg-transparent border-b border-rose-gold/30 text-cream text-xl focus:border-rose-gold outline-none transition-all font-serif italic"
                placeholder="Son Prénom"
                value={formData.valentine}
                onFocus={preloadAssets}
                onChange={(e) => setFormData({...formData, valentine: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px bg-rose-gold/30 flex-1"></div>
              <span className="font-script text-2xl text-rose-pale">Votre Choix</span>
              <div className="h-px bg-rose-gold/30 flex-1"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PLAN BASIC */}
              <div 
                onClick={() => status === 'idle' && setFormData({...formData, plan: 'basic'})}
                className={`cursor-pointer p-6 rounded-xl border transition-all duration-300 flex flex-col justify-between h-full ${formData.plan === 'basic' ? 'bg-ruby-light/10 border-rose-gold shadow-rosegold' : 'bg-transparent border-rose-gold/20 hover:border-rose-gold/50'} ${status !== 'idle' ? 'opacity-50' : ''}`}
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-cream font-medium text-lg">L'Essentiel</span>
                    <span className="text-rose-gold italic text-sm">1.50€</span>
                  </div>
                  <p className="text-sm text-cream/60 italic font-light">Expérience immersive classique. Simple et efficace.</p>
                </div>
              </div>

              {/* PLAN SPY */}
              <div 
                onClick={() => status === 'idle' && setFormData({...formData, plan: 'spy'})}
                className={`relative cursor-pointer rounded-xl border transition-all duration-300 overflow-hidden ${formData.plan === 'spy' ? 'bg-gradient-to-br from-ruby-DEFAULT/30 to-ruby-dark/30 border-rose-gold shadow-rosegold scale-105' : 'bg-transparent border-rose-gold/20 hover:border-rose-gold/50'} ${status !== 'idle' ? 'opacity-50' : ''}`}
              >
                <div className="absolute top-0 right-0 bg-rose-gold text-ruby-dark text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">POPULAIRE</div>
                <div className="p-6 relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-gold animate-pulse" />
                      <span className="text-cream font-medium text-lg">L'Espion</span>
                    </div>
                    <span className="text-rose-gold font-bold text-lg">2.50€</span>
                  </div>
                  <p className="text-sm text-cream/90 mb-3 italic font-light">Inclut le <strong>Carnet Secret</strong> : suivez ses clics et refus en direct.</p>
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={status !== 'idle' && status !== 'verifying_long'}
            className="w-full btn-ruby py-4 rounded-lg tracking-[0.2em] text-sm uppercase font-medium transition-all shadow-lg hover:shadow-rose-gold/20 relative overflow-hidden group"
          >
            {status === 'idle' && (
                <span className="flex items-center justify-center gap-3 relative z-10">
                    {formData.plan === 'spy' ? (
                        <>Inviter + Activer le Mouchard <Shield size={16} fill="currentColor" /></>
                    ) : (
                        <>Sceller l'invitation <Heart size={16} fill="currentColor" /></>
                    )}
                </span>
            )}
            {status === 'processing' && <span className="flex items-center justify-center gap-3 animate-pulse">Création...</span>}
            {status === 'paying' && <span className="flex items-center justify-center gap-3"><CreditCard size={16} className="animate-bounce" /> Redirection...</span>}
            {status === 'verifying' && <span className="flex items-center justify-center gap-3"><Loader2 size={16} className="animate-spin" /> Validation Bancaire...</span>}
            {status === 'verifying_long' && <span className="flex items-center justify-center gap-3"><RefreshCw size={16} /> C'est long... Vérifier manuellement</span>}
            {status === 'error' && <span>Erreur - Réessayer</span>}
          </button>
        </form>
      </main>

      {/* FOOTER & NOTIFS */}
      <footer className="mt-auto py-8 text-center relative z-10 w-full opacity-60 hover:opacity-100 transition-opacity">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 text-[10px] uppercase tracking-widest text-rose-gold/50 font-serif">
            <Link to="/legal/cgv" className="hover:text-rose-gold transition-colors">CGV</Link>
            <Link to="/legal/confidentialite" className="hover:text-rose-gold transition-colors">Confidentialité</Link>
            <Link to="/legal/mentions-legales" className="hover:text-rose-gold transition-colors">Mentions Légales</Link>
            <a href="mailto:contact@yesoryes.com" className="hover:text-rose-gold transition-colors">Contact</a>
        </div>
        <p className="mt-4 text-[9px] text-ruby-light/30">YesOrYes © {new Date().getFullYear()} • Fait avec Amour</p>
      </footer>

      {activeNotif && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-4 bg-ruby-dark/90 border border-rose-gold/30 backdrop-blur-md px-4 py-3 rounded-lg shadow-xl animate-slide-up max-w-[300px]">
          <div className="bg-rose-gold/20 p-2 rounded-full"><TrendingUp size={16} className="text-rose-gold" /></div>
          <div>
            <p className="text-xs text-rose-pale font-bold">{activeNotif.name}</p>
            <p className="text-xs text-cream/80">{activeNotif.action} <span className="opacity-50 mx-1">•</span> {activeNotif.time}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;