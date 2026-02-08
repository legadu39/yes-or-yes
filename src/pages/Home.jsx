import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Eye, Sparkles, Copy, Heart, TrendingUp, CreditCard, Timer, Loader2, Check, Shield, RefreshCw, PartyPopper, AlertTriangle } from 'lucide-react';

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
  const { createInvitation, getSpyReport, verifyPaymentStatus, getPublicInvitation, getOwnedInvitations, ownedInvitations, saveDraft, recoverDraft, repairLocalMemory } = useApp();
  
  const [formData, setFormData] = useState({ sender: '', valentine: '', plan: 'spy' });
  const [generatedLinks, setGeneratedLinks] = useState(null);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [generatedId, setGeneratedId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [activeNotif, setActiveNotif] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [mounted, setMounted] = useState(false);
  
  // --- NOUVEAUTÉ : État pour la notification de réponse (Opportunité #1) ---
  const [answerReceived, setAnswerReceived] = useState(null);
  
  useEffect(() => setMounted(true), []);

  // --- INTELLIGENCE : PERSISTANCE ANTI-AMNÉSIE + PRÉ-REMPLISSAGE (Opportunité #2) ---
  useEffect(() => {
    if (status === 'idle') {
      // 1. Tentative de récupération du brouillon en cours
      const draft = recoverDraft();
      if (draft && (draft.sender || draft.valentine)) {
        setFormData(draft);
        return;
      }
      
      // 2. NOUVEAUTÉ : HEURISTIQUE - Prédiction basée sur l'historique
      const history = getOwnedInvitations();
      if (history && history.length > 0) {
        const lastInvite = history[0];
        
        // Pré-remplissage intelligent : sender + plan préféré
        setFormData(prev => ({
          ...prev,
          sender: lastInvite.sender || prev.sender,
          plan: lastInvite.plan || 'spy'
        }));
        
        console.log("✨ Pré-remplissage intelligent depuis l'historique");
      }
    }
  }, [status, recoverDraft, getOwnedInvitations]);

  useEffect(() => {
    // Sauvegarde automatique à chaque changement
    if (status === 'idle') {
      saveDraft(formData);
    }
  }, [formData, status, saveDraft]);

  // --- NOUVEAUTÉ : POLLING NOTIFICATION PUSH (Opportunité #1) ---
  useEffect(() => {
    if (status !== 'success' || !generatedLinks || !generatedId) return;
    
    let pollingInterval;
    let checkCount = 0;
    const MAX_CHECKS = 40; // 40 × 5s = 3min20s de surveillance
    
    const checkAnswerStatus = async () => {
      checkCount++;
      
      try {
        const data = await getPublicInvitation(generatedId);
        
        // HEURISTIQUE : Détection du changement d'état
        if (data && data.status === 'accepted') {
          clearInterval(pollingInterval);
          
          // Animation de célébration
          triggerVictoryAnimation();
          
          // Mise à jour de l'UI avec notification
          setAnswerReceived({
            valentineName: formData.valentine,
            timestamp: new Date()
          });
          
          // Vibration tactile si disponible
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
          }
        }
        
        // Arrêt automatique après timeout
        if (checkCount >= MAX_CHECKS) {
          clearInterval(pollingInterval);
          console.log("⏱️ Surveillance terminée (timeout)");
        }
        
      } catch (err) {
        console.warn("Erreur polling status", err);
      }
    };
    
    // Démarrage du polling toutes les 5 secondes
    pollingInterval = setInterval(checkAnswerStatus, 5000);
    
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
    
  }, [status, generatedLinks, generatedId, getPublicInvitation, formData.valentine]);

  // --- LOGIQUE RETOUR PAIEMENT (SMART RECOVERY) ---
  useEffect(() => {
    const urlId = searchParams.get('payment_id') || searchParams.get('id') || searchParams.get('client_reference_id');
    const fromStripe = searchParams.get('success') === 'true';
    const stateParam = searchParams.get('state');

    if (urlId && !generatedLinks) {
      if (fromStripe || stateParam) {
        handlePaymentReturn(urlId, stateParam);
      } else {
        handleBackgroundCheck(urlId);
      }
    } else if (fromStripe && !urlId && !generatedLinks) {
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
      const serverData = await getPublicInvitation(urlId);
      const owned = getOwnedInvitations();
      const foundLocal = owned.find(i => i.id === urlId);
      const finalData = { ...foundLocal, ...serverData, id: urlId };
      displaySuccess(finalData, foundLocal?.token);
    }
  };

  const handlePaymentReturn = async (paymentId, stateParam) => {
    console.log("Traitement retour paiement pour:", paymentId);
    
    const owned = getOwnedInvitations();
    let foundToken = null;
    let recoveredData = null;

    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(stateParam));
        if (decoded.t && decoded.id === paymentId) {
          foundToken = decoded.t;
          recoveredData = { sender: decoded.s, valentine: decoded.v };
          repairLocalMemory(paymentId, foundToken, {
            ...recoveredData,
            plan: decoded.p
          });
        }
      } catch (e) {
        console.error("Échec décodage state URL", e);
      }
    }

    const foundLocal = owned.find(i => i.id === paymentId);
    if (!foundToken && foundLocal) {
      foundToken = foundLocal.token;
      recoveredData = foundLocal;
    }

    try {
      const serverData = await getPublicInvitation(paymentId);
      if (serverData && serverData.payment_status === 'paid') {
        console.log("✅ Confirmation serveur reçue. Plan:", serverData.plan);

        if (!foundToken) {
          const realLocal = owned.find(i => i.id === serverData.id);
          if (realLocal) {
            console.log("🔑 Token retrouvé via UUID:", serverData.id);
            foundToken = realLocal.token;
          }
        }

        const finalInvite = {
          id: serverData.id,
          sender: serverData.sender || recoveredData?.sender || "Vous",
          valentine: serverData.valentine || recoveredData?.valentine || "...",
          plan: serverData.plan
        };

        repairLocalMemory(finalInvite.id, foundToken, finalInvite);
        displaySuccess(finalInvite, foundToken);
        verifyBackgroundSilent(finalInvite.id, foundToken);
      } else {
        waitForServerValidation(paymentId, { ...recoveredData, id: paymentId });
      }
    } catch (e) {
      console.warn("Erreur fetch serverData, fallback polling", e);
      waitForServerValidation(paymentId, foundLocal);
    }
  };

  const verifyBackgroundSilent = async (paymentId, token) => {
    if (token) await getSpyReport(paymentId, token);
    localStorage.removeItem('draft_invitation');
  };

  const waitForServerValidation = async (paymentId, contextData) => {
    setStatus('verifying');
    let attempt = 0;
    const maxAttempts = 25;
    const delays = [1000, 1000, 2000, 2000, 3000, 3000, 5000];

    const poll = async () => {
      attempt++;
      console.log(`Polling tentative ${attempt}...`);

      const serverData = await getPublicInvitation(paymentId);
      if (serverData && serverData.payment_status === 'paid') {
        localStorage.removeItem('draft_invitation');

        let finalToken = contextData?.token;
        if (!finalToken) {
          const owned = getOwnedInvitations();
          const realLocal = owned.find(i => i.id === serverData.id);
          if (realLocal) finalToken = realLocal.token;
        }

        const finalData = { ...contextData, id: serverData.id, plan: serverData.plan };
        if (finalToken) {
          repairLocalMemory(serverData.id, finalToken, finalData);
        }
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
    console.log("🎉 Affichage Succès. Plan:", invite.plan);
    
    setFormData({
      sender: invite.sender || "Vous",
      valentine: invite.valentine || "...",
      plan: invite.plan || 'spy'
    });

    const showSpyLink = token && (invite.plan === 'spy' || invite.plan === 'premium');
    
    setGeneratedLinks({
      valentine: `${window.location.origin}/v/${invite.id}`,
      spy: showSpyLink ? `${window.location.origin}/spy/${invite.id}?token=${token}` : null
    });
    
    setGeneratedToken(token);
    setGeneratedId(invite.id);
    setStatus('success');
  };

  const displayMinimalSuccess = (id) => {
    setGeneratedLinks({
      valentine: `${window.location.origin}/v/${id}`,
      spy: null
    });
    setGeneratedId(id);
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

  // --- NOUVEAUTÉ : Animation de victoire (Opportunité #1) ---
  const triggerVictoryAnimation = () => {
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

  // --- UI INTERNALS ---
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

      const { id, token, wasReused } = result;

      setStatus('paying');

      const statePayload = btoa(JSON.stringify({
        t: token,
        id: id,
        s: formData.sender,
        v: formData.valentine,
        p: formData.plan
      }));

      const returnUrl = encodeURIComponent(`${window.location.origin}?payment_id=${id}&success=true&state=${statePayload}`);
      const stripeUrl = (formData.plan === 'spy' || formData.plan === 'premium') ? STRIPE_LINKS.spy : STRIPE_LINKS.basic;

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

  // --- RENDER : SUCCESS STATE ---
  if (status === 'success' && generatedLinks) {
    const history = getOwnedInvitations();
    const uniqueValentines = [...new Set(history.map(h => h.valentine))].filter(v => v !== formData.valentine).slice(0, 3);

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-5 pointer-events-none"></div>
        
        {/* NOUVEAUTÉ : Notification Push Réponse (Opportunité #1) */}
        {answerReceived && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 
                          bg-gradient-to-r from-green-500 to-emerald-600 
                          text-white px-6 py-4 rounded-xl shadow-2xl 
                          animate-bounce max-w-md w-full mx-4">
            <div className="flex items-center gap-3">
              <PartyPopper className="w-6 h-6 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold">🎉 {answerReceived.valentineName} a dit OUI !</p>
                <p className="text-sm opacity-90">
                  Il y a {Math.floor((new Date() - answerReceived.timestamp) / 1000)}s
                </p>
              </div>
            </div>
            {generatedToken && (
              <button 
                onClick={() => navigate(`/spy/${generatedId}?token=${generatedToken}`)}
                className="mt-3 w-full bg-white text-green-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition">
                Voir comment elle a accepté 👀
              </button>
            )}
          </div>
        )}

        <div className="relative z-10 max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="inline-block bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                Invitation Prête
              </p>
            </div>
            <h1 className="text-3xl md:text-4xl font-serif mb-2">Invitation Prête</h1>
            <p className="text-xl text-[#E0B0B6]">
              Le destin de {formData.valentine} est entre vos mains.
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <Heart className="w-6 h-6 text-[#E0B0B6] flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-medium mb-1">Lien pour Alizée</h3>
                  <p className="text-sm text-gray-300 mb-3">
                    Envoyez ce lien à {formData.valentine}
                  </p>
                  <div className="bg-black/30 rounded-lg p-3 font-mono text-sm break-all mb-3">
                    {generatedLinks.valentine}
                  </div>
                  <button
                    onClick={() => handleShare(generatedLinks.valentine, 'valentine')}
                    className="w-full bg-[#D24D57] hover:bg-[#B93E49] px-4 py-2 rounded-lg font-medium transition flex items-center justify-center gap-2">
                    {copiedField === 'valentine' ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copier le lien
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {generatedLinks.spy && (
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-4">
                  <Eye className="w-6 h-6 text-[#FFD700] flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-medium mb-1 flex items-center gap-2">
                      Accès Espion
                      <span className="text-xs bg-[#FFD700] text-black px-2 py-0.5 rounded-full font-bold">SPY</span>
                    </h3>
                    <p className="text-sm text-gray-300 mb-3">
                      Votre lien secret pour suivre la mission
                    </p>
                    <div className="bg-black/30 rounded-lg p-3 font-mono text-sm break-all mb-3">
                      {generatedLinks.spy}
                    </div>
                    <button
                      onClick={() => handleShare(generatedLinks.spy, 'spy')}
                      className="w-full bg-[#FFD700] hover:bg-[#E5C200] text-black px-4 py-2 rounded-lg font-medium transition flex items-center justify-center gap-2">
                      {copiedField === 'spy' ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copié !
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copier le lien espion
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => {
                setGeneratedLinks(null);
                setGeneratedToken(null);
                setGeneratedId(null);
                setAnswerReceived(null);
                setFormData({ sender: formData.sender, valentine: '', plan: formData.plan });
                setStatus('idle');
              }}
              className="text-[#E0B0B6] hover:text-white transition inline-flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Créer une nouvelle invitation
            </button>
          </div>

          <div className="mt-8 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <p className="text-sm text-center text-gray-300">
              <Timer className="w-4 h-4 inline mr-2" />
              Faites votre demande avant le 14 Février.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER : VERIFYING LONG STATE (Opportunité #6) ---
  if (status === 'verifying_long') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center px-4">
        <div className="max-w-xl mx-auto text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
          <h2 className="text-2xl font-bold mb-4">
            ⏳ Validation en cours...
          </h2>
          
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-left space-y-4">
            <p className="text-gray-300">
              Le paiement est en cours de validation par Stripe. 
              Cela peut prendre jusqu'à 2 minutes.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition">
                <RefreshCw className="w-5 h-5" />
                Forcer la vérification
              </button>
              
              <button
                onClick={() => {
                  const context = {
                    timestamp: Date.now(),
                    formData: formData,
                    action: 'awaiting_payment'
                  };
                  localStorage.setItem('recovery_context', JSON.stringify(context));
                  
                  alert("✅ État sauvegardé ! Revenez dans 5 minutes, votre invitation sera prête.");
                  navigate('/');
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg transition">
                Je reviens plus tard
              </button>
              
              <button
                onClick={() => {
                  const debugInfo = {
                    payment_id: searchParams.get('payment_id'),
                    timestamp: new Date().toISOString(),
                    formData: formData
                  };
                  console.log("DEBUG INFO:", debugInfo);
                  navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                  alert("📋 Informations de debug copiées. Contactez le support si le problème persiste.");
                }}
                className="w-full text-gray-400 hover:text-white transition">
                Contacter le support
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER : OTHER STATES (processing, verifying, error, idle) ---
  if (status === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-[#E0B0B6]" />
          <p className="text-xl">Préparation de l'invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'paying') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center">
        <div className="text-center">
          <CreditCard className="w-16 h-16 mx-auto mb-4 text-[#E0B0B6]" />
          <p className="text-xl">Redirection vers Stripe...</p>
        </div>
      </div>
    );
  }

  if (status === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-[#E0B0B6] animate-pulse" />
          <p className="text-xl mb-2">Vérification du paiement...</p>
          <p className="text-sm text-gray-300">Cela peut prendre quelques secondes</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-xl">Une erreur est survenue</p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER : IDLE (MAIN FORM) ---
  const history = getOwnedInvitations();
  const uniqueValentines = [...new Set(history.map(h => h.valentine))].filter(v => v !== formData.valentine).slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-5 pointer-events-none"></div>
      
      {activeNotif && (
        <div className="fixed top-4 right-4 z-50 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg px-4 py-3 shadow-2xl animate-slideIn max-w-xs">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-[#FFD700] flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">{activeNotif.name}</p>
              <p className="text-gray-300">{activeNotif.action} • {activeNotif.time}</p>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-serif mb-4">
            Yes<span className="italic">Or</span>Yes
          </h1>
          <p className="text-xl text-[#E0B0B6] mb-2">
            La demande de Saint-Valentin dont elle ne pourra pas dire non
          </p>
          <p className="text-sm text-gray-300">
            Un piège psychologique irrésistible • Rapport de mission inclus
          </p>
        </div>

        <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Ton prénom</label>
            <input
              type="text"
              value={formData.sender}
              onChange={(e) => setFormData({ ...formData, sender: e.target.value })}
              placeholder="Ex: Alex"
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 focus:border-[#E0B0B6] focus:ring-2 focus:ring-[#E0B0B6]/50 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Son prénom</label>
            <input
              type="text"
              value={formData.valentine}
              onChange={(e) => setFormData({ ...formData, valentine: e.target.value })}
              placeholder="Ex: Sarah"
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 focus:border-[#E0B0B6] focus:ring-2 focus:ring-[#E0B0B6]/50 outline-none transition"
            />
            
            {/* NOUVEAUTÉ : Suggestions intelligentes (Opportunité #2) */}
            {uniqueValentines.length > 0 && !formData.valentine && (
              <div className="mt-2 text-sm text-gray-400">
                <p className="mb-1">Suggestions :</p>
                <div className="flex flex-wrap gap-2">
                  {uniqueValentines.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, valentine: name }))}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full transition text-sm">
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium mb-2">Choisis ton pack</label>
            
            <button
              type="button"
              onClick={() => setFormData({ ...formData, plan: 'spy' })}
              className={`w-full p-4 rounded-xl border-2 transition ${
                formData.plan === 'spy'
                  ? 'border-[#FFD700] bg-[#FFD700]/10'
                  : 'border-white/20 bg-white/5 hover:border-white/40'
              }`}>
              <div className="flex items-start gap-3">
                <Eye className="w-6 h-6 text-[#FFD700] flex-shrink-0 mt-1" />
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">Pack Espion</span>
                    <span className="text-xs bg-[#FFD700] text-black px-2 py-0.5 rounded-full font-bold">
                      RECOMMANDÉ
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mb-2">
                    Rapport complet : Heures précises, nombre de fuites du bouton Non, temps d'hésitation, adresse IP
                  </p>
                  <p className="text-2xl font-bold text-[#FFD700]">2,50€</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormData({ ...formData, plan: 'basic' })}
              className={`w-full p-4 rounded-xl border-2 transition ${
                formData.plan === 'basic'
                  ? 'border-[#E0B0B6] bg-[#E0B0B6]/10'
                  : 'border-white/20 bg-white/5 hover:border-white/40'
              }`}>
              <div className="flex items-start gap-3">
                <Heart className="w-6 h-6 text-[#E0B0B6] flex-shrink-0 mt-1" />
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">Pack Essentiel</span>
                  </div>
                  <p className="text-sm text-gray-300 mb-2">
                    Invitation piégée + Résultat final (OUI/NON uniquement)
                  </p>
                  <p className="text-2xl font-bold text-[#E0B0B6]">1,50€</p>
                </div>
              </div>
            </button>
          </div>

          <button
            type="submit"
            disabled={!formData.sender.trim() || !formData.valentine.trim()}
            className="w-full bg-[#D24D57] hover:bg-[#B93E49] disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold text-lg transition flex items-center justify-center gap-2 shadow-lg">
            <Sparkles className="w-5 h-5" />
            Créer l'invitation
          </button>
        </form>

        <div className="mt-12 max-w-3xl mx-auto grid md:grid-cols-3 gap-6 text-center">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="font-semibold mb-1">Piège Psychologique</h3>
            <p className="text-sm text-gray-300">Le bouton "Non" fuit à chaque tentative</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="text-3xl mb-2">👁️</div>
            <h3 className="font-semibold mb-1">Rapport Complet</h3>
            <p className="text-sm text-gray-300">Suivez tout en temps réel</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="text-3xl mb-2">💝</div>
            <h3 className="font-semibold mb-1">Expérience Unique</h3>
            <p className="text-sm text-gray-300">Musique, animations, confettis</p>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-400">
          <Link to="/legal" className="hover:text-white transition">
            Mentions légales
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
