import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Legal = () => {
  const { type } = useParams();

  const renderContent = () => {
    switch (type) {
      case 'mentions-legales':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="text-xl text-rose-gold mb-2">1. Éditeur du site</h3>
              <p>
                Le site <strong>YesOrYes</strong> est édité par :<br/>
                [VOTRE NOM OU NOM DE SOCIÉTÉ]<br/>
                [VOTRE ADRESSE POSTALE COMPLÈTE]<br/>
                SIRET : [VOTRE NUMÉRO SIRET]<br/>
                Directeur de la publication : [VOTRE NOM]<br/>
                Contact : [VOTRE EMAIL DE SUPPORT]
              </p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">2. Hébergement</h3>
              <p>
                Ce site est hébergé par :<br/>
                <strong>Vercel Inc.</strong><br/>
                340 S Lemon Ave #4133 Walnut, CA 91789, USA<br/>
                https://vercel.com
              </p>
            </section>
          </div>
        );

      case 'cgv':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="text-xl text-rose-gold mb-2">1. Objet</h3>
              <p>Les présentes CGV régissent la vente des services numériques "YesOrYes" (création d'invitations interactives).</p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">2. Prix et Paiement</h3>
              <p>Les prix sont indiqués en euros TTC. Le paiement est exigible immédiatement à la commande via la plateforme sécurisée Stripe.</p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">3. Livraison</h3>
              <p>Le service est accessible immédiatement après validation du paiement. Un lien unique est généré et affiché à l'utilisateur.</p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">4. Rétractation</h3>
              <p>
                Conformément à l'article L221-28 du Code de la Consommation, le droit de rétractation 
                ne peut être exercé pour les contenus numériques non fournis sur un support matériel 
                dont l'exécution a commencé après accord préalable exprès du consommateur et renoncement exprès à son droit de rétractation.
                En validant la commande, vous renoncez expressément à votre droit de rétractation.
              </p>
            </section>
          </div>
        );

      case 'confidentialite':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="text-xl text-rose-gold mb-2">1. Données collectées</h3>
              <p>Nous collectons uniquement les données strictement nécessaires au fonctionnement du service :</p>
              <ul className="list-disc pl-5 mt-2 space-y-1 opacity-80">
                  <li>Prénoms (expéditeur et destinataire) pour la personnalisation.</li>
                  <li>Données techniques de connexion (adresse IP, User Agent) à des fins de sécurité et de statistiques anonymes.</li>
                  <li>Données de paiement (gérées intégralement par Stripe, nous n'avons jamais accès à vos numéros de carte).</li>
              </ul>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">2. Cookies</h3>
              <p>Nous utilisons uniquement des cookies techniques essentiels au fonctionnement de l'application (maintien de session, sécurité). Aucun cookie publicitaire tiers n'est utilisé.</p>
            </section>
            <section>
                <h3 className="text-xl text-rose-gold mb-2">3. Durée de conservation</h3>
                <p>Les invitations et les données associées sont conservées pour une durée déterminée (ex: 1 an) avant suppression automatique, sauf demande explicite de suppression de votre part.</p>
            </section>
          </div>
        );

      default:
        return (
            <div className="text-center py-10">
                <p className="text-xl text-rose-gold">Page non trouvée.</p>
                <p className="text-sm opacity-60 mt-2">L'URL demandée n'existe pas.</p>
            </div>
        );
    }
  };

  const getTitle = () => {
    switch(type) {
      case 'mentions-legales': return 'Mentions Légales';
      case 'cgv': return 'Conditions Générales de Vente';
      case 'confidentialite': return 'Politique de Confidentialité';
      default: return 'Information';
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 font-serif text-cream flex justify-center pt-24 relative z-10 animate-fade-in">
      <div className="max-w-3xl w-full">
        <Link to="/" className="inline-flex items-center gap-2 text-rose-gold hover:text-rose-pale mb-8 transition-colors group">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Retour à l'accueil
        </Link>
        
        <div className="bg-ruby-dark/80 backdrop-blur-xl border border-rose-gold/20 p-8 md:p-10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <h1 className="text-3xl md:text-4xl font-script text-rose-pale mb-8 border-b border-rose-gold/30 pb-4">
            {getTitle()}
          </h1>
          <div className="text-sm md:text-base leading-relaxed text-cream/80 font-light">
            {renderContent()}
          </div>
        </div>
        
        <footer className="mt-8 text-center text-xs text-rose-gold/40">
            Document légal - YesOrYes © {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
};

export default Legal;