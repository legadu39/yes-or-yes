import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// --- UTILITAIRE DE GÉNÉRATION D'ID (Sans dépendance externe) ---
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [ownedInvitations, setOwnedInvitations] = useState([]);

  useEffect(() => {
    // Récupération de l'historique propriétaire
    const stored = localStorage.getItem('yesoryes_owned');
    if (stored) {
      try {
        setOwnedInvitations(JSON.parse(stored));
      } catch (e) {
        console.error("Erreur parsing localStorage:", e);
        localStorage.removeItem('yesoryes_owned');
      }
    }

    // Queue de Synchronisation
    const syncPendingActions = async () => {
      const pending = localStorage.getItem('pending_acceptance');
      if (pending) {
        try {
          const { id, time } = JSON.parse(pending);
          console.log(`🔄 Tentative de synchronisation pour ${id}...`);
          
          const { error } = await supabase.rpc('answer_invitation', {
            target_id: id,
            answer: 'accepted'
          });

          if (!error) {
            console.log("✅ Synchro réussie !");
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

  // --- CRÉATION AVEC GESTION D'ERREUR ROBUSTE ---
  const createInvitation = async (sender, valentine, plan) => {
    try {
      // Validation des entrées
      if (!sender?.trim() || !valentine?.trim() || !plan) {
        throw new Error("Paramètres invalides");
      }

      // Génération des IDs
      const newId = generateUUID();
      const newToken = generateUUID();

      console.log('🔧 Tentative création invitation:', { 
        id: newId.substring(0, 8), 
        sender: sender.trim(), 
        valentine: valentine.trim(), 
        plan 
      });

      // 🔧 CORRECTION 1 : Sélection explicite des colonnes nécessaires
      const { data, error } = await supabase
        .from('invitations')
        .insert([
          {
            id: newId,
            sender: sender.trim(),
            valentine: valentine.trim(),
            plan: plan,
            admin_token: newToken,
            game_status: 'pending',
            payment_status: 'unpaid'
          }
        ])
        .select('id, admin_token')  // ✅ Sélection explicite uniquement des colonnes retournées
        .single();

      // 🔧 CORRECTION 2 : Logging détaillé en cas d'erreur
      if (error) {
        console.error("❌ Erreur Supabase détaillée:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        
        // Messages d'erreur spécifiques
        if (error.code === '42501') {
          throw new Error("Permission refusée. Vérifiez les politiques RLS.");
        }
        if (error.code === '23505') {
          throw new Error("ID en conflit. Réessayez.");
        }
        if (error.message?.includes('columns')) {
          throw new Error("Erreur de structure de table. Contactez le support.");
        }
        
        throw error;
      }

      // 🔧 CORRECTION 3 : Validation du retour
      if (!data) {
        console.error("❌ Pas de données retournées par Supabase");
        throw new Error("La création a échoué silencieusement");
      }

      console.log('✅ Invitation créée avec succès:', data);

      // Mise à jour du store local
      const newInvitation = {
        id: newId,
        valentine: valentine.trim(),
        token: newToken,
        createdAt: new Date().toISOString()
      };

      const currentList = Array.isArray(ownedInvitations) ? ownedInvitations : [];
      const updatedList = [newInvitation, ...currentList];
      
      setOwnedInvitations(updatedList);
      localStorage.setItem('yesoryes_owned', JSON.stringify(updatedList));

      // 🔧 CORRECTION 4 : Retour garanti avec les bonnes valeurs
      return { id: newId, token: newToken };

    } catch (error) {
      console.error("💥 Erreur critique création:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // 🔧 CORRECTION 5 : Retour null au lieu de throw pour permettre l'UI de gérer
      return null;
    }
  };

  const getSpyReport = async (id, token) => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('id', id)
        .eq('admin_token', token)
        .single();

      if (error) {
        console.error("Erreur getSpyReport:", error);
        throw error;
      }

      return {
        ...data,
        status: data.game_status
      };
    } catch (error) {
      console.error("Accès refusé ou erreur rapport espion:", error);
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
      const { data, error } = await supabase
        .from('invitations')
        .select('id, sender, valentine, plan, game_status, payment_status, attempts, viewed_at')
        .eq('id', id)
        .single();

      if (error) {
        console.error("Erreur getPublicInvitation:", error);
        return null;
      }

      // Vérification paiement
      if (data.payment_status !== 'paid') {
        console.warn("Invitation trouvée mais non payée");
        return null;
      }

      return {
        ...data,
        status: data.game_status
      };
    } catch (error) {
      console.error("Erreur getPublicInvitation:", error);
      return null;
    }
  };

  const markAsViewed = async (id) => {
    try {
      const { error } = await supabase.rpc('mark_invitation_viewed', { target_id: id });
      if (error) console.error("Erreur markAsViewed:", error);
    } catch (e) {
      console.warn("markAsViewed silent error:", e);
    }
  };

  const incrementAttempts = async (id, newCount, newTime) => {
    try {
      if (!id || newCount === undefined || newTime === undefined) {
        console.warn("incrementAttempts: paramètres invalides", { id, newCount, newTime });
        return;
      }

      const { error } = await supabase.rpc('increment_attempts', { 
        target_id: id,
        new_count: parseInt(newCount),
        new_time: parseFloat(newTime)
      });
      
      if (error) console.error("Erreur incrementAttempts:", error);
    } catch (e) {
      console.warn("incrementAttempts silent error:", e);
    }
  };

  const acceptInvitation = async (id) => {
    try {
      localStorage.setItem('pending_acceptance', JSON.stringify({
        id,
        time: Date.now()
      }));

      // Tentative avec keepalive
      if (navigator.sendBeacon) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/answer_invitation`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            target_id: id,
            answer: 'accepted'
          }),
          keepalive: true
        });

        if (response.ok) {
          localStorage.removeItem('pending_acceptance');
          return true;
        }
      }

      // Fallback
      const { error } = await supabase.rpc('answer_invitation', {
        target_id: id,
        answer: 'accepted'
      });

      if (error) throw error;
      
      localStorage.removeItem('pending_acceptance');
      return true;

    } catch (error) {
      console.warn("Erreur réseau acceptInvitation:", error);
      return false;
    }
  };

  const verifyPaymentStatus = async (id) => {
    try {
      const data = await getPublicInvitation(id);
      return !!data;
    } catch (error) {
      console.error("Erreur verifyPaymentStatus:", error);
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
    getOwnedInvitations
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;
