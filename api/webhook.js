// ============================================================================
// WEBHOOK STRIPE - VERSION CHIRURGICALE & ROBUSTE
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
// Vercel Backend ne voit pas toujours les variables VITE_ par défaut.
// On assure une compatibilité double.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ CRITICAL ERROR: Variables d'environnement Supabase manquantes.");
  // On ne lance pas d'erreur ici pour éviter de crasher tout le module, 
  // mais les appels échoueront proprement.
}

// Client Supabase Admin avec Service Role (contourne RLS pour l'update)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

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

  let event;

  try {
    // 2. Lecture du body brut
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    if (!WEBHOOK_SECRET) {
      console.error('❌ STRIPE_WEBHOOK_SECRET manquant côté serveur');
      return res.status(500).json({ error: 'Server Configuration Error' });
    }

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
    
    // 🔧 FIX : Récupération robuste de l'ID
    // On priorise client_reference_id, sinon on cherche dans les metadata
    const invitationId = session.client_reference_id || session.metadata?.invitationId;

    if (!invitationId) {
      console.error('❌ Aucun invitationId trouvé dans la session Stripe:', session.id);
      return res.status(200).json({ received: true, warning: 'No invitation ID found' });
    }

    console.log(`💰 Paiement validé pour invitation: ${invitationId}`);

    try {
      // 5. Vérification d'idempotence (éviter les doublons et race conditions)
      const { data: current, error: fetchError } = await supabaseAdmin
        .from('invitations')
        .select('payment_status, id')
        .eq('id', invitationId)
        .single();

      if (fetchError) {
        console.error('❌ Erreur lecture Supabase:', fetchError);
        // Si erreur connexion DB, on renvoie 500 pour que Stripe réessaie plus tard
        return res.status(500).json({ error: 'Database connection failed' });
      }

      if (!current) {
        console.error('❌ Invitation introuvable en base:', invitationId);
        // 404 signifie qu'on ne doit pas réessayer, l'ID est invalide
        return res.status(404).json({ error: 'Invitation not found in DB' });
      }

      // Si déjà payé, on sort proprement
      if (current.payment_status === 'paid') {
        console.log('ℹ️ Invitation déjà traitée (idempotence)');
        return res.status(200).json({ received: true, status: 'already_paid' });
      }

      // 6. 🔧 MISE À JOUR CRITIQUE : Passer payment_status à 'paid'
      const { error: updateError } = await supabaseAdmin
        .from('invitations')
        .update({ 
          payment_status: 'paid',
          stripe_session_id: session.id, // Important pour la récupération par session_id
          updated_at: new Date().toISOString()
        })
        .eq('id', invitationId);

      if (updateError) {
        console.error('❌ Erreur mise à jour Supabase:', updateError);
        return res.status(500).json({ error: 'Database update failed', details: updateError.message });
      }

      console.log(`✅ SUCCÈS : Invitation ${invitationId} marquée comme PAID`);
      return res.status(200).json({ received: true, status: 'updated_to_paid' });

    } catch (err) {
      console.error('❌ Exception serveur inattendue:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // 7. Autres événements Stripe (traités par défaut)
  return res.status(200).json({ received: true });
}