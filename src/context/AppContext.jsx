import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// --- STABILITY FIX: GÉNÉRATEUR UUID NATIF (ZERO DEPENDENCY) ---
// On supprime l'import 'uuid' qui causait le crash "n is not a function" en prod.
const generateUUID = () => {
  // 1. Méthode moderne (99% des navigateurs récents)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 2. Fallback robuste pour les anciens environnements
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
};

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // Gestion de l'état local pour l'historique des invitations créées (Admin)
  const [ownedInvitations, setOwnedInvitations] = useState([]);

  // --- INIT & SYNC ---
  useEffect(() => {
    // 1. Récupération de l'historique propriétaire
    const stored = localStorage.getItem('yesoryes_owned');
    if (stored) {
      try {
        setOwnedInvitations(JSON.parse(stored));
      } catch (e) {
        console.error("Erreur parsing localStorage:", e);
        localStorage.removeItem('yesoryes_owned');
      }
    }

    // 2. Queue de Synchronisation (Resilience Offline)
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
          console.warn("Échec synchro silencieuse (sera réessayé plus tard)", e);
        }
      }
    };

    if (navigator.onLine) {
      syncPendingActions();
    }
  }, []);

  // --- 1. CRÉATION (Admin) ---
  const createInvitation = async (sender, valentine, plan) => {
    try {
      // Utilisation de notre générateur interne stable
      const newId = generateUUID();
      const newToken = generateUUID();

      const { data, error } = await supabase
        .from('invitations')
        .insert([
          {
            id: newId,
            sender: sender,
            valentine: valentine,
            plan: plan,
            admin_token: newToken,
            game_status: 'pending',
            payment_status: 'unpaid'
          }
        ])
        .select()
        .single();

      if (error) {
        console.error("Erreur createInvitation (DB):", error);
        throw error;
      }

      const newInvitation = {
        id: newId,
        valentine: valentine,
        token: newToken,
        createdAt: new Date().toISOString()
      };

      const updatedList = [newInvitation, ...ownedInvitations];
      setOwnedInvitations(updatedList);
      localStorage.setItem('yesoryes_owned', JSON.stringify(updatedList));

      return { id: newId, token: newToken };

    } catch (error) {
      console.error("Erreur critique création:", error);
      return { id: null, token: null };
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

      if (error) throw error;

      return {
        ...data,
        status: data.game_status
      };
    } catch (error) {
      console.error("Accès refusé ou erreur rapport espion:", error);
      return null;
    }
  };

  // --- 2. LECTURE PUBLIQUE (Valentine) ---
  const getPublicInvitation = async (id) => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('sender, valentine, plan, game_status, payment_status, attempts, viewed_at')
        .eq('id', id)
        .single();

      if (error) return null;

      if (data.payment_status !== 'paid') {
        console.warn("Invitation trouvée mais non payée.");
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

  // --- 3. TRACKING (Analytics & Jeu) ---
  const markAsViewed = async (id) => {
    supabase.rpc('mark_invitation_viewed', { target_id: id }).then(({ error }) => {
      if (error) console.error("Erreur markAsViewed", error);
    });
  };

  const incrementAttempts = async (id) => {
     // Placeholder pour futur usage ou appel RPC existant
  };

  // --- 4. ACTION FINALE (Le grand OUI) ---
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

      const { error } = await supabase
        .rpc('answer_invitation', {
          target_id: id,
          answer: 'accepted'
        });

      if (error) throw error;
      
      localStorage.removeItem('pending_acceptance');
      return true;

    } catch (error) {
      console.warn("Erreur réseau acceptInvitation (sauvegardé en local pour retry):", error);
      return false;
    }
  };

  // --- 5. UTILITAIRES ---
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
    ownedInvitations
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;
