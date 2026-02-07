import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { buffer } from 'micro';

// --- CONFIGURATION CRITIQUE VERCEL ---
// Désactive le parsing automatique du body pour permettre la vérification de signature Stripe.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Client Supabase Admin (Service Role) : Contourne le RLS pour mettre à jour le statut.
// ATTENTION : Ne jamais exposer SUPABASE_SERVICE_ROLE_KEY côté client !
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  let event;

  try {
    // 1. Lecture du Raw Body (Nécessaire pour Stripe)
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        throw new Error("Variable STRIPE_WEBHOOK_SECRET manquante côté serveur.");
    }

    // 2. Validation cryptographique
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️ Webhook Signature Error: ${err.message}`);
    // Retourner 400 indique à Stripe de ne pas réessayer immédiatement (ou erreur de config)
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 3. Gestion de l'événement Checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // On récupère l'ID passé lors de la création du lien Stripe
    const invitationId = session.client_reference_id || session.metadata?.invitationId;

    if (!invitationId) {
        console.error('❌ Erreur: Pas d\'invitationId trouvé dans la session', session.id);
        // On retourne 200 pour éviter que Stripe ne boucle indéfiniment sur une erreur logique
        return res.json({ received: true });
    }

    console.log(`💰 Paiement reçu pour: ${invitationId}`);

    try {
        // Idempotence : Vérifier si déjà payé pour éviter travail inutile
        const { data: current, error: fetchError } = await supabaseAdmin
            .from('invitations')
            .select('payment_status')
            .eq('id', invitationId)
            .single();

        if (!fetchError && current && current.payment_status === 'paid') {
             console.log('ℹ️ Déjà traité.');
             return res.json({ received: true });
        }

        // Mise à jour du statut PAIEMENT (Sécurité: on ne touche pas au game_status)
        const { error } = await supabaseAdmin
          .from('invitations')
          .update({ 
            payment_status: 'paid', 
            stripe_session_id: session.id,
          })
          .eq('id', invitationId);

        if (error) {
          console.error('❌ Erreur Supabase:', error);
          return res.status(500).json({ error: 'Database update failed' });
        }
        
        console.log('✅ Base de données mise à jour avec succès (PAID).');

    } catch (err) {
        console.error('❌ Exception serveur:', err);
        return res.status(500).send('Internal Server Error');
    }
  }

  res.json({ received: true });
}