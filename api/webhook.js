// ============================================================================
// WEBHOOK STRIPE - VERSION CORRIGÉE POUR VERCEL
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

// Client Supabase Admin avec Service Role (contourne RLS)
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ Variable d'environnement OBLIGATOIRE
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET manquant');
      return res.status(500).json({ error: 'Configuration serveur incorrecte' });
    }

    // 3. Vérification cryptographique de la signature Stripe
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    console.log('✅ Webhook Stripe vérifié:', event.type);

  } catch (err) {
    console.error('❌ Erreur vérification signature:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // 4. Traitement de l'événement checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // 🔧 FIX : Récupération de l'ID depuis client_reference_id ET metadata
    const invitationId = session.client_reference_id || session.metadata?.invitationId;

    if (!invitationId) {
      console.error('❌ Aucun invitationId trouvé dans la session Stripe:', session.id);
      return res.status(200).json({ received: true, warning: 'No invitation ID' });
    }

    console.log(`💰 Paiement reçu pour invitation: ${invitationId}`);

    try {
      // 5. Vérification d'idempotence (éviter les doublons)
      const { data: current, error: fetchError } = await supabaseAdmin
        .from('invitations')
        .select('payment_status, id')
        .eq('id', invitationId)
        .single();

      if (fetchError) {
        console.error('❌ Erreur lecture Supabase:', fetchError);
        return res.status(500).json({ error: 'Database read failed' });
      }

      if (!current) {
        console.error('❌ Invitation introuvable:', invitationId);
        return res.status(404).json({ error: 'Invitation not found' });
      }

      if (current.payment_status === 'paid') {
        console.log('ℹ️ Déjà traité (idempotence)');
        return res.status(200).json({ received: true, status: 'already_paid' });
      }

      // 6. 🔧 MISE À JOUR CRITIQUE : Passer payment_status à 'paid'
      const { error: updateError } = await supabaseAdmin
        .from('invitations')
        .update({ 
          payment_status: 'paid',
          stripe_session_id: session.id
        })
        .eq('id', invitationId);

      if (updateError) {
        console.error('❌ Erreur mise à jour Supabase:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint
        });
        return res.status(500).json({ error: 'Database update failed', details: updateError.message });
      }

      console.log(`✅ Invitation ${invitationId} marquée comme PAID`);
      return res.status(200).json({ received: true, status: 'updated' });

    } catch (err) {
      console.error('❌ Exception serveur:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // 7. Autres événements Stripe (ignorés mais loggés)
  console.log(`ℹ️ Événement Stripe ignoré: ${event.type}`);
  return res.status(200).json({ received: true });
}