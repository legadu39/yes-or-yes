import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [ownedInvitations, setOwnedInvitations] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem('yesoryes_owned');
    if (stored) {
      try {
        setOwnedInvitations(JSON.parse(stored));
      } catch (e) {
        console.error("Erreur parsing localStorage", e);
        localStorage.removeItem('yesoryes_owned');
      }
    }

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
      const filtered = prev.filter(i => i.id !== invitation.id);
      const updated = [invitation, ...filtered];
      localStorage.setItem('yesoryes_owned', JSON.stringify(updated));
      return updated;
    });
  };

  const repairLocalMemory = (id, token, data) => {
    const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
    const filtered = stored.filter(i => i.id !== id);
    const newEntry = { id, token, createdAt: new Date().toISOString(), ...data };
    const newList = [newEntry, ...filtered];
    localStorage.setItem('yesoryes_owned', JSON.stringify(newList));
    setOwnedInvitations(newList);
  };

  // NOUVEAUTÉ : Anti-Doublon (Opportunité #7)
  const createInvitation = async (sender, valentine, plan) => {
    try {
      if (!sender?.trim() || !valentine?.trim() || !plan) {
        throw new Error("Paramètres invalides");
      }

      // --- HEURISTIQUE ANTI-DOUBLON (NOUVEAUTÉ) ---
      const owned = getOwnedInvitations();

      const recentDuplicate = owned.find(invite => {
        const isSamePeople = 
          invite.sender.toLowerCase().trim() === sender.toLowerCase().trim() &&
          invite.valentine.toLowerCase().trim() === valentine.toLowerCase().trim();

        const isRecent = 
          (Date.now() - new Date(invite.createdAt).getTime()) < (5 * 60 * 1000);

        const isSamePlan = invite.plan === plan;

        return isSamePeople && isRecent && isSamePlan;
      });

      if (recentDuplicate) {
        console.log("⚠️ Doublon détecté. Réutilisation de l'invitation existante.");

        const timeAgo = Math.floor((Date.now() - new Date(recentDuplicate.createdAt)) / 1000);
        const reuse = window.confirm(
          `Une invitation identique pour ${valentine} existe déjà (créée il y a ${timeAgo}s).\n\n` +
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

  // NOUVEAUTÉ : Récupération Heuristique (Opportunité #5)
  const intelligentRecovery = async (partialInfo) => {
    const owned = getOwnedInvitations();

    // HEURISTIQUE 1 : Correspondance directe par ID
    let candidate = owned.find(i => i.id === partialInfo.id);
    if (candidate) {
      console.log("✅ Récupération par ID direct");
      return candidate;
    }

    // HEURISTIQUE 2 : Si ID Stripe, chercher via RPC
    if (partialInfo.id && partialInfo.id.startsWith('cs_')) {
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
      new Date(i.createdAt).getTime() > recentThreshold
    );

    if (recentInvites.length === 1) {
      console.log("🔍 Récupération heuristique : 1 seule invitation récente trouvée");
      return recentInvites[0];
    }

    // HEURISTIQUE 4 : Plusieurs candidats -> Plus récente
    if (recentInvites.length > 1) {
      console.log("⚠️ Ambiguïté : Plusieurs invitations récentes. Prise de la dernière.");
      return recentInvites.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      )[0];
    }

    console.log("❌ Aucune récupération possible");
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

  const getOwnedInvitations = () => {
    const stored = localStorage.getItem('yesoryes_owned');
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
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

  const verifyPaymentStatus = async (id) => {
    try {
      const data = await getPublicInvitation(id);

      if (data && data.payment_status === 'paid') {
        const owned = getOwnedInvitations();
        const localEntry = owned.find(i => i.id === data.id);

        if (localEntry) {
          const hasPlanChanged = localEntry.plan !== data.plan;
          const hasStatusChanged = localEntry.payment_status !== data.payment_status;

          if (hasPlanChanged || hasStatusChanged) {
            console.log(`✨ Sync État Paiement/Plan : ${localEntry.plan} → ${data.plan}`);
            repairLocalMemory(data.id, localEntry.token, {
              ...localEntry,
              plan: data.plan,
              payment_status: data.payment_status
            });
          }
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
