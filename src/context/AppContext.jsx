import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [ownedInvitations, setOwnedInvitations] = useState([]);

  // useEffect: Récupération de l'historique propriétaire
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
    
    // Queue de Synchronisation
    const syncPendingActions = async () => {
      const pending = localStorage.getItem('pending_acceptance');
      if (pending) {
        try {
          const { id, time } = JSON.parse(pending);
          console.log("Tentative de synchronisation pour id:", id);
          
          const { error } = await supabase.rpc('answer_invitation', { 
            target_id: id, 
            answer: 'accepted' 
          });

          if (!error) {
            console.log("Synchro réussie !");
            localStorage.removeItem('pending_acceptance');
          }
        } catch (e) {
          console.warn("Échec synchro silencieuse", e);
        }
      }
    };

    if (navigator.onLine) {
      syncPendingActions();
    }
  }, []);

  // --- CRÉATION VIA RPC V2 (SÉCURITÉ & RESPONSABILITÉ DB) ---
  const createInvitation = async (sender, valentine, plan) => {
    try {
      // Validation des entrées
      if (!sender?.trim() || !valentine?.trim() || !plan) {
        throw new Error("Paramètres invalides");
      }

      console.log("Appel RPC create_invitation_v2", { sender, valentine, plan });

      // APPEL RPC : On laisse la DB gérer les IDs et Tokens
      // La fonction create_invitation_v2 doit retourner un JSON ou un record avec { id, admin_token }
      const { data, error } = await supabase.rpc('create_invitation_v2', {
        p_sender: sender.trim(),
        p_valentine: valentine.trim(),
        p_plan: plan
      });

      // Gestion d'erreur détaillée
      if (error) {
        console.error("❌ Erreur RPC create_invitation_v2:", {
          message: error.message,
          code: error.code,
          details: error.details
        });
        
        if (error.code === '42501') throw new Error("Permission refusée par la base de données.");
        throw error;
      }

      // Validation du retour
      if (!data) {
        console.error("⚠️ Pas de données retournées par le RPC.");
        throw new Error("Erreur technique: Pas de retour de la base de données.");
      }

      // Extraction des données retournées par la fonction SQL
      // On gère les deux cas possibles de retour (camelCase ou snake_case selon ta fonction SQL)
      const newId = data.id || data.new_id;
      const newToken = data.admin_token || data.new_token || data.token;

      if (!newId || !newToken) {
         console.error("⚠️ Structure de retour inattendue:", data);
         throw new Error("Erreur technique: Données incomplètes.");
      }

      console.log("✅ Invitation créée avec succès (DB)", newId);

      // Mise à jour du store local avec les données certifiées par la DB
      const newInvitation = { 
        id: newId, 
        sender: sender.trim(),
        valentine: valentine.trim(),
        token: newToken, 
        createdAt: new Date().toISOString() 
      };

      const currentList = Array.isArray(ownedInvitations) ? ownedInvitations : [];
      const updatedList = [newInvitation, ...currentList];
      
      setOwnedInvitations(updatedList);
      localStorage.setItem('yesoryes_owned', JSON.stringify(updatedList));

      // Retour garanti avec les bonnes valeurs pour la redirection
      return { id: newId, token: newToken };

    } catch (error) {
      console.error("🚨 Erreur critique création:", {
        name: error.name,
        message: error.message
      });
      return null;
    }
  };

  // --- LECTURE RAPPORT ESPION VIA RPC ---
  const getSpyReport = async (id, token) => {
    try {
      const { data, error } = await supabase.rpc('get_spy_report', {
        target_id: id,
        token_input: token
      });

      if (error) {
        console.error("Erreur RPC get_spy_report", error);
        throw error;
      }

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

  // --- LECTURE PUBLIQUE VIA RPC ---
  const getPublicInvitation = async (id) => {
    try {
      const { data, error } = await supabase.rpc('get_public_invitation', {
        target_id: id
      });

      if (error) {
        console.error("Erreur RPC get_public_invitation", error);
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
      if (!id || newCount === undefined || newTime === undefined) {
        console.warn("incrementAttempts paramètres invalides", { id, newCount, newTime });
        return;
      }
      
      const { error } = await supabase.rpc('increment_attempts', { 
        target_id: id, 
        new_count: parseInt(newCount), 
        new_time: parseFloat(newTime) 
      });

      if (error) console.error("Erreur incrementAttempts", error);
    } catch (e) {
      console.warn("incrementAttempts silent error", e);
    }
  };

  const acceptInvitation = async (id) => {
    try {
      localStorage.setItem('pending_acceptance', JSON.stringify({ id, time: Date.now() }));
      
      // Tentative avec keepalive pour meilleure fiabilité mobile
      if (navigator.sendBeacon) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/answer_invitation`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ target_id: id, answer: 'accepted' }),
          keepalive: true
        });
        
        if (response.ok) {
          localStorage.removeItem('pending_acceptance');
          return true;
        }
      }

      // Fallback standard
      const { error } = await supabase.rpc('answer_invitation', { 
        target_id: id, 
        answer: 'accepted' 
      });

      if (error) throw error;
      
      localStorage.removeItem('pending_acceptance');
      return true;

    } catch (error) {
      console.warn("Erreur réseau acceptInvitation", error);
      return false;
    }
  };

  const verifyPaymentStatus = async (id) => {
    try {
      const data = await getPublicInvitation(id);
      // Le RPC get_public_invitation renvoie payment_status
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default AppContext;