import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { buffer } from 'micro';

// --- CONFIGURATION VERCEL ---
export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialisation sécurisée des clients
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  // Vérification critique des variables d'environnement avant traitement
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
    console.error("❌ Erreur Configuration : Variables d'environnement manquantes côté serveur.");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  let event;

  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️ Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Récupération multi-sources de l'ID pour parer aux variations de l'API Stripe
    const invitationId = session.client_reference_id || 
                         session.metadata?.invitationId || 
                         session.metadata?.id;

    if (!invitationId) {
        console.error('❌ Erreur: Aucun ID d\'invitation trouvé dans la session Stripe:', session.id);
        return res.status(200).json({ received: true, warning: "Missing reference ID" });
    }

    console.log(`💰 Traitement paiement pour l'invitation: ${invitationId}`);

    try {
        // Vérification d'idempotence
        const { data: current, error: fetchError } = await supabaseAdmin
            .from('invitations')
            .select('payment_status')
            .eq('id', invitationId)
            .single();

        if (fetchError) {
          console.error('❌ Erreur lors de la vérification Supabase:', fetchError);
          return res.status(500).json({ error: 'Database fetch failed' });
        }

        if (current && current.payment_status === 'paid') {
             console.log('ℹ️ Invitation déjà marquée comme payée.');
             return res.json({ received: true });
        }

        // Mise à jour atomique du statut
        const { error: updateError } = await supabaseAdmin
          .from('invitations')
          .update({ 
            payment_status: 'paid', 
            stripe_session_id: session.id,
          })
          .eq('id', invitationId);

        if (updateError) {
          console.error('❌ Erreur lors de la mise à jour Supabase:', updateError);
          return res.status(500).json({ error: 'Database update failed' });
        }
        
        console.log('✅ Statut de paiement mis à jour avec succès (PAID).');

    } catch (err) {
        console.error('❌ Exception serveur lors du traitement webhook:', err);
        return res.status(500).send('Internal Server Error');
    }
  }

  res.json({ received: true });
}