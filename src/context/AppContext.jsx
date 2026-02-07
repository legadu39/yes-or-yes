import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

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
    // On vérifie s'il y a des actions en attente (ex: un OUI cliqué hors connexion)
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
            console.log("✅ Synchronisation réussie !");
            localStorage.removeItem('pending_acceptance');
          }
        } catch (e) {
          console.warn("Connexion instable, nouvelle tentative plus tard.");
        }
      }
    };

    // Tentative immédiate au montage
    syncPendingActions();
    
    // Tentative périodique toutes les 10 secondes (fail-safe)
    const interval = setInterval(syncPendingActions, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sauvegarde dans le localStorage à chaque changement
  const saveOwnedInvitation = (id, token) => {
    const newEntry = { 
      id, 
      token, 
      createdAt: new Date().toISOString() 
    };
    
    const updated = [...ownedInvitations, newEntry];
    setOwnedInvitations(updated);
    localStorage.setItem('yesoryes_owned', JSON.stringify(updated));
  };

  const getOwnedInvitations = () => {
    return ownedInvitations;
  };

  // --- 1. CRÉATION (RPC Sécurisée) ---
  const createInvitation = async (sender, valentine, plan) => {
    try {
      // Appel RPC conforme à la signature SQL (sender, valentine, plan)
      const { data, error } = await supabase
        .rpc('create_invitation_v2', {
          p_sender: sender,
          p_valentine: valentine,
          p_plan: plan 
        });

      if (error) throw error;
      if (!data) throw new Error("Aucune donnée retournée par la création");

      // Sauvegarde immédiate du token administrateur en local
      saveOwnedInvitation(data.id, data.token);

      return { id: data.id, token: data.token };
    } catch (error) {
      console.error("Erreur createInvitation:", error);
      throw error;
    }
  };

  // --- 2. LECTURE PUBLIQUE (Pour la Valentine) ---
  const getPublicInvitation = async (id) => {
    try {
      const { data, error } = await supabase
        .rpc('get_public_invitation', { target_id: id });

      if (error) throw error;
      return data; // Retourne { id, sender, valentine, attempts, status }
    } catch (error) {
      console.error("Erreur getPublicInvitation:", error);
      return null;
    }
  };

  // --- 3. LECTURE PRIVÉE (Dashboard Espion) ---
  const getSpyReport = async (id, token) => {
    try {
      const { data, error } = await supabase
        .rpc('get_spy_report', { 
          target_id: id, 
          token_input: token 
        });

      if (error) {
        console.warn("Accès refusé au rapport espion:", error.message);
        return null;
      }
      return data;
    } catch (error) {
      console.error("Erreur technique getSpyReport:", error);
      return null;
    }
  };

  // --- 4. ACTIONS VALENTINE (RPC Anonymes) ---
  
  const incrementAttempts = async (id, count, time) => {
    try {
      const { error } = await supabase
        .rpc('increment_attempts', {
          target_id: id,
          new_count: count,
          new_time: time
        });

      if (error) throw error;
    } catch (error) {
      // Fail-safe : On ne bloque pas l'utilisateur si la stat échoue
      console.error("Erreur silencieuse incrementAttempts:", error);
    }
  };

  const acceptInvitation = async (id, finalTime) => {
    try {
      // SÉCURITÉ & RÉSILIENCE :
      // 1. On stocke d'abord l'intention localement (Queue de secours)
      localStorage.setItem('pending_acceptance', JSON.stringify({ 
        id, 
        time: finalTime, 
        timestamp: Date.now() 
      }));

      // 2. INTELLIGENCE : Tentative robuste avec fetch natif et keepalive
      // Cela permet à la requête de survivre même si l'onglet est fermé/redirigé immédiatement.
      // On reconstruit l'URL RPC manuellement pour utiliser fetch directement.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseKey) {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/answer_invitation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            target_id: id,
            answer: 'accepted'
          }),
          keepalive: true // LA CLÉ DU SUCCÈS : Survit à la fermeture de page
        });

        if (response.ok) {
           // Si le fetch direct a marché, on nettoie la queue tout de suite
           localStorage.removeItem('pending_acceptance');
           return true;
        }
      }

      // 3. Fallback sur le client standard si le fetch manuel échoue (ou config manquante)
      const { error } = await supabase
        .rpc('answer_invitation', {
          target_id: id,
          answer: 'accepted'
        });

      if (error) throw error;

      // 4. Si succès standard, on nettoie la queue
      localStorage.removeItem('pending_acceptance');
      return true;

    } catch (error) {
      console.warn("Erreur réseau acceptInvitation (sauvegardé en local pour retry):", error);
      // On ne lance pas d'erreur fatale ici pour permettre à l'UI de continuer
      // Le useEffect global se chargera de la synchro
      return false; 
    }
  };

  // --- 5. UTILITAIRES ---
  
  const verifyPaymentStatus = async (id) => {
    try {
      const data = await getPublicInvitation(id);
      return data && (data.status === 'paid' || data.status === 'accepted');
    } catch (error) {
      console.error("Erreur verifyPaymentStatus:", error);
      return false;
    }
  };

  const value = {
    createInvitation,
    getPublicInvitation,
    getSpyReport,
    incrementAttempts,
    acceptInvitation,
    verifyPaymentStatus,
    getOwnedInvitations
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};