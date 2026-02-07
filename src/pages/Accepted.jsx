import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { useApp } from '../context/AppContext';
import { Share2, Heart, Sparkles, ArrowRight, Copy, Download, Loader2 } from 'lucide-react';

const Accepted = () => {
  const { getInvitation } = useApp();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const cardRef = useRef(null);

  // Tentative de récupération ID depuis l'URL locale si context vide (pour la résilience au refresh)
  const currentInvitationId = window.location.pathname.split('/').pop() === 'accepted' ? localStorage.getItem('last_viewed_invite') : null;

  useEffect(() => {
    // Récupération sécurisée des données pour l'affichage de la victoire
    const recoverData = async () => {
        const localInvites = JSON.parse(localStorage.getItem('yesoryes_invitations') || '[]');
        // Trouver la plus récente acceptée pour l'affichage immédiat
        const lastAccepted = localInvites.filter(i => i.status === 'accepted').pop();
        
        if (lastAccepted) {
            setInvitation(lastAccepted);
            triggerCelebration();
        } 
    };

    recoverData();
  }, [navigate]);

  const triggerCelebration = () => {
    // 1. Lancement des Confettis (Version Canvas optimisée)
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#B76E79', '#9B1B30', '#FADADD', '#FFFDD0']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#B76E79', '#9B1B30', '#FADADD', '#FFFDD0']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // 2. Retour Haptique (Vibration de victoire)
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  };

  if (!invitation) return null;

  const shareUrl = `${window.location.origin}/v/${invitation.id}`;
  // ALIGNEMENT BUSINESS PLAN : Message Viral Spécifique
  const shareTitle = `Elle a dit OUI ! ❤️`;
  const shareText = `J'ai dit OUI... (Le bouton NON s'enfuyait) 😂 \n\nToi aussi, piège ton crush ici :`;

  // Fonction de partage intelligente (Growth Loop)
  const handleShare = async () => {
    // 1. Essai API Native (Mobile : Insta, SMS, WhatsApp...)
    if (navigator.share) {
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
            });
            return;
        } catch (err) {
            console.log("Partage annulé ou erreur", err);
        }
    }

    // 2. Fallback Clipboard
    navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Feature D: Génération automatique image (Preuve Sociale)
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setIsGeneratingImage(true);

    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2, // Haute résolution
        backgroundColor: '#2C050D', // Couleur de fond forcée
        logging: false,
        useCORS: true
      });

      const image = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = image;
      link.download = `yesoryes-preuve-${invitation.valentine}.png`;
      link.click();
    } catch (error) {
      console.error("Erreur génération image:", error);
      alert("Impossible de générer l'image sur ce navigateur.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center overflow-hidden relative z-10">
      
      {/* Conteneur Principal avec Animation Flottante - Cible de capture */}
      <div ref={cardRef} className="card-valentine p-12 max-w-2xl w-full relative animate-float border-rose-gold/30 bg-ruby-dark/90 backdrop-blur-xl">
        
        {/* Cœur Battant Central */}
        <div className="mb-10 flex justify-center relative">
            <div className="relative">
                <Heart className="w-32 h-32 text-ruby-DEFAULT fill-current animate-pulse-slow drop-shadow-[0_0_35px_rgba(155,27,48,0.8)]" />
                <Sparkles className="absolute -top-4 -right-4 text-rose-gold animate-spin-slow w-10 h-10 drop-shadow-lg" />
            </div>
        </div>

        {/* Titre Impactant */}
        <h1 className="text-6xl md:text-8xl font-script text-rose-pale mb-6 drop-shadow-lg leading-tight">
          Elle a dit <br/>
          <span className="text-ruby-light text-7xl md:text-9xl">OUI !</span>
        </h1>
        
        <div className="w-32 h-1 bg-gradient-to-r from-transparent via-rose-gold/50 to-transparent mx-auto mb-10"></div>

        <p className="text-2xl font-serif text-cream mb-12 leading-relaxed font-light">
          C'est officiel.<br/>
          <span className="font-medium text-ruby-light border-b border-ruby-light/30 pb-1">{invitation.valentine}</span> 
          <span className="mx-3 text-sm opacity-50">&</span> 
          <span className="font-medium text-ruby-light border-b border-ruby-light/30 pb-1">{invitation.sender}</span>.
        </p>

        {/* Filigrane pour la capture d'écran - REBRANDING */}
        <div className="absolute bottom-2 right-4 text-[10px] text-rose-gold/30 font-mono uppercase tracking-widest opacity-0 data-[html2canvas-ignore='false']:opacity-100">
           YesOrYes • Preuve Certifiée
        </div>
      </div>

      {/* Zone Actions Virales */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4 w-full max-w-md" data-html2canvas-ignore="true">
        {/* Bouton Partage Lien */}
        <div className="relative group cursor-pointer flex-1">
            <button 
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 bg-ruby-dark text-cream py-4 rounded-xl tracking-[0.1em] text-xs uppercase font-medium border border-rose-gold/30 hover:bg-ruby-DEFAULT/90 transition-all shadow-xl"
            >
                {copied ? <Copy size={16} /> : <Share2 size={16} />}
                {copied ? "Lien copié !" : "Partager"}
            </button>
        </div>

        {/* Bouton Téléchargement Image (Nouveau) */}
        <div className="relative group cursor-pointer flex-1">
           <button 
                onClick={handleDownloadImage}
                disabled={isGeneratingImage}
                className="w-full flex items-center justify-center gap-2 bg-rose-gold/10 text-rose-gold py-4 rounded-xl tracking-[0.1em] text-xs uppercase font-medium border border-rose-gold/20 hover:bg-rose-gold hover:text-ruby-dark transition-all"
            >
                {isGeneratingImage ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Sauver la Preuve
            </button>
        </div>
      </div>

      <p className="text-xs text-rose-gold/50 italic mt-6" data-html2canvas-ignore="true">
            Partagez sur TikTok ou Insta pour piéger vos amis !
      </p>

      {/* Footer Discret */}
      <button 
        onClick={() => navigate('/')}
        className="mt-12 group flex items-center gap-2 text-rose-pale/60 hover:text-rose-pale transition-colors font-serif italic text-sm tracking-wider"
        data-html2canvas-ignore="true"
      >
        <span>Créer une autre invitation</span>
        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
};

export default Accepted;