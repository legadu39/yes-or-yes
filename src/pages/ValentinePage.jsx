import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Music, VolumeX, Heart, MailOpen } from 'lucide-react';
import confetti from 'canvas-confetti';

const ValentinePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getPublicInvitation, incrementAttempts, acceptInvitation, markAsViewed } = useApp();
  
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noBtnStyle, setNoBtnStyle] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [yesScale, setYesScale] = useState(1);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // INTELLIGENCE : ÉTATS DE JEU & PHYSIQUE
  const [escapeCount, setEscapeCount] = useState(0);
  const [fatigueLevel, setFatigueLevel] = useState(0); // 0 à 100% de fatigue

  const audioRef = useRef(null); 
  const startTimeRef = useRef(Date.now()); 
  const btnRef = useRef(null); 
  const lastMousePos = useRef({ x: 0, y: 0 });

  // DÉTECTION ROBOTS (Pour ne pas fausser les stats)
  const isLikelyBot = () => {
    const agent = navigator.userAgent.toLowerCase();
    return agent.includes('bot') || agent.includes('crawl') || agent.includes('facebook') || agent.includes('whatsapp') || agent.includes('google');
  };

  useEffect(() => {
    // AUDIO : Circuit Breaker (Backup en cas d'erreur de chargement)
    if (!audioRef.current) {
        const playlist = [
            '/assets/music.ogg',
            'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg'
        ];

        audioRef.current = new Audio();
        audioRef.current.loop = true;
        audioRef.current.volume = 0.4;
        
        const loadAudio = (index) => {
            if (index >= playlist.length) return;
            audioRef.current.src = playlist[index];
            audioRef.current.onerror = () => {
                console.warn(`⚠️ Audio source ${index} failed, switching to backup...`);
                loadAudio(index + 1);
            };
        };
        loadAudio(0);
    }

    const fetchInvite = async () => {
      setLoading(true);
      const data = await getPublicInvitation(id);
      
      if (!data) { 
        navigate('/'); 
      } else {
        // GESTION INTELLIGENTE DE L'ÉTAT DE PAIEMENT
        if (data.payment_status !== 'paid') {
            setInvitation({ ...data, isPending: true });
        } else {
            setInvitation(data);
            startTimeRef.current = Date.now();
            if (!isLikelyBot()) markAsViewed(id);
        }
      }
      setLoading(false);
    };

    fetchInvite();
    
    return () => { 
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [id, getPublicInvitation, markAsViewed, navigate]);

  const handleStartExperience = () => {
    if (audioRef.current) {
        audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(e => console.error("Auto-play prevented:", e));
    }
    setHasInteracted(true);
  };

  const getElapsedTime = () => {
    return ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
  };

  const toggleMusic = () => {
    if (isPlaying) { 
      audioRef.current.pause(); 
      setIsPlaying(false); 
    } else { 
      audioRef.current.play(); 
      setIsPlaying(true); 
    }
  };

  // --- MOTEUR PHYSIQUE ADAPTATIF (INTELLIGENCE UX) ---
  const moveButton = (e) => {
    if (!invitation) return;
    if (isLikelyBot()) return;

    // 1. Détection du type d'input (Touch vs Mouse)
    const isTouch = e.type.includes('touch');
    if (isTouch) {
        // Sur mobile, on empêche le scroll/zoom accidentel
        // e.preventDefault(); // Commenté pour ne pas bloquer totalement l'UX si nécessaire
    }

    // 2. Calcul Vecteur Vélocité (Pour fuir intelligemment)
    let clientX, clientY;
    if (isTouch) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    lastMousePos.current = { x: clientX, y: clientY };

    // 3. Incrémenter la "Fatigue" du bouton
    // Sur mobile, il se fatigue 2x plus vite pour éviter la rage
    const fatigueIncrement = isTouch ? 10 : 4;
    const newFatigue = Math.min(fatigueLevel + fatigueIncrement, 100);
    setFatigueLevel(newFatigue);
    
    // Stats
    setEscapeCount(prev => prev + 1);
    setYesScale(prev => Math.min(prev + 0.05, 2.0)); 
    const currentTime = getElapsedTime();
    incrementAttempts(invitation.id, invitation.attempts + escapeCount + 1, currentTime);

    // 4. Calcul de la physique (Amortissement basé sur la fatigue)
    // À 0% fatigue : Vivacité 1.0
    // À 100% fatigue : Vivacité 0.1 (presque immobile)
    const vivacity = Math.max(0.1, 1 - (newFatigue / 80)); 
    
    // Distance de saut : Base * Vivacité
    // Mobile : distance de base réduite (100px vs 200px desktop)
    const baseJump = isTouch ? 90 : 200;
    const jumpDistance = baseJump * vivacity; 

    // Vitesse de transition (Plus il est fatigué, plus il est lent)
    const transitionTime = Math.max(0.2, 0.8 - (vivacity * 0.6)); // 0.2s (vif) à 0.8s (lent)

    // Feedback Haptique (Vibration décroissante)
    if (navigator.vibrate && vivacity > 0.5) navigator.vibrate(20);

    // 5. Calcul Nouvelle Position (Fuite vectorielle simplifiée + Random)
    const btnRect = btnRef.current 
        ? btnRef.current.getBoundingClientRect() 
        : { left: window.innerWidth/2, top: window.innerHeight/2, width: 100, height: 40 };

    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    // Vecteur directionnel (du curseur vers le bouton)
    let dirX = btnCenterX - clientX;
    let dirY = btnCenterY - clientY;
    
    // Normalisation
    const length = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= length;
    dirY /= length;

    // Ajout chaos (Jitter) pour ne pas être trop prédictible
    const angleJitter = (Math.random() - 0.5) * 2.0; 
    const finalDirX = dirX * Math.cos(angleJitter) - dirY * Math.sin(angleJitter);
    const finalDirY = dirX * Math.sin(angleJitter) + dirY * Math.cos(angleJitter);

    let nextX = btnRect.left + (finalDirX * jumpDistance);
    let nextY = btnRect.top + (finalDirY * jumpDistance);

    // Garde-fous (Rester dans l'écran)
    const padding = 20;
    const maxX = window.innerWidth - (btnRect.width || 100) - padding;
    const maxY = window.innerHeight - (btnRect.height || 50) - padding;

    nextX = Math.max(padding, Math.min(nextX, maxX));
    nextY = Math.max(padding, Math.min(nextY, maxY));

    setNoBtnStyle({
      position: 'fixed',
      left: `${nextX}px`,
      top: `${nextY}px`,
      transition: `all ${transitionTime}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`, 
      zIndex: 50,
      opacity: Math.max(0.4, 1 - (escapeCount * 0.02)) // Reste visible
    });
  };

  const handleYes = async () => {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    // INTELLIGENCE : SYNC OFFLINE-FIRST (CRITIQUE)
    // 1. On sauvegarde l'intention immédiatement en local
    // Si le réseau coupe maintenant, AppContext le renverra plus tard.
    localStorage.setItem('pending_acceptance', JSON.stringify({ 
        id: invitation.id, 
        time: Date.now() 
    }));

    // 2. Effets visuels (Confetti)
    const duration = 2500;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#D24D57', '#B76E79', '#FFFDD0'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#D24D57', '#B76E79', '#FFFDD0'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();

    // 3. Tentative réseau (Optimiste)
    // On ne bloque pas l'UI sur le await, on navigue dès que possible
    const finalTime = getElapsedTime();
    acceptInvitation(invitation.id, finalTime); 
    
    // 4. Navigation différée pour profiter du moment
    setTimeout(() => {
        navigate('/accepted');
    }, 1200);
  };

  if (loading || !invitation) return (
    <div className="h-screen w-screen bg-ruby-dark flex items-center justify-center">
      <Heart className="w-10 h-10 text-rose-gold animate-pulse" />
    </div>
  );

  // ÉCRAN DE DÉMARRAGE (REQUIRED POUR AUDIO SUR MOBILE)
  if (!hasInteracted) {
    return (
        <div 
            onClick={handleStartExperience}
            className="h-screen w-screen bg-ruby-dark flex flex-col items-center justify-center cursor-pointer relative overflow-hidden z-50 animate-fade-in"
        >
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ruby-light/20 via-ruby-dark to-[#1a0508] pointer-events-none"></div>
             
             <div className="relative group p-10 text-center">
                <MailOpen className="w-24 h-24 text-rose-gold animate-bounce mb-6 mx-auto drop-shadow-lg" />
                <h2 className="text-3xl font-script text-rose-pale text-center mb-2">Une lettre pour vous</h2>
                <p className="text-cream/60 text-xs uppercase tracking-widest text-center animate-pulse">
                    Toucher pour ouvrir
                </p>
                {invitation.sender && (
                    <p className="mt-4 text-rose-gold/50 font-serif italic text-sm">De la part de {invitation.sender}</p>
                )}
             </div>
        </div>
    );
  }

  // ÉCRAN D'ATTENTE PAIEMENT (CAS RARE MAIS GÉRÉ)
  if (invitation?.isPending) {
    return (
      <div className="h-screen w-screen bg-ruby-dark flex flex-col items-center justify-center relative overflow-hidden z-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ruby-light/20 via-ruby-dark to-[#1a0508] pointer-events-none"></div>
        <div className="relative z-10 text-center p-8">
          <Heart className="w-16 h-16 text-rose-gold animate-pulse mx-auto mb-4" />
          <h2 className="text-3xl font-script text-rose-pale mb-4">Un instant...</h2>
          <p className="text-cream/60 text-sm mb-6">
            L'invitation est en cours de scellage.<br/>
            Veuillez patienter quelques secondes.
          </p>
          <div className="flex justify-center gap-2">
            <div className="w-2 h-2 bg-rose-gold rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
            <div className="w-2 h-2 bg-rose-gold rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            <div className="w-2 h-2 bg-rose-gold rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
          </div>
        </div>
      </div>
    );
  }

  // INTERFACE PRINCIPALE
  return (
    <div className="h-screen w-screen bg-ruby-dark overflow-hidden relative flex flex-col items-center justify-center select-none animate-fade-in-slow">
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ruby-light/30 via-ruby-dark to-[#1a0508] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-ruby-DEFAULT/20 rounded-full blur-[100px] pointer-events-none animate-pulse-slow"></div>

      <button 
        onClick={(e) => { e.stopPropagation(); toggleMusic(); }}
        className="absolute top-8 right-8 z-50 p-3 rounded-full bg-ruby-dark/50 border border-rose-gold/30 text-rose-pale hover:bg-ruby-light/30 transition backdrop-blur-md"
      >
        {isPlaying ? <Music size={18} className="animate-pulse-slow" /> : <VolumeX size={18} />}
      </button>

      <div className="z-20 text-center px-4 relative max-w-3xl w-full">
        
        <p className="text-rose-pale/80 font-serif italic text-2xl mb-10 tracking-wide animate-float">
          Une question de cœur pour {invitation.valentine}...
        </p>

        <h1 className="text-6xl md:text-8xl font-script text-rose-pale mb-16 drop-shadow-lg leading-snug">
          Veux-tu être ma <br/>
          <span className="text-ruby-light relative inline-block mt-2 drop-shadow-[0_0_15px_rgba(210,77,87,0.5)]">
            Valentine ?
          </span>
        </h1>

        <div className="flex flex-col md:flex-row justify-center items-center gap-12 min-h-[200px] relative">
          
          <button 
              onClick={(e) => { e.stopPropagation(); handleYes(); }}
              style={{ transform: `scale(${yesScale})` }}
              className="group relative px-12 py-6 bg-gradient-to-br from-ruby-DEFAULT to-ruby-dark text-rose-pale font-serif font-medium text-2xl tracking-widest border border-rose-gold/50 shadow-[0_0_50px_rgba(155,27,48,0.5)] transition-all duration-500 rounded-full overflow-hidden z-40 hover:shadow-[0_0_70px_rgba(210,77,87,0.7)] hover:border-rose-gold"
          >
              <span className="relative z-10 flex items-center gap-3">
                OUI, JE LE VEUX
                <Heart fill="currentColor" size={24} className="animate-pulse-slow text-ruby-light" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
          </button>

          <button
              ref={btnRef}
              style={noBtnStyle}
              onMouseEnter={moveButton}
              onTouchStart={moveButton}
              onClick={(e) => e.stopPropagation()} 
              className="px-6 py-3 text-rose-pale/40 font-serif border border-rose-pale/10 hover:border-ruby-light/30 hover:text-ruby-light/60 transition-all text-sm tracking-[0.2em] uppercase cursor-none backdrop-blur-sm rounded-full"
          >
              {escapeCount === 0 ? "Non, merci" : fatigueLevel > 80 ? "Bon, d'accord..." : "Impossible..."}
          </button>

        </div>
      </div>
    </div>
  );
};

export default ValentinePage;