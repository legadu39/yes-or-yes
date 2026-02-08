import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [ownedInvitations, setOwnedInvitations] = useState([]);

  // --- INITIALISATION & SYNCHRONISATION ---
  useEffect(() => {
    // 1. Charger l'historique local
    const stored = localStorage.getItem('yesoryes_owned');
    if (stored) {
      try {
        setOwnedInvitations(JSON.parse(stored));
      } catch (e) {
        console.error("Erreur parsing localStorage", e);
        localStorage.removeItem('yesoryes_owned');
      }
    }
    
    // 2. Synchronisation "Offline-First" des réponses en attente
    const syncPendingActions = async () => {
      // A. Sync du "OUI" (Acceptance)
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
    
    // Écouteur pour réessayer quand le réseau revient
    window.addEventListener('online', syncPendingActions);
    return () => window.removeEventListener('online', syncPendingActions);
  }, []);

  // --- INTELLIGENCE : GESTION DES BROUILLONS ---
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

  // --- CRÉATION VIA RPC V2 ---
  const createInvitation = async (sender, valentine, plan) => {
    try {
      if (!sender?.trim() || !valentine?.trim() || !plan) {
        throw new Error("Paramètres invalides");
      }

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

      // Normalisation du retour (camelCase vs snake_case)
      const newId = data.id || data.new_id;
      const newToken = data.admin_token || data.new_token || data.token;

      if (!newId || !newToken) throw new Error("Données incomplètes retournées.");

      const newInvitation = { 
        id: newId, 
        sender: sender.trim(),
        valentine: valentine.trim(),
        token: newToken, 
        plan: plan,
        createdAt: new Date().toISOString() 
      };

      updateOwnedInvitations(newInvitation);

      return { id: newId, token: newToken };

    } catch (error) {
      console.error("🚨 Erreur critique création:", error);
      return null;
    }
  };

  // --- UTILITAIRE DE MISE A JOUR LOCALSTORAGE ---
  const updateOwnedInvitations = (invitation) => {
    setOwnedInvitations(prev => {
        // Éviter les doublons
        const filtered = prev.filter(i => i.id !== invitation.id);
        const updated = [invitation, ...filtered];
        localStorage.setItem('yesoryes_owned', JSON.stringify(updated));
        return updated;
    });
  };

  // --- FONCTION UTILITAIRE POUR RÉPARATION MÉMOIRE LOCALE ---
  const repairLocalMemory = (id, token, data) => {
    const stored = localStorage.getItem('yesoryes_owned') ? JSON.parse(localStorage.getItem('yesoryes_owned')) : [];
    // On met à jour l'entrée existante ou on en crée une nouvelle
    const filtered = stored.filter(i => i.id !== id);
    const newEntry = { id, token, createdAt: new Date().toISOString(), ...data };
    const newList = [newEntry, ...filtered];
    localStorage.setItem('yesoryes_owned', JSON.stringify(newList));
    
    // Mise à jour du state React également
    setOwnedInvitations(newList);
  };

  // --- INTELLIGENCE : RÉCUPÉRATION PAR SESSION STRIPE ---
  const recoverBySessionId = async (sessionId) => {
    if (!sessionId) return null;
    
    console.log("🕵️ Tentative récupération par Session ID:", sessionId);
    
    try {
        // Appel à la nouvelle fonction SQL dédiée
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

  // --- FONCTION DE LECTURE INTELLIGENTE ---
  const getPublicInvitation = async (id) => {
    try {
      // DÉTECTION DU TYPE D'ID :
      // Si l'ID commence par "cs_", c'est un ID Stripe (Session ID).
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

  const acceptInvitation = async (id) => {
    try {
      // 1. Sauvegarde locale immédiate (Offline-First)
      localStorage.setItem('pending_acceptance', JSON.stringify({ id, time: Date.now() }));
      
      // 2. Tentative via Beacon (plus fiable lors de la fermeture de page)
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

      // 3. Fallback standard RPC
      const { error } = await supabase.rpc('answer_invitation', { 
        target_id: id, 
        answer: 'accepted' 
      });

      if (error) throw error;
      
      localStorage.removeItem('pending_acceptance');
      return true;

    } catch (error) {
      console.warn("Erreur réseau acceptInvitation - Sauvegardé pour retry", error);
      return false; // Ce n'est pas grave, le useEffect s'en chargera
    }
  };

  const verifyPaymentStatus = async (id) => {
    try {
      const data = await getPublicInvitation(id);
      
      // INTELLIGENCE UPGRADE : Synchronisation automatique du plan
      if (data && data.payment_status === 'paid') {
          const owned = getOwnedInvitations();
          const localEntry = owned.find(i => i.id === data.id);
          
          // Si le plan a changé côté serveur (upgrade détecté), on met à jour local
          if (localEntry && localEntry.plan !== data.plan) {
              console.log(`✨ Upgrade détecté : ${localEntry.plan} → ${data.plan}`);
              repairLocalMemory(data.id, localEntry.token, { ...localEntry, plan: data.plan });
          }
      }
      
      return !!data && data.payment_status === 'paid';
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
    repairLocalMemory
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default AppContext;