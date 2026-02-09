import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [ownedInvitations, setOwnedInvitations] = useState([]);

  // FONCTION UTILITAIRE : Lire les invitations stockées
  const getOwnedInvitations = () => {
    const stored = localStorage.getItem('yesoryes_owned');
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  useEffect(() => {
    // Charge les invitations locales au montage
    const stored = localStorage.getItem('yesoryes_owned');
    if (stored) {
      try {
        setOwnedInvitations(JSON.parse(stored));
      } catch (e) {
        console.error("Erreur parsing localStorage", e);
        localStorage.removeItem('yesoryes_owned');
      }
    }

    // --- INTELLIGENCE #1 : Synchro différée (Réseau) ---
    const syncPendingActions = async () => {
      const pendingYes = localStorage.getItem('pending_acceptance');
      if (pendingYes) {
        try {
          const { id, time } = JSON.parse(pendingYes);
          console.log("🔄 Tentative de synchronisation différée (OUI) pour:", id);
          const { error } = await supabase.rpc('answer_invitation', {
            target_id: id,
            answer: 'accepted'
          });
          if (!error) {
            console.log("✅ Synchro réussie !");
            localStorage.removeItem('pending_acceptance');
          } else {
            console.warn("⚠️ Échec synchro:", error);
          }
        } catch (e) {
          console.warn("Erreur process synchro", e);
        }
      }
    };

    if (navigator.onLine) {
      syncPendingActions();
    }

    // --- INTELLIGENCE #2 : Anticipation Paiement (Check URL) ---
    // Si on revient de Stripe avec success=true, on déclenche une vérification immédiate
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
           console.log("🚀 URL Success détectée : Démarrage vérification paiement proactive...");
           // Note: Le composant SpyDashboard lancera aussi verifyPaymentStatus avec le token
        }
    }

    window.addEventListener('online', syncPendingActions);
    return () => window.removeEventListener('online', syncPendingActions);
  }, []);

  const saveDraft = (data) => {
    try {
      localStorage.setItem('draft_invitation', JSON.stringify(data));
    } catch (e) {
      console.warn("Erreur sauvegarde brouillon", e);
    }
  };

  const recoverDraft = () => {
    try {
      const draft = localStorage.getItem('draft_invitation');
      return draft ? JSON.parse(draft) : null;
    } catch (e) {
      return null;
    }
  };

  const updateOwnedInvitations = (invitation) => {
    setOwnedInvitations(prev => {
      // Nettoyage préventif des doublons par ID
      const filtered = prev.filter(i => i.id !== invitation.id);
      const updated = [invitation, ...filtered];
      localStorage.setItem('yesoryes_owned', JSON.stringify(updated));
      return updated;
    });
  };

  const repairLocalMemory = (id, token, data) => {
    const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
    const filtered = stored.filter(i => i.id !== id);
    // On garde le token existant ou on prend le nouveau
    const finalToken = token || (stored.find(i => i.id === id)?.token);
    
    const newEntry = { 
        id, 
        token: finalToken, 
        createdAt: new Date().toISOString(), 
        ...data 
    };
    
    const newList = [newEntry, ...filtered];
    localStorage.setItem('yesoryes_owned', JSON.stringify(newList));
    setOwnedInvitations(newList);
    return newEntry;
  };

  // NOUVEAUTÉ : Anti-Doublon (Opportunité #7)
  const createInvitation = async (sender, valentine, plan) => {
    try {
      if (!sender?.trim() || !valentine?.trim() || !plan) {
        throw new Error("Paramètres invalides");
      }

      // --- HEURISTIQUE ANTI-DOUBLON ---
      const owned = getOwnedInvitations();

      const recentDuplicate = owned.find(invite => {
        const inviteSender = (invite.sender || "").toLowerCase().trim();
        const inviteValentine = (invite.valentine || "").toLowerCase().trim();
        
        const currentSender = sender.toLowerCase().trim();
        const currentValentine = valentine.toLowerCase().trim();

        const isSamePeople = 
          inviteSender === currentSender &&
          inviteValentine === currentValentine;

        // Vérification de sécurité sur createdAt
        const inviteTime = invite.createdAt ? new Date(invite.createdAt).getTime() : 0;
        const isRecent = (Date.now() - inviteTime) < (5 * 60 * 1000);

        const isSamePlan = invite.plan === plan;

        return isSamePeople && isRecent && isSamePlan;
      });

      if (recentDuplicate) {
        console.log("⚠️ Doublon détecté. Réutilisation de l'invitation existante.");

        const timeAgo = Math.floor((Date.now() - new Date(recentDuplicate.createdAt)) / 1000);
        const displayTime = isNaN(timeAgo) ? "quelques" : timeAgo;
        
        const reuse = window.confirm(
          `Une invitation identique pour ${valentine} existe déjà (créée il y a ${displayTime}s).\n\n` +
          `Voulez-vous la réutiliser au lieu d'en créer une nouvelle ?`
        );

        if (reuse) {
          return { 
            id: recentDuplicate.id, 
            token: recentDuplicate.token,
            wasReused: true 
          };
        }
      }
      // --- FIN ANTI-DOUBLON ---

      console.log("🚀 Appel RPC create_invitation_v2", { sender, valentine, plan });
      const { data, error } = await supabase.rpc('create_invitation_v2', {
        p_sender: sender.trim(),
        p_valentine: valentine.trim(),
        p_plan: plan
      });

      if (error) {
        console.error("❌ Erreur RPC create_invitation_v2:", error);
        if (error.code === '42501') throw new Error("Permission refusée par la base de données.");
        throw error;
      }

      if (!data) throw new Error("Erreur technique: Pas de retour DB.");

      // Support des différents formats de retour possibles
      const newId = data.id || data.new_id;
      const newToken = data.admin_token || data.new_token || data.token;

      if (!newId || !newToken) throw new Error("Données incomplètes retournées.");

      const newInvitation = {
        id: newId,
        sender: sender.trim(),
        valentine: valentine.trim(),
        token: newToken,
        plan: plan,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      updateOwnedInvitations(newInvitation);
      return { id: newId, token: newToken };

    } catch (error) {
      console.error("🚨 Erreur critique création:", error);
      return null;
    }
  };

  const intelligentRecovery = async (partialInfo) => {
    const owned = getOwnedInvitations();

    // HEURISTIQUE 1 : Correspondance directe par ID
    let candidate = owned.find(i => i.id === partialInfo.id);
    if (candidate) {
      console.log("✅ Récupération par ID direct");
      return candidate;
    }

    // HEURISTIQUE 2 : Si ID Stripe, chercher via RPC
    if (partialInfo.id && typeof partialInfo.id === 'string' && partialInfo.id.startsWith('cs_')) {
      const recovered = await recoverBySessionId(partialInfo.id);
      if (recovered) {
        const localMatch = owned.find(i => 
          i.sender === recovered.sender && 
          i.valentine === recovered.valentine &&
          Math.abs(new Date(i.createdAt) - new Date(recovered.created_at)) < 3600000
        );
        if (localMatch) {
          console.log("✅ Récupération via Stripe ID + match local");
          return { ...recovered, token: localMatch.token };
        }
        console.log("⚠️ Récupération via Stripe ID (sans token)");
        return recovered;
      }
    }

    // HEURISTIQUE 3 : Invitations récentes (30 min)
    const recentThreshold = Date.now() - (30 * 60 * 1000);
    const recentInvites = owned.filter(i => 
      i.createdAt && new Date(i.createdAt).getTime() > recentThreshold
    );

    if (recentInvites.length === 1) {
      return recentInvites[0];
    }

    // HEURISTIQUE 4 : Plusieurs candidats -> Plus récente
    if (recentInvites.length > 1) {
      return recentInvites.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      )[0];
    }

    return null;
  };

  const recoverBySessionId = async (sessionId) => {
    if (!sessionId) return null;
    console.log("🕵️ Tentative récupération par Session ID:", sessionId);
    try {
      const { data, error } = await supabase.rpc('get_invitation_by_stripe_id', {
        stripe_id: sessionId
      });
      if (error) {
        console.warn("Erreur RPC get_invitation_by_stripe_id", error);
        return null;
      }
      return data;
    } catch (e) {
      console.error("Erreur recovery", e);
      return null;
    }
  };

  const getSpyReport = async (id, token) => {
    try {
      const { data, error } = await supabase.rpc('get_spy_report', {
        target_id: id,
        token_input: token
      });
      if (error) throw error;
      if (!data) return null;
      return { ...data, status: data.game_status };
    } catch (error) {
      console.error("Accès refusé ou erreur rapport espion", error);
      return null;
    }
  };

  const getPublicInvitation = async (id) => {
    try {
      const isStripeId = id && typeof id === 'string' && id.startsWith('cs_');
      const rpcMethod = isStripeId ? 'get_invitation_by_stripe_id' : 'get_public_invitation';
      const rpcParams = isStripeId ? { stripe_id: id } : { target_id: id };

      const { data, error } = await supabase.rpc(rpcMethod, rpcParams);

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error(`Erreur RPC ${rpcMethod}`, error);
        }
        return null;
      }

      if (!data) return null;
      return { ...data, status: data.game_status };
    } catch (error) {
      console.error("Erreur critique getPublicInvitation", error);
      return null;
    }
  };

  const markAsViewed = async (id) => {
    try {
      const sessionKey = `viewed_${id}`;
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, 'true');

      const { error } = await supabase.rpc('mark_invitation_viewed', { target_id: id });
      if (error) console.error("Erreur markAsViewed", error);
    } catch (e) {
      console.warn("markAsViewed silent error", e);
    }
  };

  const incrementAttempts = async (id, newCount, newTime) => {
    try {
      if (!id) return;
      await supabase.rpc('increment_attempts', {
        target_id: id,
        new_count: parseInt(newCount || 0),
        new_time: parseFloat(newTime || 0)
      });
    } catch (e) {
      console.warn("incrementAttempts silent error", e);
    }
  };

  const acceptInvitation = async (id, hesitationTime) => {
    try {
      localStorage.setItem('pending_acceptance', JSON.stringify({ id, time: Date.now() }));

      if (navigator.sendBeacon) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/answer_invitation`;
        const payload = JSON.stringify({ target_id: id, answer: 'accepted' });
        const headers = {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: payload,
          keepalive: true
        });

        if (response.ok) {
          localStorage.removeItem('pending_acceptance');
          return true;
        }
      }

      const { error } = await supabase.rpc('answer_invitation', {
        target_id: id,
        answer: 'accepted'
      });

      if (error) throw error;
      localStorage.removeItem('pending_acceptance');
      return true;
    } catch (error) {
      console.warn("Erreur réseau acceptInvitation - Sauvegardé pour retry", error);
      return false;
    }
  };

  // --- MODIFICATION CHIRURGICALE : Support Token + Reconstruction Mémoire ---
  const verifyPaymentStatus = async (id, fallbackToken = null) => {
    try {
      console.log(`🔎 Vérification paiement pour ID: ${id}...`);
      const data = await getPublicInvitation(id);

      if (data && data.payment_status === 'paid') {
        const owned = getOwnedInvitations();
        const localEntry = owned.find(i => i.id === data.id);

        // Cas 1 : L'invitation existe en local, on met à jour
        if (localEntry) {
          const hasPlanChanged = localEntry.plan !== data.plan;
          const hasStatusChanged = localEntry.payment_status !== data.payment_status;

          // Si changement OU si on est spy (pour forcer le refresh)
          if (hasPlanChanged || hasStatusChanged || data.plan === 'spy') {
            console.log(`✨ Sync État Paiement/Plan : ${localEntry.plan} → ${data.plan}`);
            repairLocalMemory(data.id, localEntry.token, {
              ...localEntry,
              plan: data.plan,
              payment_status: data.payment_status
            });
            // Mise à jour de l'état React pour ré-rendu immédiat
            setOwnedInvitations(prev => {
                return prev.map(p => p.id === data.id ? { ...p, plan: data.plan } : p);
            });
          }
        } 
        // Cas 2 (CRITIQUE) : Perte de mémoire mais Token fourni (URL) -> On reconstruit !
        else if (fallbackToken) {
            console.log("🛠️ Reconstruction mémoire locale avec Token fourni");
            repairLocalMemory(data.id, fallbackToken, {
                 plan: data.plan,
                 payment_status: data.payment_status,
                 sender: data.sender || "Moi",
                 valentine: data.valentine || "Valentine"
             });
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error("Erreur verifyPaymentStatus", error);
      return false;
    }
  };

  const value = {
    createInvitation,
    getPublicInvitation,
    getSpyReport,
    markAsViewed,
    incrementAttempts,
    acceptInvitation,
    verifyPaymentStatus,
    ownedInvitations,
    getOwnedInvitations,
    updateOwnedInvitations,
    recoverBySessionId,
    saveDraft,
    recoverDraft,
    repairLocalMemory,
    intelligentRecovery
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default AppContext;

//