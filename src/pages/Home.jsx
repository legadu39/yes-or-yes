import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Eye, Sparkles, Copy, Heart, LockKeyhole, TrendingUp, CreditCard, 
  Timer, Loader2, History, AlertTriangle, Check, Share2, RefreshCw
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
    getOwnedInvitations 
  } = useApp();

  const [formData, setFormData] = useState({ sender: '', valentine: '', plan: 'spy' });
  const [generatedLinks, setGeneratedLinks] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, processing, paying, verifying, success, error
  const [activeNotif, setActiveNotif] = useState(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  // --- INTELLIGENCE : PERSISTANCE DU BROUILLON ---
  useEffect(() => {
    const draft = localStorage.getItem('draft_invitation');
    if (draft && status === 'idle') {
      try {
        setFormData(JSON.parse(draft));
      } catch (e) {
        localStorage.removeItem('draft_invitation');
      }
    }
  }, []);

  useEffect(() => {
    if (status === 'idle') {
      localStorage.setItem('draft_invitation', JSON.stringify(formData));
    }
  }, [formData, status]);

  // --- LOGIQUE PRINCIPALE DE RETOUR PAIEMENT (INTELLIGENCE CONTEXTUELLE) ---
  useEffect(() => {
    const owned = getOwnedInvitations();
    if (owned.length > 0) setHasHistory(true);

    // 1. Récupération des paramètres d'URL
    // 'client_reference_id' est souvent renvoyé par Stripe comme paramètre si configuré
    const urlId = searchParams.get('payment_id') || searchParams.get('id') || searchParams.get('client_reference_id');
    const sessionId = searchParams.get('session_id'); // ID de session Stripe
    const fromStripe = searchParams.get('success') === 'true';
    const stateParam = searchParams.get('state');

    // Cas 1 : Retour standard avec ID (Idéal)
    if (urlId && !generatedLinks) {
      if (fromStripe || stateParam) {
        handlePaymentReturn(urlId, owned, stateParam);
      } else {
        // Accès direct : on vérifie juste si c'est payé
        verifyPaymentStatus(urlId).then(isPaid => {
          if (isPaid) {
            const foundLocal = owned.find(i => i.id === urlId);
            displaySuccess({ id: urlId, ...foundLocal }, foundLocal?.token);
          }
        });
      }
    }
    // Cas 2 : Retour Stripe SANS ID (Problème fréquent sur Mobile/Cross-Browser)
    else if (fromStripe && !urlId && !generatedLinks) {
       console.log("⚠️ Retour Stripe sans ID explicite. Tentative de restauration heuristique.");
       // On essaie de restaurer la dernière commande créée localement
       restoreLastOrder();
    }
    // Cas 3 : Polling automatique si commande récente (< 10 min) en attente
    else if (!generatedLinks && owned.length > 0 && status === 'idle') {
      const lastOrder = owned[0]; // Le plus récent (car on unshift)
      const diff = new Date() - new Date(lastOrder.createdAt);
      if (diff < 10 * 60 * 1000) { // 10 minutes
        verifyPaymentStatus(lastOrder.id).then(isPaid => {
          if (isPaid) displaySuccess(lastOrder, lastOrder.token);
        });
      }
    }
  }, [searchParams]);

  const preloadAssets = () => {
    if (window.hasPreloaded) return;
    const audio = new Audio('/assets/music.ogg');
    audio.load();
    window.hasPreloaded = true;
  };

  // --- TRAITEMENT DU RETOUR PAIEMENT ---
  const handlePaymentReturn = async (paymentId, owned, stateParam) => {
    console.log("Traitement retour paiement pour:", paymentId);
    
    // 1. Récupération Cross-Boundary via State (Priorité 1)
    let foundToken = null;
    let recoveredData = null;

    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(stateParam));
        if (decoded.t && decoded.id === paymentId) {
          foundToken = decoded.t;
          recoveredData = { sender: decoded.s, valentine: decoded.v };
          
          // Réparation mémoire locale (Auto-Healing)
          repairLocalMemory(paymentId, foundToken, recoveredData);
        }
      } catch (e) {
        console.error("Échec décodage state URL", e);
      }
    }

    // 2. Fallback LocalStorage (Priorité 2)
    const foundLocal = owned.find(i => i.id === paymentId);
    if (!foundToken && foundLocal) {
        foundToken = foundLocal.token;
        recoveredData = foundLocal;
    }

    // 3. UI Optimiste
    if (foundToken) {
      displaySuccess({
        id: paymentId,
        sender: recoveredData?.sender || "Vous",
        valentine: recoveredData?.valentine || "...",
        plan: 'spy'
      }, foundToken);
      
      // Vérification silencieuse en arrière-plan
      verifyBackgroundSilent(paymentId, foundToken);
    } else {
      // Si on a perdu le token, on doit attendre la validation serveur pour afficher au moins le lien public
      waitForServerValidation(paymentId, foundLocal);
    }
  };

  const repairLocalMemory = (id, token, data) => {
    const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
    if (!stored.find(i => i.id === id)) {
       const newEntry = { id, token, createdAt: new Date().toISOString(), ...data };
       const newList = [newEntry, ...stored];
       localStorage.setItem('yesoryes_owned', JSON.stringify(newList));
       console.log("🔧 Mémoire locale réparée via URL State");
    }
  };

  const verifyBackgroundSilent = async (paymentId, token) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      const fullInvite = await getSpyReport(paymentId, token);
      if (fullInvite) {
        localStorage.removeItem('draft_invitation');
      } else if (attempts < 5) {
        setTimeout(poll, 3000);
      }
    };
    poll();
  };

  // --- WATCHDOG : VALIDATION ACTIVE ET RÉSILIENTE ---
  const waitForServerValidation = async (paymentId, foundLocal) => {
    setStatus('verifying');
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // Étendu pour laisser le temps au webhook
    let delay = 2000;

    const poll = async () => {
      attempts++;
      console.log(`📡 Watchdog: Vérification status... (Essai ${attempts})`);
      
      const isPaid = await verifyPaymentStatus(paymentId);
      
      if (isPaid) {
        console.log("✅ Paiement confirmé !");
        localStorage.removeItem('draft_invitation');
        
        if (foundLocal && foundLocal.token) {
          const fullInvite = await getSpyReport(paymentId, foundLocal.token);
          displaySuccess(fullInvite || foundLocal, foundLocal.token);
        } else {
          // Cas où on a perdu le token (appareil différent sans state)
          displayMinimalSuccess(paymentId);
          alert("Paiement validé ! Votre navigateur sécurisé a changé, nous affichons le lien public.");
        }
      } else if (attempts < MAX_ATTEMPTS) {
        // Backoff progressif pour ne pas spammer
        delay = Math.min(delay * 1.1, 5000); 
        setTimeout(poll, delay);
      } else {
        // TIMEOUT : Au lieu de fail, on propose une action manuelle
        setStatus('verifying_long'); // Nouvel état UI
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
    
    setGeneratedLinks({
      valentine: `${window.location.origin}/v/${invite.id}`,
      spy: (token && (invite.plan === 'spy' || !invite.plan))
        ? `${window.location.origin}/spy/${invite.id}?token=${token}` 
        : null
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
        alert("Impossible de retrouver la commande automatiquement. Vérifiez vos emails.");
        setStatus('idle');
        return;
    }

    setStatus('verifying');
    const lastOrder = owned[0]; // Le plus récent
    
    // On relance la vérification sur le dernier ID connu
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
      console.log("Invitation initiée:", id);

      setStatus('paying');

      // Encodage du state pour récupération cross-browser
      const statePayload = btoa(JSON.stringify({ t: token, id: id, s: formData.sender, v: formData.valentine }));
      
      // Construction URL de retour robuste
      // On demande explicitement le retour de client_reference_id
      const returnUrl = encodeURIComponent(`${window.location.origin}?payment_id=${id}&success=true&state=${statePayload}`);
      
      const stripeUrl = formData.plan === 'spy' ? STRIPE_LINKS.spy : STRIPE_LINKS.basic;
      
      // Redirection
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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 animate-fade-in relative z-10">
        <div className="card-valentine p-10 max-w-lg w-full text-center relative overflow-hidden">
          <Heart className="absolute -top-10 -left-10 w-40 h-40 text-ruby-light opacity-10 pointer-events-none" />
          
          <div className="inline-block mb-4">
            <Sparkles className="w-8 h-8 text-rose-gold animate-pulse-slow" />
          </div>
          
          <h2 className="text-5xl font-script text-rose-pale mb-4">Invitation Prête</h2>
          <p className="text-cream/80 mb-8 italic font-light">
            Le destin de {formData.valentine} est entre vos mains.
          </p>

          <div className="bg-ruby-dark/30 border border-rose-gold/30 p-1 rounded-xl mb-6 relative group text-left">
            <div className="p-4 backdrop-blur-sm rounded-lg">
              <p className="text-[10px] text-rose-gold uppercase tracking-widest mb-2 font-medium flex items-center gap-2">
                <Heart size={10} fill="currentColor" /> Lien pour {formData.valentine}
              </p>
              <div className="text-cream font-mono text-xs sm:text-sm break-all select-all opacity-90 pr-8">
                {generatedLinks.valentine}
              </div>
            </div>
            <button 
              onClick={() => handleShare(generatedLinks.valentine, 'valentine')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-rose-gold hover:text-cream hover:bg-ruby-light/20 rounded-full transition"
            >
              {copiedField === 'valentine' ? <Check size={16} className="text-green-400" /> : <Share2 size={16} />}
            </button>
          </div>

          {generatedLinks.spy ? (
            <div className="bg-gradient-to-r from-ruby-dark/40 to-[#2C050D] border border-rose-gold/20 p-1 rounded-xl mb-8 relative group text-left">
              <div className="p-4 backdrop-blur-sm rounded-lg">
                <p className="text-[10px] text-rose-gold uppercase tracking-widest mb-2 font-medium flex items-center gap-2">
                  <LockKeyhole size={10} /> VOTRE Lien Espion Privé
                </p>
                <div className="text-cream/70 font-mono text-xs sm:text-sm break-all select-all opacity-90 pr-8">
                  {generatedLinks.spy}
                </div>
              </div>
              <button 
                onClick={() => handleShare(generatedLinks.spy, 'spy')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-rose-gold hover:text-cream hover:bg-ruby-light/20 rounded-full transition"
              >
                {copiedField === 'spy' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
          ) : (
            <div className="mb-8 text-xs text-rose-gold/50 italic border border-rose-gold/10 p-2 rounded">
              Note : Lien espion non affiché (Mode récupération ou Plan Basic).
            </div>
          )}

          <div className="flex flex-col gap-3">
             <a href={generatedLinks.valentine} target="_blank" rel="noreferrer" className="btn-ruby py-3 rounded-lg font-medium text-xs uppercase flex items-center justify-center gap-2">
              <Eye size={14} /> Tester l'expérience
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center relative overflow-x-hidden pt-16">
      <div className="fixed top-0 left-0 w-full bg-ruby-dark/95 border-b border-rose-gold/30 backdrop-blur-md z-50 py-2 px-4 flex justify-center items-center gap-3">
        <Timer size={14} className="text-rose-gold animate-pulse" />
        <p className="text-xs md:text-sm text-cream font-medium tracking-wide">
          Faites votre demande avant le <span className="text-rose-gold font-bold">14 Février</span>.
        </p>
      </div>

      {hasHistory && status === 'idle' && (
        <button onClick={restoreLastOrder} className="absolute top-20 right-6 text-rose-gold/50 hover:text-rose-gold text-xs uppercase tracking-widest flex items-center gap-2 transition-colors z-40">
          <History size={12} /> Restaurer
        </button>
      )}

      <header className="text-center mb-10 relative z-10">
        <h1 className="text-7xl md:text-8xl font-script text-rose-pale mb-4 drop-shadow-lg">YesOrYes</h1>
        <p className="text-rose-gold text-lg font-serif italic tracking-wider">L'élégance d'une demande irréfusable.</p>
      </header>

      <main className="card-valentine w-full max-w-2xl p-8 md:p-12 z-10 relative mb-10">
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
              {/* Plan Basic */}
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

              {/* Plan Spy */}
              <div 
                onClick={() => status === 'idle' && setFormData({...formData, plan: 'spy'})}
                className={`relative cursor-pointer rounded-xl border transition-all duration-300 overflow-hidden ${formData.plan === 'spy' ? 'bg-gradient-to-br from-ruby-DEFAULT/30 to-ruby-dark/30 border-rose-gold shadow-rosegold scale-105' : 'bg-transparent border-rose-gold/20 hover:border-rose-gold/50'} ${status !== 'idle' ? 'opacity-50' : ''}`}
              >
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

          <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-lg flex items-start gap-3">
            <AlertTriangle className="text-orange-400 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-orange-200/80 leading-relaxed">
             <strong>Conseil :</strong> Ne changez pas de navigateur pendant le paiement pour conserver votre accès secret.
            </p>
          </div>

          <button 
            type="submit" 
            disabled={status !== 'idle' && status !== 'verifying_long'}
            className="w-full btn-ruby py-4 rounded-lg tracking-[0.2em] text-sm uppercase font-medium transition-all shadow-lg hover:shadow-rose-gold/20 relative overflow-hidden"
          >
            {status === 'idle' && <span className="flex items-center justify-center gap-3">Sceller l'invitation <Heart size={16} fill="currentColor" /></span>}
            {status === 'processing' && <span className="flex items-center justify-center gap-3 animate-pulse">Création...</span>}
            {status === 'paying' && <span className="flex items-center justify-center gap-3"><CreditCard size={16} className="animate-bounce" /> Redirection...</span>}
            {status === 'verifying' && <span className="flex items-center justify-center gap-3"><Loader2 size={16} className="animate-spin" /> Validation Bancaire...</span>}
            {status === 'verifying_long' && <span className="flex items-center justify-center gap-3"><RefreshCw size={16} /> C'est long... Vérifier manuellement</span>}
            {status === 'error' && <span>Erreur - Réessayer</span>}
          </button>
        </form>
      </main>

      {/* Notifications */}
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