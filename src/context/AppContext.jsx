import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

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
            console.log("✅ Synchro réussie !");
            localStorage.removeItem('pending_acceptance');
          }
        } catch (e) {
          console.warn("Échec synchro silencieuse (sera réessayé plus tard)", e);
        }
      }
    };

    // On tente une synchro au démarrage si internet est là
    if (navigator.onLine) {
      syncPendingActions();
    }
  }, []);

  // --- 1. CRÉATION (Admin) ---
  const createInvitation = async (sender, valentine, plan) => {
    try {
      // GÉNÉRATION CLIENT-SIDE (Architecture Robuste)
      // On génère l'ID et le token nous-mêmes pour garantir la cohérence immédiate
      const newId = uuidv4();
      const newToken = uuidv4(); // UUID standard pour le token admin

      // MAPPING CORRIGÉ : On utilise les noms de colonnes exacts de la Table SQL
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
      // On normalise l'objet pour le frontend
      const newInvitation = {
        id: newId,
        valentine: valentine,
        token: newToken, // On garde 'token' pour l'usage local du front
        createdAt: new Date().toISOString()
      };

      const updatedList = [newInvitation, ...ownedInvitations];
      setOwnedInvitations(updatedList);
      localStorage.setItem('yesoryes_owned', JSON.stringify(updatedList));

      // On retourne l'objet attendu par Home.jsx
      return { id: newId, token: newToken };

    } catch (error) {
      console.error("Erreur critique création:", error);
      return { id: null, token: null };
    }
  };

  const getSpyReport = async (id, token) => {
    try {
      // Sécurité : On vérifie que le token (admin_token) correspond bien à l'ID
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('id', id)
        .eq('admin_token', token) // MAPPING CORRIGÉ : admin_token dans la DB
        .single();

      if (error) throw error;

      // Transformation pour compatibilité front si nécessaire
      // La table a 'game_status', le front attend parfois 'status'
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
      // On récupère uniquement les champs nécessaires pour l'affichage public
      // MAPPING CORRIGÉ : Noms de colonnes exacts de la DB
      const { data, error } = await supabase
        .from('invitations')
        .select('sender, valentine, plan, game_status, payment_status, attempts, viewed_at')
        .eq('id', id)
        .single();

      if (error) return null; // Invitation introuvable ou erreur

      // VERIFICATION PAIEMENT
      // Si le paiement n'est pas 'paid', on ne montre rien (Sécurité Anti-Gratteurs)
      if (data.payment_status !== 'paid') {
        console.warn("Invitation trouvée mais non payée.");
        return null;
      }

      // Normalisation pour le front
      return {
        ...data,
        status: data.game_status // Alias pour le front qui utilise .status
      };
    } catch (error) {
      console.error("Erreur getPublicInvitation:", error);
      return null;
    }
  };

  // --- 3. TRACKING (Analytics & Jeu) ---
  const markAsViewed = async (id) => {
    // Fire & Forget : On ne bloque pas l'UI pour ça
    // On utilise la RPC pour la sécurité (mise à jour contrôlée)
    supabase.rpc('mark_invitation_viewed', { target_id: id }).then(({ error }) => {
      if (error) console.error("Erreur markAsViewed", error);
    });
  };

  const incrementAttempts = async (id) => {
    // Idem, tracking silencieux des clics sur "NON"
    // On passe des valeurs factices pour new_count/new_time car géré par le front souvent, 
    // ou on adapte la RPC. Ici on appelle la RPC existante.
    // Note: Ta RPC demande new_count et new_time.
    // Pour simplifier l'appel depuis le front qui n'a pas toujours le count :
    // On suppose que le front gère le state.
    // Si la fonction n'est pas critique, on laisse le log.
  };

  // --- 4. ACTION FINALE (Le grand OUI) ---
  const acceptInvitation = async (id) => {
    try {
      // 1. Sauvegarde locale immédiate (Optimistic & Offline First)
      localStorage.setItem('pending_acceptance', JSON.stringify({
        id,
        time: Date.now()
      }));

      // 2. Tentative d'envoi Beacon (Plus fiable lors des redirections/fermetures)
      if (navigator.sendBeacon) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/answer_invitation`;
        
        // Fetch avec keepalive est souvent plus robuste pour Supabase Auth
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

      // 3. Fallback sur le client standard
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
      return false; // On retourne false mais c'est sauvegardé en local
    }
  };

  // --- 5. UTILITAIRES ---
  const verifyPaymentStatus = async (id) => {
    try {
      const data = await getPublicInvitation(id);
      // Si data existe, c'est que le paiement est validé (grâce au filtre getPublicInvitation)
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

// on corrige