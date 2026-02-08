import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, Share2, Download, Check, Stars } from 'lucide-react';
import confetti from 'canvas-confetti';

const AcceptedPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  
  // Récupération sécurisée des données (passées depuis ValentinePage)
  const invitation = location.state?.invitation;

  useEffect(() => {
    if (!invitation) {
      // Si pas d'invitation (accès direct à l'url), retour accueil
      navigate('/');
      return;
    }

    // Explosion de joie au chargement
    const duration = 3000;
    const end = Date.now() + duration;
    
    const frame = () => {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#D24D57', '#F4D03F'] });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#D24D57', '#F4D03F'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [invitation, navigate]);

  const handleShare = async () => {
    const text = `J'ai dit OUI ! ❤️\n${invitation.sender} m'a fait la plus belle des demandes sur YesOrYes.`;
    const url = window.location.origin; // On partage la home pour que les autres créent la leur

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Elle a dit OUI !',
          text: text,
          url: url
        });
      } catch (err) {
        console.log('Share failed', err);
      }
    } else {
      navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!invitation) return null;

  return (
    <div className="h-screen w-screen bg-ruby-dark flex flex-col items-center justify-center p-6 relative overflow-hidden animate-fade-in">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ruby-light/30 via-ruby-dark to-[#1a0508] pointer-events-none"></div>
      
      <div className="relative z-10 max-w-md w-full text-center">
        
        <div className="mb-8 inline-block p-6 rounded-full bg-gradient-to-br from-rose-gold/20 to-ruby-light/10 border border-rose-gold/50 shadow-[0_0_50px_rgba(210,77,87,0.4)] animate-pulse-slow">
            <Heart size={64} className="text-ruby-light fill-current drop-shadow-lg" />
        </div>

        <h1 className="text-5xl font-script text-rose-pale mb-2 drop-shadow-md">Félicitations !</h1>
        <p className="text-rose-pale/60 font-serif italic mb-10 text-lg">
            L'amour a triomphé.
        </p>

        {/* CARTE DE PARTAGE */}
        <div className="bg-white/5 backdrop-blur-xl border border-rose-gold/30 rounded-2xl p-6 shadow-2xl transform rotate-1 hover:rotate-0 transition-transform duration-500 group">
            <div className="absolute -top-3 -right-3">
                <Stars className="text-yellow-400 w-8 h-8 fill-current animate-bounce" />
            </div>

            <p className="text-xs uppercase tracking-widest text-rose-gold/70 mb-4 font-bold">Le Verdict</p>
            
            <div className="border-l-2 border-rose-gold/50 pl-4 text-left mb-6">
                <p className="text-2xl font-serif text-cream mb-1">
                    "{invitation.valentine} a dit <span className="text-ruby-light font-bold">OUI</span>"
                </p>
                <p className="text-sm text-cream/50">
                    à la demande de {invitation.sender}
                </p>
            </div>

            <button 
                onClick={handleShare}
                className="w-full py-3 bg-gradient-to-r from-rose-gold to-ruby-light rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 hover:shadow-rose-gold/40 transition-all active:scale-95"
            >
                {copied ? <Check size={18} /> : <Share2 size={18} />}
                {copied ? "Lien copié !" : "Partager la nouvelle"}
            </button>
        </div>

        <div className="mt-12">
            <button 
                onClick={() => navigate('/')}
                className="text-rose-pale/40 hover:text-rose-pale text-sm transition-colors underline underline-offset-4"
            >
                Créer ma propre demande
            </button>
        </div>

      </div>
    </div>
  );
};

export default AcceptedPage;