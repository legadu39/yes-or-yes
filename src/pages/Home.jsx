import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Eye, Sparkles, Copy, Heart, TrendingUp, CreditCard, 
  Timer, Loader2, Check, Shield, RefreshCw
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
    getSpyReport, 
    verifyPaymentStatus, 
    getPublicInvitation, 
    getOwnedInvitations,
    ownedInvitations,
    saveDraft, 
    recoverDraft
  } = useApp();

  const [formData, setFormData] = useState({ sender: '', valentine: '', plan: 'spy' });
  const [generatedLinks, setGeneratedLinks] = useState(null);
  const [status, setStatus] = useState('idle'); 
  const [activeNotif, setActiveNotif] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // --- INTELLIGENCE : PERSISTANCE ANTI-AMNÉSIE ---
  useEffect(() => {
    // Tentative de récupération au chargement
    if (status === 'idle') {
        const draft = recoverDraft();
        if (draft) {
            setFormData(draft);
        }
    }
  }, []);

  useEffect(() => {
    // Sauvegarde automatique à chaque changement
    if (status === 'idle') {
        saveDraft(formData);
    }
  }, [formData, status, saveDraft]);

  // --- LOGIQUE RETOUR PAIEMENT (SMART RECOVERY) ---
  useEffect(() => {
    const urlId = searchParams.get('payment_id') || searchParams.get('id') || searchParams.get('client_reference_id');
    const fromStripe = searchParams.get('success') === 'true';
    const stateParam = searchParams.get('state');

    if (urlId && !generatedLinks) {
      if (fromStripe || stateParam) {
        handlePaymentReturn(urlId, stateParam);
      } else {
        // Cas : L'utilisateur revient plus tard ou rafraîchit la page de succès
        handleBackgroundCheck(urlId);
      }
    }
    else if (fromStripe && !urlId && !generatedLinks) {
       console.log("⚠️ Retour Stripe sans ID explicite. Tentative de restauration heuristique.");
       restoreLastOrder();
    }
  }, [searchParams]);

  const preloadAssets = () => {
    if (window.hasPreloaded) return;
    const audio = new Audio('/assets/music.ogg');
    audio.load();
    window.hasPreloaded = true;
  };

  const handleBackgroundCheck = async (urlId) => {
    const isPaid = await verifyPaymentStatus(urlId);
    if (isPaid) {
        // On récupère la vérité depuis le serveur
        const serverData = await getPublicInvitation(urlId);
        const owned = getOwnedInvitations();
        const foundLocal = owned.find(i => i.id === urlId);
        
        // Fusion intelligente des données
        const finalData = { ...foundLocal, ...serverData, id: urlId };
        displaySuccess(finalData, foundLocal?.token);
    }
  };

  const handlePaymentReturn = async (paymentId, stateParam) => {
    console.log("Traitement retour paiement pour:", paymentId);
    
    // 1. Récupération contexte local (Token Admin)
    const owned = getOwnedInvitations();
    let foundToken = null;
    let recoveredData = null;

    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(stateParam));
        if (decoded.t && decoded.id === paymentId) {
          foundToken = decoded.t;
          recoveredData = { sender: decoded.s, valentine: decoded.v };
          repairLocalMemory(paymentId, foundToken, { ...recoveredData, plan: decoded.p });
        }
      } catch (e) {
        console.error("Échec décodage state URL", e);
      }
    }

    // Tentative 1 : Recherche avec l'ID reçu (marche si UUID, échoue si ID Stripe)
    const foundLocal = owned.find(i => i.id === paymentId);
    if (!foundToken && foundLocal) {
        foundToken = foundLocal.token;
        recoveredData = foundLocal;
    }

    // 2. VÉRITÉ UNIQUE : Interrogation immédiate du serveur
    try {
        const serverData = await getPublicInvitation(paymentId);
        
        if (serverData && serverData.payment_status === 'paid') {
            console.log("✅ Confirmation serveur reçue. Plan:", serverData.plan);
            
            // --- FIX CRITIQUE : RÉCONCILIATION D'ID (Stripe ID -> UUID) ---
            // Si paymentId est un ID Stripe (cs_...), on n'a pas trouvé le token à l'étape 1.
            // On utilise l'ID réel renvoyé par le serveur (serverData.id) pour retrouver le token.
            if (!foundToken) {
                const realLocal = owned.find(i => i.id === serverData.id);
                if (realLocal) {
                    console.log("🔑 Token retrouvé via UUID:", serverData.id);
                    foundToken = realLocal.token;
                }
            }
            // -------------------------------------------------------------
            
            // Mise à jour de la donnée locale avec la vérité serveur
            const finalInvite = {
                id: serverData.id, // On force l'UUID réel
                sender: serverData.sender || recoveredData?.sender || "Vous",
                valentine: serverData.valentine || recoveredData?.valentine || "...",
                plan: serverData.plan // Le plan Spy est ici
            };

            // Sauvegarde de la correction
            repairLocalMemory(finalInvite.id, foundToken, finalInvite);

            displaySuccess(finalInvite, foundToken);
            verifyBackgroundSilent(finalInvite.id, foundToken);
        } else {
            // Si pas encore payé en DB (latence Webhook), on attend
            // On passe l'objet le plus complet possible pour le polling
            waitForServerValidation(paymentId, { ...recoveredData, id: paymentId });
        }
    } catch (e) {
        console.warn("Erreur fetch serverData, fallback polling", e);
        waitForServerValidation(paymentId, foundLocal);
    }
  };

  const repairLocalMemory = (id, token, data) => {
    const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
    // On met à jour l'entrée existante ou on en crée une nouvelle
    const filtered = stored.filter(i => i.id !== id);
    const newEntry = { id, token, createdAt: new Date().toISOString(), ...data };
    const newList = [newEntry, ...filtered];
    localStorage.setItem('yesoryes_owned', JSON.stringify(newList));
  };

  const verifyBackgroundSilent = async (paymentId, token) => {
    // Juste pour préchauffer le cache ou vérifier les données
    if (token) await getSpyReport(paymentId, token);
    localStorage.removeItem('draft_invitation');
  };

  // --- POLLING ADAPTATIF (Backoff Exponentiel) ---
  const waitForServerValidation = async (paymentId, contextData) => {
    setStatus('verifying');
    let attempt = 0;
    const maxAttempts = 25;
    
    // Suite de délais progressive : 1s, 1s, 2s, 2s, 3s, 3s, 5s...
    const delays = [1000, 1000, 2000, 2000, 3000, 3000, 5000];

    const poll = async () => {
      attempt++;
      console.log(`Polling tentative ${attempt}...`);
      
      // On récupère l'objet complet pour vérifier le plan
      const serverData = await getPublicInvitation(paymentId);
      
      if (serverData && serverData.payment_status === 'paid') {
        localStorage.removeItem('draft_invitation');
        
        // --- FIX POLLING : ID RECOVERY ---
        let finalToken = contextData?.token;
        if (!finalToken) {
             // Dernière chance : chercher le token avec le vrai ID serveur
             const owned = getOwnedInvitations();
             const realLocal = owned.find(i => i.id === serverData.id);
             if (realLocal) finalToken = realLocal.token;
        }
        // ---------------------------------

        const finalData = {
            ...contextData,
            id: serverData.id,
            plan: serverData.plan
        };
        
        if (finalToken) {
            repairLocalMemory(serverData.id, finalToken, finalData);
        }

        displaySuccess(finalData, finalToken);

      } else if (attempt < maxAttempts) {
        // Choix du délai adaptatif
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
    
    console.log("🎉 Affichage Succès. Plan:", invite.plan);

    setFormData({ 
        sender: invite.sender || "Vous", 
        valentine: invite.valentine || "...", 
        plan: invite.plan || 'spy' 
    });
    
    // FILTRE STRICT : Le lien espion ne s'affiche QUE pour le plan SPY/PREMIUM
    const showSpyLink = token && (invite.plan === 'spy' || invite.plan === 'premium');

    setGeneratedLinks({
      valentine: `${window.location.origin}/v/${invite.id}`,
      spy: showSpyLink ? `${window.location.origin}/spy/${invite.id}?token=${token}` : null
    });
    
    setStatus('success');
  };

  const displayMinimalSuccess = (id) => {
    setGeneratedLinks({
      valentine: `${window.location.origin}/v/${id}`,
      spy: null
    });
    setStatus('success');
  };

  const restoreLastOrder = async () => {
    const owned = getOwnedInvitations();
    if (owned.length === 0) {
        alert("Impossible de retrouver la commande automatiquement.");
        setStatus('idle');
        return;
    }
    const lastOrder = owned[0];
    waitForServerValidation(lastOrder.id, lastOrder);
  };

  // --- UI INTERNALS ---
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

      // CRITIQUE : On ajoute le PLAN ('p') dans l'état encodé pour l'avoir au retour
      const statePayload = btoa(JSON.stringify({ 
        t: token, 
        id: id, 
        s: formData.sender, 
        v: formData.valentine,
        p: formData.plan 
      }));
      
      const returnUrl = encodeURIComponent(`${window.location.origin}?payment_id=${id}&success=true&state=${statePayload}`);
      const stripeUrl = (formData.plan === 'spy' || formData.plan === 'premium') ? STRIPE_LINKS.spy : STRIPE_LINKS.basic;
      
      // MODE PRODUCTION (Activé pour le lancement commercial)
      window.location.href = `${stripeUrl}?client_reference_id=${id}&redirect_url=${returnUrl}`;

      // MODE TEST (Désactivé)
      /*
      console.log("🚧 MODE TEST: Bypass Stripe activé.");
      const fakeReturnUrl = `${window.location.origin}?payment_id=${id}&success=true&state=${statePayload}`;
      setTimeout(() => { window.location.href = fakeReturnUrl; }, 1500);
      */

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

  // --- RENDER ---
  if (status === 'success' && generatedLinks) {
    return (
      <div className="min-h-screen bg-ruby-dark flex flex-col items-center justify-center p-6 animate-fade-in relative z-10">
        <div className="max-w-2xl w-full bg-ruby-DEFAULT/10 backdrop-blur-md border border-rose-gold/20 rounded-3xl p-8 text-center shadow-2xl">
          
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <Check className="text-green-400 w-8 h-8" />
            </div>
          </div>

          <h2 className="text-3xl font-script text-rose-pale mb-2">Invitation Prête</h2>
          <p className="text-rose-pale/60 mb-8">Le destin de {formData.valentine} est entre vos mains.</p>

          {/* LIEN PUBLIC (Toujours visible) */}
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
          </div>

          {/* LIEN ESPION (Toujours visible si un token existe, libellé adapté au plan) */}
          {generatedLinks.spy ? (
            <div className="bg-black/40 rounded-xl p-6 mb-8 border border-purple-500/30 relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-purple-500/20 px-3 py-1 rounded-bl-lg text-[10px] text-purple-300 uppercase tracking-widest font-bold border-l border-b border-purple-500/20">
                Privé
              </div>
              
              <h3 className="text-purple-300 font-serif mb-4 flex items-center justify-center gap-2">
                <Shield size={18} />
                {/* LIBELLÉ DYNAMIQUE SELON LE PLAN */}
                {formData.plan === 'spy' || formData.plan === 'premium' 
                    ? 'Votre Tableau de Bord Espion'
                    : 'Suivre la réponse (Statistiques)'
                }
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
                      <Eye size={14} /> 
                      {formData.plan === 'spy' || formData.plan === 'premium'
                          ? 'Ouvrir le Dashboard'
                          : 'Voir les Statistiques'
                      }
                  </button>
              </div>
            </div>
          ) : (
            <div className="mb-8 text-xs text-rose-gold/50 italic border border-rose-gold/10 p-2 rounded">
              Note : Vous avez choisi le pack Essentiel (pas de tableau de bord).
            </div>
          )}

          <button 
            onClick={() => {
                setStatus('idle');
                setGeneratedLinks(null);
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

  // ÉCRAN D'ACCUEIL
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
        <h1 className="text-7xl md:text-8xl font-script text-rose-pale mb-4 drop-shadow-lg">YesOrYes</h1>
        
        <p className="text-cream/90 text-sm md:text-base font-serif italic mb-6 leading-relaxed border-l-2 border-rose-gold/50 pl-4 py-2 bg-ruby-light/10 rounded-r-lg shadow-lg">
          Envoyez le lien. Le bouton "NON" s'enfuira quand elle essaiera de cliquer. <br/>
          <span className="text-rose-gold/70 text-xs uppercase tracking-widest not-italic font-bold">
            (Regardez-la galérer...)
          </span>
        </p>

        <p className="text-rose-gold text-lg font-serif italic tracking-wider opacity-80">L'élégance d'une demande irréfusable.</p>
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
                  <p className="text-sm text-cream/60 italic font-light">Expérience immersive classique.</p>
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
                      <span className="text-cream font-medium text-lg">L'Exclusif</span>
                    </div>
                    <span className="text-rose-gold font-bold text-lg">2.50€</span>
                  </div>
                  <p className="text-sm text-cream/90 mb-3 italic font-light">Inclut le <strong>Carnet Secret</strong> (suivi en temps réel).</p>
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={status !== 'idle' && status !== 'verifying_long'}
            className="w-full btn-ruby py-4 rounded-lg tracking-[0.2em] text-sm uppercase font-medium transition-all shadow-lg hover:shadow-rose-gold/20 relative overflow-hidden"
          >
            {status === 'idle' && (
                <span className="flex items-center justify-center gap-3">
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

      {/* FOOTER LÉGAL */}
      <footer className="mt-auto py-8 text-center relative z-10 w-full opacity-60 hover:opacity-100 transition-opacity">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 text-[10px] uppercase tracking-widest text-rose-gold/50 font-serif">
            <Link to="/legal/cgv" className="hover:text-rose-gold transition-colors">CGV</Link>
            <Link to="/legal/confidentialite" className="hover:text-rose-gold transition-colors">Confidentialité</Link>
            <Link to="/legal/mentions-legales" className="hover:text-rose-gold transition-colors">Mentions Légales</Link>
            <a href="mailto:contact@yesoryes.com" className="hover:text-rose-gold transition-colors">Contact</a>
        </div>
        <p className="mt-4 text-[9px] text-ruby-light/30">
            YesOrYes © {new Date().getFullYear()} • Fait avec Amour
        </p>
      </footer>

      {activeNotif && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-4 bg-ruby-dark/90 border border-rose-gold/30 backdrop-blur-md px-4 py-3 rounded-lg shadow-xl animate-slide-up max-w-[300px]">
          <div className="bg-rose-gold/20 p-2 rounded-full"><TrendingUp size={16} className="text-rose-gold" /></div>
          <div>
            <p className="text-xs text-rose-pale font-bold">{activeNotif.name}</p>
            <p className="text-[10px] text-cream/80">{activeNotif.action} <span className="opacity-50 mx-1">•</span> {activeNotif.time}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;