import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Eye, Sparkles, Copy, Heart, TrendingUp, CreditCard, Timer, 
  Loader2, Check, Shield, RefreshCw, PartyPopper, Lock, 
  ArrowRight, ShieldCheck, Send 
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
    createInvitation, getSpyReport, verifyPaymentStatus, 
    getPublicInvitation, getOwnedInvitations, saveDraft, recoverDraft 
  } = useApp();

  // --- ÉTATS GLOBAUX ---
  const [formData, setFormData] = useState({
    sender: '',
    valentine: '',
    plan: 'spy'
  });

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
      } catch (e) {
        console.error("Échec décodage state URL", e);
      }
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
    setMonitoringToken(token);

    // Sauvegarde pour usage interne
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
        t: token,
        id: id,
        s: formData.sender,
        v: formData.valentine,
        p: formData.plan
      }));

      // NOTE: En production, décommenter la redirection Stripe
      // const returnUrl = encodeURIComponent(`${window.location.origin}?payment_id=${id}&success=true&state=${statePayload}`);
      // const stripeUrl = (formData.plan === 'spy' || formData.plan === 'premium') ? STRIPE_LINKS.spy : STRIPE_LINKS.basic;
      // window.location.href = `${stripeUrl}?client_reference_id=${id}&redirect_url=${returnUrl}`;

      // --- MODE TEST ACTUEL (BYPASS) ---
      console.log("🚀 MODE TEST ACTIVÉ : Paiement ignoré");
      
      const fakeInvite = {
        id: id,
        sender: formData.sender,
        valentine: formData.valentine,
        plan: formData.plan,
        payment_status: 'paid'
      };
      
      // Simulation délai
      setTimeout(() => {
        displaySuccess(fakeInvite, token);
      }, 1500);

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
      } catch (err) {
        copyToClipboard(text, field);
      }
    } else {
      copyToClipboard(text, field);
    }
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
    
    return () => {
      clearTimeout(t1);
      clearInterval(t2);
    };
  }, []);

  // --- RENDU ---

  // VUE SUCCÈS - DESIGN REVISITÉ (Rouge Love / Gold)
  if (status === 'success' && generatedLinks) {
    return (
      <div className="min-h-screen w-full bg-[#3d0b0b] text-red-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        
        {/* Fond d'ambiance */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#5e0f0f] via-[#2b0505] to-black opacity-80 pointer-events-none"></div>
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none mix-blend-overlay"></div>

        <div className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in duration-500">
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-900/30 border border-red-500/30 mb-6 shadow-[0_0_30px_rgba(220,38,38,0.4)]">
                <div className="relative">
                    <Heart className="w-10 h-10 text-red-500 fill-red-500 animate-pulse" />
                    <div className="absolute inset-0 bg-red-500 blur-xl opacity-50 animate-pulse"></div>
                </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif text-transparent bg-clip-text bg-gradient-to-br from-red-100 via-red-200 to-red-400 drop-shadow-sm">
              Invitation Prête
            </h1>
            <p className="mt-3 text-red-200/60 font-light text-lg">
              Le destin de <span className="font-semibold text-red-100">{formData.valentine}</span> est entre vos mains.
            </p>
          </div>

          {/* --- INTELLIGENCE : NOTIFICATION "ELLE A DIT OUI" STYLE PREMIUM --- */}
          {answerReceived && (
            <div className="mb-8 relative overflow-hidden rounded-xl border border-amber-500/50 bg-gradient-to-br from-[#4a0404] to-[#2b0000] p-6 shadow-[0_0_40px_-10px_rgba(180,83,9,0.5)] animate-in slide-in-from-top-5 duration-700">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10"></div>
               <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-400 font-bold tracking-widest text-xs uppercase">Mission Réussie</span>
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  <h2 className="text-3xl font-serif text-white mb-2 drop-shadow-md">
                    ELLE A DIT OUI !
                  </h2>
                  <p className="text-red-200/80 text-sm mb-4">
                    {answerReceived.name} a accepté votre invitation à l'instant.
                  </p>
                  
                  {monitoringToken && (
                    <button 
                        onClick={() => navigate(`/spy/${generatedLinks.valentine.split('/').pop()}?token=${monitoringToken}`)}
                        className="group flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-400 text-[#2b0000] font-bold rounded-full transition-all shadow-lg hover:shadow-amber-500/20"
                    >
                        <Eye className="w-4 h-4" />
                        <span>Voir sa réaction</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
               </div>
            </div>
          )}

          {/* LIEN VALENTINE */}
          <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-red-500/20 p-6 mb-6 shadow-xl">
            <div className="flex items-center gap-2 mb-3 text-red-200">
                <Heart className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium uppercase tracking-wider opacity-70">Lien pour {formData.valentine}</span>
            </div>
            
            <div 
                onClick={() => handleShare(generatedLinks.valentine, 'valentine')}
                className="group relative flex items-center bg-[#1a0505] border border-red-900/50 rounded-xl p-4 cursor-pointer hover:border-red-500/50 transition-colors"
            >
                <div className="flex-1 min-w-0 mr-4">
                    <p className="text-red-100 font-mono text-sm truncate opacity-90">
                        {generatedLinks.valentine}
                    </p>
                </div>
                <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
                    {copiedField === 'valentine' ? <ShieldCheck className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-red-400" />}
                </div>
            </div>
            <p className="text-center text-xs text-red-200/40 mt-3 flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                En attente de clic...
            </p>
          </div>

          {/* LIEN ESPION (SI DISPO) */}
          {generatedLinks.spy && (
            <div className="bg-gradient-to-b from-[#1a0000] to-black rounded-2xl border border-red-500/20 p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Lock className="w-24 h-24 text-red-500" />
                </div>

                <div className="flex items-center gap-2 mb-3">
                    <div className="bg-red-500/20 p-1 rounded">
                        <Lock className="w-3 h-3 text-red-500" />
                    </div>
                    <span className="text-sm font-bold text-red-500 uppercase tracking-wider">Votre Tableau de Bord Secret</span>
                </div>

                <p className="text-sm text-red-200/60 mb-4 leading-relaxed">
                    Accédez aux preuves : Heure de lecture, hésitations, clics sur "NON". 
                    <br/><span className="text-red-400 italic">Gardez ce lien privé.</span>
                </p>

                <div 
                    onClick={() => handleShare(generatedLinks.spy, 'spy')}
                    className="flex items-center bg-black/60 border border-red-900/30 rounded-xl p-3 cursor-pointer hover:border-red-500/30 transition-colors"
                >
                    <div className="flex-1 min-w-0 mr-3">
                        <p className="text-red-100/50 font-mono text-xs truncate">
                            {generatedLinks.spy}
                        </p>
                    </div>
                    {copiedField === 'spy' ? <ShieldCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-red-500/70" />}
                </div>

                <button 
                    onClick={() => window.open(generatedLinks.spy, '_blank')}
                    className="mt-4 w-full py-3 rounded-lg bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-300 font-semibold text-sm transition-all flex items-center justify-center gap-2"
                >
                    <Eye className="w-4 h-4" />
                    Ouvrir mon tableau de bord
                </button>
            </div>
          )}

          <div className="mt-8 text-center">
             <p className="text-xs text-red-200/30 font-light">
                Faites votre demande avant le 14 Février. <br/> 
                Les données s'autodétruisent après 30 jours.
             </p>
          </div>
        </div>

        {/* NOTIFICATIONS FLOTTANTES */}
        {activeNotif && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-max max-w-[90%] bg-black/80 backdrop-blur-xl border border-red-500/20 px-4 py-3 rounded-full flex items-center gap-3 shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 z-50">
            <div className="relative">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
            </div>
            <div className="text-xs text-red-100">
              <span className="font-bold">{activeNotif.name}</span> {activeNotif.action}
              <span className="text-red-200/40 ml-2 border-l border-red-200/20 pl-2">{activeNotif.time}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // VUE CHARGEMENT / FORMULAIRE (Code identique pour la création, juste le background mis à jour pour cohérence)
  return (
    <div className="min-h-screen w-full bg-[#3d0b0b] text-red-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Fond animé subtil */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#4a0909] via-[#1a0000] to-black opacity-90"></div>
      
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
            <h1 className="text-4xl font-serif text-white mb-2 drop-shadow-[0_2px_10px_rgba(220,38,38,0.5)]">YesOrYes</h1>
            <p className="text-red-200/60 text-sm tracking-widest uppercase">Agence de rencontres confidentielles</p>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-red-500/10 p-8 shadow-2xl ring-1 ring-white/5">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-xs font-bold text-red-300 uppercase tracking-wider mb-2 ml-1">Votre Nom de code</label>
                    <input 
                        type="text" 
                        value={formData.sender}
                        onChange={(e) => setFormData({...formData, sender: e.target.value})}
                        placeholder="Ex: L'Admirateur Secret"
                        className="w-full bg-[#1a0505] border border-red-900/50 rounded-xl px-4 py-3 text-red-100 placeholder-red-900/50 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-red-300 uppercase tracking-wider mb-2 ml-1">La Cible (Valentin/e)</label>
                    <input 
                        type="text" 
                        value={formData.valentine}
                        onChange={(e) => setFormData({...formData, valentine: e.target.value})}
                        placeholder="Ex: Julie"
                        className="w-full bg-[#1a0505] border border-red-900/50 rounded-xl px-4 py-3 text-red-100 placeholder-red-900/50 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={status === 'processing' || status === 'paying'}
                    className="w-full bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold py-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(220,38,38,0.5)] transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                >
                    {status === 'processing' ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Création de la mission...
                        </>
                    ) : status === 'paying' ? (
                        <>
                            <Lock className="w-4 h-4" />
                            Sécurisation du paiement...
                        </>
                    ) : (
                        <>
                            <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            LANCER LA MISSION
                        </>
                    )}
                </button>
            </form>
        </div>

        <div className="mt-8 flex justify-center gap-6 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
             <div className="flex items-center gap-1 text-xs text-red-200">
                <ShieldCheck className="w-4 h-4" />
                <span>Paiement Sécurisé</span>
             </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
