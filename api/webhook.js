// ============================================================================
// WEBHOOK STRIPE - VERSION FINALISÉE (Sécurité + Intelligence Financière)
// Fichier : api/webhook.js
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// ⚠️ CRITIQUE : Vercel nécessite cette configuration pour les webhooks
export const config = {
  api: {
    bodyParser: false, // Désactive le parsing pour vérifier la signature Stripe
  },
};

// --- INITIALISATION SÉCURISÉE DES VARIABLES D'ENVIRONNEMENT ---
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Client Supabase Admin avec Service Role (contourne RLS pour l'update)
const supabaseAdmin = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

const stripe = new Stripe(STRIPE_SECRET);

// ============================================================================
// FONCTION UTILITAIRE : Lire le body brut (requis par Stripe)
// ============================================================================
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
export default async function handler(req, res) {
  // 1. Vérification méthode HTTP
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vérification de sécurité critique au démarrage de la requête
  if (!supabaseAdmin) {
    console.error("🚨 CRASH: Supabase URL ou Key manquante. Vérifiez les variables d'environnement.");
    return res.status(500).json({ error: 'Server Configuration Error' });
  }

  if (!WEBHOOK_SECRET) {
    console.error('❌ STRIPE_WEBHOOK_SECRET manquant côté serveur');
    return res.status(500).json({ error: 'Server Configuration Error' });
  }

  let event;

  try {
    // 2. Lecture du body brut
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    // 3. Vérification cryptographique de la signature Stripe
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
    // console.log(`✅ Webhook Stripe reçu et vérifié: ${event.type}`); // Commenté pour réduire le bruit

  } catch (err) {
    console.error('❌ Erreur vérification signature:', err.message);
    return res.status(400).json({ error: `Webhook Signature Error: ${err.message}` });
  }

  // 4. Traitement de l'événement checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // --- CORRECTION DU BUG UUID (Extraction Robuste) ---
    // On récupère le client_reference_id envoyé par le front (format: "UUID" ou "UUID___TOKEN")
    const rawReference = session.client_reference_id;
    
    // Extraction propre de l'UUID (partie avant le '___')
    // Si pas de référence, on tente fallback sur metadata, sinon null
    let invitationId = null;
    
    if (rawReference) {
        invitationId = rawReference.split('___')[0];
    } else if (session.metadata?.invitationId) {
        invitationId = session.metadata.invitationId;
    }

    // Validation Regex pour éviter le crash "invalid input syntax" si Stripe renvoie autre chose
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!invitationId || !uuidRegex.test(invitationId)) {
      console.error(`❌ ID invalide ou manquant dans la session: "${invitationId}" (RawRef: ${rawReference})`);
      // On répond 200 pour que Stripe arrête de renvoyer l'erreur, mais on log le problème
      return res.status(200).json({ received: true, warning: 'Invalid or missing invitation ID' });
    }

    console.log(`💰 Paiement validé pour l'invitation: ${invitationId}`);

    try {
      // 5. Récupération de l'état ACTUEL avant mise à jour
      const { data: current, error: fetchError } = await supabaseAdmin
        .from('invitations')
        .select('payment_status, id, plan')
        .eq('id', invitationId)
        .single();

      if (fetchError) {
        console.error('❌ Erreur lecture Supabase:', fetchError);
        return res.status(500).json({ error: 'Database connection failed' });
      }

      if (!current) {
        console.error('❌ Invitation introuvable en base:', invitationId);
        return res.status(404).json({ error: 'Invitation not found in DB' });
      }

      // 6. INTELLIGENCE FINANCIÈRE : DÉCISION DU PLAN
      // On vérifie le montant pour savoir si c'est l'Upsell (1€) ou le prix normal
      const amountPaid = session.amount_total; // en cents
      
      const updateData = { 
        payment_status: 'paid',
        stripe_payment_id: session.id, // Correction du nom de colonne pour correspondre à ton schéma (stripe_payment_id vs stripe_session_id)
        updated_at: new Date().toISOString()
      };

      // --- LOGIQUE D'UPGRADE ROBUSTE ---
      // A. Offre Spy standard (~2.50€ = 250 cents)
      const isSpyPrice = (amountPaid >= 230 && amountPaid <= 270); 
      // B. Offre Upsell (~1.00€ = 100 cents)
      const isUpsellPrice = (amountPaid >= 80 && amountPaid <= 130);
      // C. L'utilisateur a DÉJÀ payé -> Upgrade forcé
      const isAlreadyPaid = current.payment_status === 'paid';

      if (isSpyPrice || isUpsellPrice || isAlreadyPaid) {
          console.log(`✨ UPGRADE CONFIRMÉ (Montant: ${amountPaid}, Déjà payé: ${isAlreadyPaid}) -> Passage en SPY`);
          updateData.plan = 'spy';
      } else {
          console.log(`ℹ️ Paiement reçu (Montant: ${amountPaid}). Plan conservé: ${current.plan}`);
      }

      // 7. Mise à jour DB
      const { error: updateError } = await supabaseAdmin
        .from('invitations')
        .update(updateData)
        .eq('id', invitationId);

      if (updateError) {
        console.error('❌ Erreur mise à jour Supabase:', updateError);
        return res.status(500).json({ error: 'Database update failed', details: updateError.message });
      }

      console.log(`✅ SUCCÈS FINAL : Invitation ${invitationId} mise à jour.`);
      return res.status(200).json({ received: true, status: 'updated_to_paid' });

    } catch (err) {
      console.error('❌ Exception serveur inattendue:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // 8. Autres événements Stripe
  return res.status(200).json({ received: true });
}