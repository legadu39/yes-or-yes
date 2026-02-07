import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Eye, Sparkles, Copy, Heart, LockKeyhole, TrendingUp, CreditCard, Timer, Loader2, History, AlertTriangle, Check, Share2 } from 'lucide-react';

// --- CONFIGURATION PRODUCTION ---
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
  const { createInvitation, getSpyReport, verifyPaymentStatus, getOwnedInvitations, saveOwnedInvitation } = useApp();
  
  const [formData, setFormData] = useState({ sender: '', valentine: '', plan: 'spy' });
  const [generatedLinks, setGeneratedLinks] = useState(null);
  const [status, setStatus] = useState('idle');
  const [activeNotif, setActiveNotif] = useState(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [copiedField, setCopiedField] = useState(null); // Pour le feedback visuel

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

  useEffect(() => {
    if (status === 'success' && generatedLinks) {
       setStatus('idle');
       setGeneratedLinks(null);
    }
  }, [formData.plan]);

  // --- RESTAURATION INTELLIGENTE ET RETOUR PAIEMENT (CROSS-BOUNDARY) ---
  useEffect(() => {
    const owned = getOwnedInvitations();
    if (owned.length > 0) setHasHistory(true);

    const paymentId = searchParams.get('payment_id'); 
    const fromStripe = searchParams.get('success');
    const stateParam = searchParams.get('state');

    // Cas 1 : Retour standard avec paramètres URL
    if (paymentId && fromStripe === 'true' && !generatedLinks) {
        handlePaymentReturn(paymentId, owned, stateParam);
    } 
    // Cas 2 : Retour "silencieux" (Stripe Payment Link sans params)
    else if (!generatedLinks && owned.length > 0 && status === 'idle') {
        const lastOrder = owned[owned.length - 1];
        if (lastOrder.createdAt) {
            const diff = new Date() - new Date(lastOrder.createdAt);
            // Si moins de 15 minutes, on tente une vérif auto
            if (diff < 15 * 60 * 1000) {
                 verifyPaymentStatus(lastOrder.id).then(isPaid => {
                     if (isPaid) {
                         restoreLastOrder();
                     }
                 });
            }
        }
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const preloadAssets = () => {
    if (window.hasPreloaded) return;
    const audio = new Audio('/assets/music.ogg'); 
    audio.load();
    window.hasPreloaded = true;
    console.log("⚡ Assets pré-chargés en anticipation");
  };

  const handlePaymentReturn = async (paymentId, owned, stateParam) => {
    // INTELLIGENCE : RÉCUPÉRATION CROSS-BOUNDARY (N°1)
    let foundToken = null;
    let recoveredData = null;

    // A. Essai via LocalStorage
    const foundLocal = owned.find(i => i.id === paymentId);
    if (foundLocal) {
        foundToken = foundLocal.token;
    }

    // B. Essai via URL State (Méthode Résiliente)
    if (!foundToken && stateParam) {
        try {
            const decoded = JSON.parse(atob(stateParam));
            if (decoded.t && decoded.id === paymentId) {
                foundToken = decoded.t;
                recoveredData = { sender: decoded.s, valentine: decoded.v };
                console.log("🔄 Session restaurée via URL cross-boundary");
                
                // On répare la mémoire locale pour le futur
                const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
                if (!stored.find(i => i.id === paymentId)) {
                    const newEntry = { id: paymentId, token: foundToken, createdAt: new Date().toISOString() };
                    localStorage.setItem('yesoryes_owned', JSON.stringify([...stored, newEntry]));
                }
            }
        } catch (e) {
            console.error("Échec décodage state URL", e);
        }
    }

    // INTELLIGENCE : UI OPTIMISTE (N°2)
    if (foundToken) {
        const optimisticInvite = {
            id: paymentId,
            sender: recoveredData?.sender || (foundLocal ? "Vous" : "..."), 
            valentine: recoveredData?.valentine || "...", 
            plan: "spy" 
        };
        
        displaySuccess(optimisticInvite, foundToken);
        verifyBackgroundSilent(paymentId, foundToken);
    } else {
        waitForServerValidation(paymentId, foundLocal);
    }
  };

  const verifyBackgroundSilent = async (paymentId, token) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 10;
      
      const poll = async () => {
          attempts++;
          const fullInvite = await getSpyReport(paymentId, token);
          if (fullInvite) {
              localStorage.removeItem('draft_invitation');
          } else if (attempts < MAX_ATTEMPTS) {
              setTimeout(poll, 3000);
          }
      };
      poll();
  };

  const waitForServerValidation = async (paymentId, foundLocal) => {
    setStatus('verifying');
    
    let attempts = 0;
    const MAX_ATTEMPTS = 15;
    let delay = 1000; 

    const poll = async () => {
        attempts++;
        // NOTE : verifyPaymentStatus vérifie maintenant que le payment_status est 'paid'
        const isPaid = await verifyPaymentStatus(paymentId);
        
        if (isPaid) {
            localStorage.removeItem('draft_invitation');

            if (foundLocal && foundLocal.token) {
                const fullInvite = await getSpyReport(paymentId, foundLocal.token);
                if (fullInvite) {
                    displaySuccess(fullInvite, foundLocal.token);
                } else {
                    displayMinimalSuccess(paymentId, "unknown");
                }
            } else {
                console.warn("Paiement validé mais token local introuvable.");
                displayMinimalSuccess(paymentId, "unknown");
                alert("Paiement validé ! Note : Nous ne retrouvons pas votre clé secrète. Vous avez accès au lien public uniquement.");
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (attempts < MAX_ATTEMPTS) {
            delay = Math.min(delay * 1.2, 4000);
            setTimeout(poll, delay);
        } else {
            setStatus('error');
            alert("Le paiement est validé mais le serveur met du temps. Rechargez la page.");
        }
    };
    poll();
  };

  const displaySuccess = (invite, token) => {
    if (invite.sender && invite.sender !== "...") {
         setFormData({ 
            sender: invite.sender, 
            valentine: invite.valentine, 
            plan: invite.plan 
        });
    }
    
    setGeneratedLinks({
        valentine: `${window.location.origin}/v/${invite.id}`,
        // Avec la nouvelle sécurité, le lien Spy nécessite obligatoirement un token
        spy: (invite.plan === 'spy' || !invite.plan) ? `${window.location.origin}/spy/${invite.id}?token=${token}` : null,
    });
    setStatus('success');
  };

  const displayMinimalSuccess = (id, plan) => {
      setGeneratedLinks({
        valentine: `${window.location.origin}/v/${id}`,
        spy: null
      });
      setStatus('success');
  };

  const restoreLastOrder = async () => {
      const owned = getOwnedInvitations();
      if (owned.length === 0) return;
      
      setStatus('verifying');
      const lastOrder = owned[owned.length - 1]; 
      
      const invite = await getSpyReport(lastOrder.id, lastOrder.token);
      
      if (invite) {
          displaySuccess(invite, lastOrder.token);
      } else {
          setStatus('idle');
          alert("Impossible de retrouver la commande (Token expiré ou invalide).");
      }
  };

  useEffect(() => {
    const showNotification = () => {
      const randomNotif = FAKE_NOTIFICATIONS[Math.floor(Math.random() * FAKE_NOTIFICATIONS.length)];
      setActiveNotif(randomNotif);
      setTimeout(() => setActiveNotif(null), 6000);
    };
    const initialTimer = setTimeout(showNotification, 2000);
    const intervalTimer = setInterval(showNotification, 18000);
    return () => { clearTimeout(initialTimer); clearInterval(intervalTimer); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.sender.trim() || !formData.valentine.trim()) return;
    
    setStatus('processing');
    
    try {
      const { id, token } = await createInvitation(formData.sender.trim(), formData.valentine.trim(), formData.plan);
      
      if (!id || !token) throw new Error("Erreur lors de la génération des clés");

      setStatus('paying');
      
      // INTELLIGENCE : SÉCURISATION DU RETOUR
      const statePayload = btoa(JSON.stringify({ 
          t: token, 
          id: id,
          s: formData.sender,
          v: formData.valentine
      }));
      
      const returnUrl = encodeURIComponent(`${window.location.origin}/?payment_id=${id}&success=true&state=${statePayload}`);
      const stripeUrl = formData.plan === 'spy' ? STRIPE_LINKS.spy : STRIPE_LINKS.basic;

      window.location.href = `${stripeUrl}?client_reference_id=${id}&redirect_url=${returnUrl}`; 

    } catch (error) {
      console.error("Erreur critique:", error);
      setStatus('error');
      alert("Une erreur technique est survenue. Veuillez réessayer.");
    }
  };

  const handleShare = async (text, field) => {
    if (navigator.share && navigator.canShare) {
        try {
            await navigator.share({
                title: 'Pour toi 🌹',
                text: field === 'valentine' ? `J'ai quelque chose d'important à te demander...` : 'Mon accès secret',
                url: text
            });
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                copyToClipboard(text, field);
            }
        }
    } else {
        copyToClipboard(text, field);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleInputBlur = (field) => {
      const currentVal = formData[field];
      if (!currentVal) return;

      const formatted = currentVal
        .trim()
        .toLowerCase()
        .replace(/(?:^|\s|-)\S/g, (a) => a.toUpperCase());

      setFormData(prev => ({ ...prev, [field]: formatted }));
  };

  const handleInputChange = (field, value) => {
      const cleanValue = value.replace(/\s\s+/g, ' ');
      setFormData(prev => ({ ...prev, [field]: cleanValue }));
  };


  if (status === 'success' && generatedLinks) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 animate-fade-in relative z-10">
        <div className="card-valentine p-10 max-w-lg w-full text-center relative overflow-hidden">
          <Heart className="absolute -top-10 -left-10 w-40 h-40 text-ruby-light opacity-10 pointer-events-none" />
          <Heart className="absolute -bottom-10 -right-10 w-40 h-40 text-ruby-light opacity-10 pointer-events-none" />
          
          <div className="inline-block mb-4">
            <Sparkles className="w-8 h-8 text-rose-gold animate-pulse-slow" />
          </div>
          
          <h2 className="text-5xl font-script text-rose-pale mb-4">Invitation Prête</h2>
          <p className="text-cream/80 mb-8 italic font-light">
            Le destin de {formData.valentine} est entre vos mains.
          </p>
          
          {/* Lien Valentine */}
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
                title="Partager / Copier"
             >
                {copiedField === 'valentine' ? <Check size={16} className="text-green-400" /> : <Share2 size={16} />}
             </button>
          </div>

          {/* Lien Espion */}
          {generatedLinks.spy ? (
            <div className="bg-gradient-to-r from-ruby-dark/40 to-[#2C050D] border border-rose-gold/20 p-1 rounded-xl mb-8 relative group text-left">
               <div className="p-4 backdrop-blur-sm rounded-lg">
                  <p className="text-[10px] text-rose-gold uppercase tracking-widest mb-2 font-medium flex items-center gap-2">
                    <LockKeyhole size={10} /> VOTRE Lien Espion (Privé)
                  </p>
                  <div className="text-cream/70 font-mono text-xs sm:text-sm break-all select-all opacity-90 pr-8">
                    {generatedLinks.spy}
                  </div>
               </div>
               <button 
                  onClick={() => handleShare(generatedLinks.spy, 'spy')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-rose-gold hover:text-cream hover:bg-ruby-light/20 rounded-full transition"
                  title="Copier"
               >
                  {copiedField === 'spy' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
               </button>
            </div>
          ) : (
            <div className="mb-8 text-xs text-rose-gold/50 italic">
                Lien espion non disponible (Plan Essentiel ou Token perdu)
            </div>
          )}
          
          <div className="flex flex-col gap-3">
            <a 
              href={generatedLinks.valentine} 
              target="_blank" 
              rel="noreferrer"
              className="w-full btn-ruby py-3 rounded-lg font-medium tracking-widest text-xs uppercase no-underline flex items-center justify-center gap-2"
            >
              <Eye size={14} /> Tester l'expérience
            </a>
            
            {generatedLinks.spy && (
                <a 
                  href={generatedLinks.spy} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full py-3 rounded-lg font-medium tracking-widest text-xs uppercase no-underline flex items-center justify-center gap-2 text-rose-gold/70 hover:text-rose-gold transition-colors border border-rose-gold/10 hover:border-rose-gold/30"
                >
                  <LockKeyhole size={14} /> Voir le Dashboard
                </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- VUE : FORMULAIRE ---
  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center relative overflow-x-hidden pt-16">
      
      <div className="fixed top-0 left-0 w-full bg-ruby-dark/95 border-b border-rose-gold/30 backdrop-blur-md z-50 py-2 px-4 flex justify-center items-center gap-3 animate-slide-down">
         <Timer size={14} className="text-rose-gold animate-pulse" />
         <p className="text-xs md:text-sm text-cream font-medium tracking-wide">
            Faites votre demande avant le <span className="text-rose-gold font-bold">14 Février</span>.
         </p>
      </div>

      {hasHistory && status === 'idle' && (
          <button 
            onClick={restoreLastOrder}
            className="absolute top-20 right-6 text-rose-gold/50 hover:text-rose-gold text-xs uppercase tracking-widest flex items-center gap-2 transition-colors z-40"
          >
              <History size={12} /> Retrouver ma commande
          </button>
      )}

      <header className="text-center mb-10 relative z-10">
        <h1 className="text-7xl md:text-8xl font-script text-rose-pale mb-4 drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]">
          YesOrYes
        </h1>
        <p className="text-rose-gold text-lg font-serif italic tracking-wider">
          L'élégance d'une demande irrefusable.
        </p>
      </header>

      <main className="card-valentine w-full max-w-2xl p-8 md:p-12 z-10 relative transition-all duration-500 mb-10">
        <form onSubmit={handleSubmit} className="space-y-10">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="group relative">
              <label className="block text-rose-gold text-xs uppercase tracking-widest mb-2 ml-1">De la part de</label>
              <input 
                required
                type="text" 
                maxLength={20}
                disabled={status !== 'idle'}
                className="w-full p-3 bg-transparent border-b border-rose-gold/30 text-cream text-xl placeholder-cream/20 focus:border-rose-gold outline-none transition-all font-serif italic disabled:opacity-50"
                placeholder="Votre Prénom"
                value={formData.sender}
                onFocus={preloadAssets} 
                onChange={e => handleInputChange('sender', e.target.value)}
                onBlur={() => handleInputBlur('sender')}
              />
              <Heart className="absolute right-2 bottom-3 text-ruby-DEFAULT opacity-0 group-hover:opacity-50 transition-opacity w-4 h-4" />
            </div>
            <div className="group relative">
              <label className="block text-rose-gold text-xs uppercase tracking-widest mb-2 ml-1">Pour</label>
              <input 
                required
                type="text" 
                maxLength={20}
                disabled={status !== 'idle'}
                className="w-full p-3 bg-transparent border-b border-rose-gold/30 text-cream text-xl placeholder-cream/20 focus:border-rose-gold outline-none transition-all font-serif italic disabled:opacity-50"
                placeholder="Son Prénom"
                value={formData.valentine}
                onFocus={preloadAssets}
                onChange={e => handleInputChange('valentine', e.target.value)}
                onBlur={() => handleInputBlur('valentine')}
              />
               <Heart className="absolute right-2 bottom-3 text-ruby-DEFAULT opacity-0 group-hover:opacity-50 transition-opacity w-4 h-4" />
            </div>
          </div>

          <div className="space-y-6 pt-4">
             <div className="flex items-center justify-center gap-4 mb-6">
                <div className="h-px bg-rose-gold/30 flex-1"></div>
                <span className="font-script text-2xl text-rose-pale">Votre Déclaration</span>
                <div className="h-px bg-rose-gold/30 flex-1"></div>
             </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div 
                onClick={() => status === 'idle' && setFormData({...formData, plan: 'basic'})}
                className={`cursor-pointer p-6 rounded-xl border transition-all duration-300 flex flex-col justify-between h-full group ${
                  formData.plan === 'basic' 
                    ? 'bg-ruby-light/10 border-rose-gold shadow-rosegold' 
                    : 'bg-transparent border-rose-gold/20 hover:border-rose-gold/50'
                } ${status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-cream font-medium text-lg">L'Essentiel</span>
                    <span className="text-rose-gold italic text-sm">1.50 €</span>
                  </div>
                  <p className="text-sm text-cream/60 italic font-light leading-relaxed">
                     L'expérience immersive classique. Simple et irrésistible.
                  </p>
                </div>
              </div>

              <div 
                onClick={() => status === 'idle' && setFormData({...formData, plan: 'spy'})}
                className={`relative cursor-pointer rounded-xl border transition-all duration-300 overflow-hidden ${
                  formData.plan === 'spy' 
                    ? 'bg-gradient-to-br from-ruby-DEFAULT/30 to-ruby-dark/30 border-rose-gold shadow-rosegold scale-[1.02]' 
                    : 'bg-transparent border-rose-gold/20 hover:border-rose-gold/50'
                } ${status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                 <div className="absolute top-0 right-0 bg-rose-gold text-ruby-dark text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider z-20 shadow-sm">
                  Recommandé
                </div>
                <div className="absolute inset-0 bg-ruby-dark pointer-events-none opacity-50 z-0"></div>
                <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-ruby-light/20 to-transparent z-0"></div>

                <div className="p-6 relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-gold animate-pulse" />
                      <span className="text-cream font-medium text-lg">L'Exclusif</span>
                    </div>
                    <div className="flex flex-col items-end leading-none">
                      <span className="text-rose-gold/40 text-[10px] line-through decoration-rose-gold/40 mb-1">4.99 €</span>
                      <span className="text-rose-gold font-bold text-lg">2.50 €</span>
                    </div>
                  </div>
                  <p className="text-sm text-cream/90 mb-3 leading-relaxed italic font-light">
                    Inclut le <strong>Carnet Secret</strong>. Découvrez ses hésitations en temps réel.
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-rose-gold/80 uppercase tracking-widest border border-rose-gold/30 rounded px-2 py-1 w-fit bg-ruby-dark/40 backdrop-blur-sm">
                    <LockKeyhole size={10} /> Rapport Espion Inclus
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Alerte de sécurité pour le token */}
          <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-lg flex items-start gap-3">
             <AlertTriangle className="text-orange-400 shrink-0 mt-0.5" size={18} />
             <p className="text-xs text-orange-200/80 leading-relaxed">
               <strong>Important :</strong> Ne changez pas d'appareil ou de navigateur pendant le paiement. 
               Votre clé secrète pour le Dashboard Espion sera générée sur cet appareil.
             </p>
          </div>

          <button 
            type="submit" 
            disabled={status !== 'idle'}
            className="w-full btn-ruby py-4 rounded-lg tracking-[0.2em] text-sm uppercase font-medium transition-all group disabled:opacity-80 disabled:cursor-wait shadow-lg hover:shadow-rose-gold/20 relative overflow-hidden"
          >
            {status === 'idle' && (
              <span className="relative z-10 flex items-center justify-center gap-3">
                Sceller l'invitation
                <Heart size={16} fill="currentColor" className="animate-pulse-slow" />
              </span>
            )}
            {status === 'processing' && (
               <span className="relative z-10 flex items-center justify-center gap-3 animate-pulse">
                 Gravure en cours...
               </span>
            )}
            {status === 'paying' && (
               <span className="relative z-10 flex items-center justify-center gap-3">
                 <CreditCard size={16} className="animate-bounce" /> Paiement Sécurisé...
               </span>
            )}
            {status === 'verifying' && (
               <span className="relative z-10 flex items-center justify-center gap-3">
                 <Loader2 size={16} className="animate-spin" /> Validation Bancaire...
               </span>
            )}
            {status === 'error' && (
               <span className="relative z-10 flex items-center justify-center gap-3">
                 Erreur - Réessayer
               </span>
            )}
          </button>
          
          <p className="text-center text-xs text-rose-gold/60 mt-4 tracking-wider font-light flex items-center justify-center gap-1">
            <LockKeyhole size={10} /> Paiement chiffré SSL
          </p>
        </form>
      </main>

      <footer className="w-full max-w-2xl text-center pb-8 opacity-50 hover:opacity-100 transition-opacity z-10">
          <p className="text-[10px] text-cream uppercase tracking-widest mb-2">
              © {new Date().getFullYear()} YesOrYes. Tous droits réservés.
          </p>
          <div className="flex justify-center gap-4 text-[10px] text-rose-gold">
              <Link to="/legal/mentions-legales" className="cursor-pointer hover:underline text-rose-gold decoration-rose-gold">Mentions Légales</Link>
              <span>|</span>
              <Link to="/legal/cgv" className="cursor-pointer hover:underline text-rose-gold decoration-rose-gold">CGV</Link>
              <span>|</span>
              <Link to="/legal/confidentialite" className="cursor-pointer hover:underline text-rose-gold decoration-rose-gold">Confidentialité</Link>
          </div>
      </footer>
      
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <Heart className="absolute top-20 left-[10%] text-ruby-light opacity-20 w-20 h-20 animate-float blur-[2px]" />
        <Heart className="absolute bottom-40 right-[15%] text-rose-pale opacity-20 w-12 h-12 animate-float delay-1000 blur-[1px]" />
      </div>

      {activeNotif && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-4 bg-ruby-dark/90 border border-rose-gold/30 backdrop-blur-md px-4 py-3 rounded-lg shadow-xl animate-slide-up max-w-[300px]">
          <div className="bg-rose-gold/20 p-2 rounded-full">
            <TrendingUp size={16} className="text-rose-gold" />
          </div>
          <div>
            <p className="text-xs text-rose-pale font-bold flex items-center gap-1">
              {activeNotif.name}
            </p>
            <p className="text-[10px] text-cream/80 leading-tight">
              {activeNotif.action} <span className="opacity-50 mx-1">•</span> {activeNotif.time}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;