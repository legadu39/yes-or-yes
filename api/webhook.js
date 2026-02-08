import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Configuration Vercel pour ne pas parser le body (requis pour la signature)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Fonction utilitaire pour lire le buffer brut de la requête
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // 1. Logs de démarrage (Diagnostic)
  console.log("🔔 WEBHOOK INITIÉ - Méthode:", req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Initialisation des services
  // Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  
  // Supabase (Admin Context - Service Role)
  // On utilise SUPABASE_URL en priorité (standard), sinon VITE_ (héritage frontend)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERREUR CONFIG: Variables d'environnement manquantes", { 
      hasUrl: !!supabaseUrl, 
      hasKey: !!supabaseKey 
    });
    return res.status(500).json({ error: "Configuration serveur manquante" });
  }

  // Création du client avec droits Admin (bypass RLS)
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // 3. Lecture et Validation de la Signature Stripe
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log("✅ Signature validée. Event type:", event.type);
  } catch (err) {
    console.error(`❌ Erreur Signature: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 4. Traitement de l'événement de paiement réussi
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const sessionId = session.id; // ID Stripe (ex: cs_test_...)
    
    // On essaie de récupérer l'ID de l'invitation depuis les métadonnées ou client_reference_id
    // Mais le plus fiable est de matcher sur stripe_session_id si on l'a enregistré avant
    const invitationId = session.client_reference_id;

    console.log(`💰 Session complétée reçue: ${sessionId} pour Invitation ID: ${invitationId || 'Inconnu'}`);

    // MISE À JOUR BASE DE DONNÉES
    // On met à jour le statut ET l'ID de session si ce n'était pas fait
    const updates = { 
      payment_status: 'paid',
      updated_at: new Date().toISOString()
    };
    
    // Stratégie de mise à jour : On cherche par stripe_session_id en priorité
    let query = supabase.from('invitations').update(updates).eq('stripe_session_id', sessionId);
    
    // Si on n'a pas trouvé par session ID, on essaie par ID (fallback)
    // Note: Pour simplifier, ici on suppose que la colonne stripe_session_id est bien remplie à la création.
    // Si ce n'est pas le cas, on pourrait ajouter une logique de fallback.
    
    const { data, error } = await query.select();

    if (error) {
      console.error('❌ ERREUR SUPABASE UPDATE:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      console.warn('⚠️ AUCUNE LIGNE MISE À JOUR. Vérifiez que le stripe_session_id correspond bien en base.');
      // Tentative de secours : Update par l'ID de l'invitation si disponible
      if (invitationId) {
        console.log('🔄 Tentative de mise à jour via ID invitation...');
        const { error: fallbackError } = await supabase
            .from('invitations')
            .update({ payment_status: 'paid', stripe_session_id: sessionId })
            .eq('id', invitationId);
            
        if (fallbackError) console.error('❌ Echec fallback:', fallbackError);
        else console.log('✅ Succès fallback via ID.');
      }
    } else {
      console.log('🎉 SUCCÈS ! Base de données mise à jour:', data);
    }
  } else {
    console.log(`ℹ️ Événement ignoré: ${event.type}`);
  }

  res.status(200).json({ received: true });
}