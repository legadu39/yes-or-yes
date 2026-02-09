// ============================================================================
// WEBHOOK STRIPE - VERSION CHIRURGICALE & ROBUSTE (INTELLIGENTE)
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
    console.log(`✅ Webhook Stripe reçu et vérifié: ${event.type}`);

  } catch (err) {
    console.error('❌ Erreur vérification signature:', err.message);
    return res.status(400).json({ error: `Webhook Signature Error: ${err.message}` });
  }

  // 4. Traitement de l'événement checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Récupération robuste de l'ID (Support du format composite ID___TOKEN)
    // On nettoie l'ID pour ne garder que la partie UUID avant le séparateur "___"
    let rawId = session.client_reference_id || session.metadata?.invitationId;
    const invitationId = rawId ? rawId.split('___')[0] : null;

    if (!invitationId) {
      console.error('❌ Aucun invitationId trouvé dans la session Stripe:', session.id);
      return res.status(200).json({ received: true, warning: 'No invitation ID found' });
    }

    console.log(`💰 Paiement reçu pour invitation: ${invitationId} (RawRef: ${rawId})`);

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
      const amountPaid = session.amount_total; // en cents
      
      const updateData = { 
        payment_status: 'paid',
        stripe_session_id: session.id,
        updated_at: new Date().toISOString()
      };

      // --- LOGIQUE D'UPGRADE "PARANOIAQUE" (ROBUSTE) ---
      // On force le passage en SPY si :
      // A. Le montant ressemble à l'offre Spy (2.50€ +/- taxes)
      // B. Le montant ressemble à l'offre Upsell (1.00€ +/- taxes)
      // C. L'utilisateur a DÉJÀ payé (Basic) et repaie -> C'est forcément un upgrade
      
      const isSpyPrice = (amountPaid >= 230 && amountPaid <= 270); // 2.50€ +/-
      const isUpsellPrice = (amountPaid >= 80 && amountPaid <= 130); // 1.00€ +/-
      const isAlreadyPaid = current.payment_status === 'paid';

      if (isSpyPrice || isUpsellPrice || isAlreadyPaid) {
          console.log(`✨ UPGRADE DÉTECTÉ (Montant: ${amountPaid}, Déjà payé: ${isAlreadyPaid}). Passage au plan 'spy'.`);
          updateData.plan = 'spy';
      } else {
          console.log(`ℹ️ Paiement Standard (Montant: ${amountPaid}). Plan actuel conservé: ${current.plan}`);
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

      console.log(`✅ SUCCÈS : Invitation ${invitationId} mise à jour (Plan Final: ${updateData.plan || current.plan})`);
      return res.status(200).json({ received: true, status: 'updated_to_paid' });

    } catch (err) {
      console.error('❌ Exception serveur inattendue:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // 8. Autres événements Stripe
  return res.status(200).json({ received: true });
}