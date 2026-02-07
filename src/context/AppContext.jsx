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
        console.error("Erreur parsing localStorage:", e);
        localStorage.removeItem('yesoryes_owned');
      }
    }

    const syncPendingActions = async () => {
      const pending = localStorage.getItem('pending_acceptance');
      if (pending) {
        try {
          const { id } = JSON.parse(pending);
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

  // 🔥 SOLUTION DÉFINITIVE : Utiliser la RPC create_invitation_v2
  const createInvitation = async (sender, valentine, plan) => {
    try {
      if (!sender?.trim() || !valentine?.trim() || !plan) {
        throw new Error("Paramètres invalides");
      }

      console.log('🔧 Tentative création invitation via RPC:', { 
        sender: sender.trim(), 
        valentine: valentine.trim(), 
        plan 
      });

      // ✅ UTILISATION DE LA RPC AU LIEU D'INSERT DIRECT
      const { data, error } = await supabase.rpc('create_invitation_v2', {
        p_sender: sender.trim(),
        p_valentine: valentine.trim(),
        p_plan: plan
      });

      if (error) {
        console.error("❌ Erreur RPC create_invitation_v2:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        
        if (error.code === '42883') {
          throw new Error("La fonction RPC n'existe pas. Vérifiez que create_invitation_v2 est bien créée dans Supabase.");
        }
        if (error.message?.includes('permission')) {
          throw new Error("Permission refusée pour la fonction RPC.");
        }
        
        throw new Error(error.message || "Erreur lors de la création");
      }

      if (!data || !data.id || !data.token) {
        console.error("❌ Données incomplètes retournées par RPC:", data);
        throw new Error("La création a échoué (données manquantes)");
      }

      console.log('✅ Invitation créée avec succès via RPC:', {
        id: data.id.substring(0, 8),
        hasToken: !!data.token
      });

      // Mise à jour du store local
      const newInvitation = {
        id: data.id,
        valentine: valentine.trim(),
        token: data.token,
        createdAt: new Date().toISOString()
      };

      const currentList = Array.isArray(ownedInvitations) ? ownedInvitations : [];
      const updatedList = [newInvitation, ...currentList];
      
      setOwnedInvitations(updatedList);
      localStorage.setItem('yesoryes_owned', JSON.stringify(updatedList));

      return { 
        id: data.id, 
        token: data.token 
      };

    } catch (error) {
      console.error("💥 Erreur critique création:", {
        name: error.name,
        message: error.message
      });
      
      return null;
    }
  };

  const getSpyReport = async (id, token) => {
    try {
      // ✅ Utilisation de la RPC get_spy_report
      const { data, error } = await supabase.rpc('get_spy_report', {
        target_id: id,
        token_input: token
      });

      if (error) {
        console.error("Erreur RPC get_spy_report:", error);
        return null;
      }

      return data;
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
