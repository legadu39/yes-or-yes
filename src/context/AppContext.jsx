import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// --- UTILITAIRE DE GÉNÉRATION D'ID (Sans dépendance externe) ---
// Remplace 'uuid' pour éviter les erreurs de build/import "n is not a function"
const generateUUID = () => {
  // Méthode moderne (Navigateurs récents & HTTPS)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback robuste (Compatible tout navigateur)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
      // GÉNÉRATION CLIENT-SIDE (Version Native)
      const newId = generateUUID();
      const newToken = generateUUID();

      // MAPPING TABLE SQL
      const { data, error } = await supabase
        .from('invitations')
        .insert([
          {
            id: newId,
            sender: sender,          // SQL: sender
            valentine: valentine,    // SQL: valentine
            plan: plan,              // SQL: plan
            admin_token: newToken,   // SQL: admin_token
            game_status: 'pending',  // SQL: game_status
            payment_status: 'unpaid' // SQL: payment_status
          }
        ])
        .select()
        .single();

      if (error) {
        console.error("Erreur createInvitation (DB):", error);
        throw error;
      }

      // Mise à jour du store local
      const newInvitation = {
        id: newId,
        valentine: valentine,
        token: newToken,
        createdAt: new Date().toISOString()
      };

      // Protection contre undefined
      const currentList = Array.isArray(ownedInvitations) ? ownedInvitations : [];
      const updatedList = [newInvitation, ...currentList];
      
      setOwnedInvitations(updatedList);
      localStorage.setItem('yesoryes_owned', JSON.stringify(updatedList));

      return { id: newId, token: newToken };

    } catch (error) {
      console.error("Erreur critique création:", error);
      // On retourne null pour que l'UI puisse gérer l'erreur
      return null;
    }
  };

  const getSpyReport = async (id, token) => {
    try {
      // Sécurité : On vérifie que le token (admin_token) correspond bien à l'ID
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('id', id)
        .eq('admin_token', token)
        .single();

      if (error) throw error;

      return {
        ...data,
        status: data.game_status // Alias pour compatibilité
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

      // VERIFICATION PAIEMENT (Sécurité Anti-Gratteurs)
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

  // CORRECTION : Implémentation de la fonction qui était vide
  const incrementAttempts = async (id) => {
    try {
      // On utilise la RPC pour incrémenter le compteur côté serveur de manière atomique
      const { error } = await supabase.rpc('increment_attempts', { target_id: id });
      if (error) console.error("Erreur incrementAttempts", error);
    } catch (e) {
      // Erreur silencieuse pour ne pas gêner le jeu
    }
  };

  // --- 4. ACTION FINALE (Le grand OUI) ---
  const acceptInvitation = async (id) => {
    try {
      // 1. Sauvegarde locale
      localStorage.setItem('pending_acceptance', JSON.stringify({
        id,
        time: Date.now()
      }));

      // 2. Tentative Beacon/Fetch Keepalive
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

      // 3. Fallback client standard
      const { error } = await supabase
        .rpc('answer_invitation', {
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