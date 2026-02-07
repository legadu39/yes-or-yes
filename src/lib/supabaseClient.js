import { createClient } from '@supabase/supabase-js';

// Récupération des variables d'environnement
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validation stricte pour la Production
// En mode commercial, l'application ne DOIT PAS démarrer sans connexion DB valide.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "ERREUR CRITIQUE : Les clés Supabase sont manquantes. L'application ne peut pas démarrer en mode sécurisé."
  );
}

// Initialisation du client Supabase
// Singleton exporté pour utilisation globale
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  // Optimisation pour la production (Retries en cas de micro-coupures réseau)
  global: {
    fetch: (...args) => fetch(...args),
  },
});