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

  // --- INTELLIGENCE : RÉCUPÉRATION PAR SESSION STRIPE ---
  const recoverBySessionId = async (sessionId) => {
    if (!sessionId) return null;
    
    console.log("🕵️ Tentative récupération par Session ID:", sessionId);
    
    // Essayer de trouver une invitation locale qui correspond (optimisation)
    // Note: On ne stocke pas le session_id localement au départ, donc ceci est une fallback future
    
    try {
        // On tente de récupérer l'invitation publique associée à ce session ID
        // Note: Cela nécessite que la colonne stripe_session_id soit accessible ou via une RPC
        // Si RLS bloque, cette requête peut échouer. 
        // Solution de contournement : on appelle getPublicInvitation sur les ID récents du cache si possible
        // Mais ici, supposons qu'on utilise une méthode de force brute sur les ownedInvitations si l'ID manque
        
        // Comme nous n'avons pas créé de RPC spécifique 'get_by_session', 
        // nous allons nous appuyer sur la logique de Home.jsx qui combine ID et Session.
        // Cette fonction sert de placeholder pour une future RPC 'recover_lost_invitation'
        return null; 
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
      const { data, error } = await supabase.rpc('get_public_invitation', {
        target_id: id
      });

      if (error) {
        // Ignorer les erreurs "introuvable" standard pour éviter le spam console
        if (error.code !== 'PGRST116') console.error("Erreur RPC get_public_invitation", error);
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
        
        // Beacon ne supporte pas les headers auth custom facilement sur tous les navigateurs
        // On fallback sur fetch keepalive
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
    updateOwnedInvitations, // Exporté pour usage dans Home.jsx
    recoverBySessionId
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default AppContext;