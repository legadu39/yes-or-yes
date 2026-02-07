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
  const [escapeCount, setEscapeCount] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // INTELLIGENCE N°4 : ANTI-FRUSTRATION
  const [missClickCount, setMissClickCount] = useState(0);

  const audioRef = useRef(null); 
  const startTimeRef = useRef(Date.now()); 
  const btnRef = useRef(null); 
  const lastMousePos = useRef({ x: 0, y: 0 });

  // INTELLIGENCE : DÉTECTION DE ROBOTS
  const isLikelyBot = () => {
    const agent = navigator.userAgent.toLowerCase();
    if (agent.includes('bot') || agent.includes('crawl') || agent.includes('facebook') || agent.includes('whatsapp') || agent.includes('google')) {
        return true;
    }
    return false;
  };

  useEffect(() => {
    // INTELLIGENCE : CIRCUIT BREAKER AUDIO
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
                console.warn(`Source audio ${index} inaccessible, bascule sur backup...`);
                loadAudio(index + 1);
            };
        };

        loadAudio(0);
    }

    const fetchInvite = async () => {
      setLoading(true);
      const data = await getPublicInvitation(id);
      
      if (!data) { 
        // Si pas de données (ex: non payé ou ID invalide), on redirige
        navigate('/'); 
      } else {
        // ✅ NOUVELLE VÉRIFICATION
        if (data.payment_status !== 'paid') {
          // Afficher un écran d'attente au lieu de bloquer
          setInvitation({ ...data, isPending: true });
      } else {
        setInvitation(data);
      }
        
        
        startTimeRef.current = Date.now();
        
        // INTELLIGENCE : Marquer comme "Vu" pour le Dashboard Espion
        // Uniquement si ce n'est pas un robot
        if (!isLikelyBot()) {
            markAsViewed(id);
        } else {
            console.log("🤖 Visite de robot détectée - Statistiques ignorées.");
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
            .catch(e => console.error("Erreur lecture audio (User interaction required):", e));
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

  const handleBackgroundClick = (e) => {
     if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
     setMissClickCount(prev => prev + 1);
  };

  // --- INTELLIGENCE : BOUTON FUYANT DYNAMIQUE ---
  const moveButton = (e) => {
    if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
    }

    if (!invitation) return;
    
    // Si c'est un bot qui essaie de cliquer (peu probable mais bon), on ignore
    if (isLikelyBot()) return;

    let clientX, clientY;
    if (e.type === 'touchstart' || e.type === 'touchmove') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const deltaX = clientX - lastMousePos.current.x;
    const deltaY = clientY - lastMousePos.current.y;
    const speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    lastMousePos.current = { x: clientX, y: clientY };

    const panicFactor = Math.min(speed / 20, 2.0); 
    const mercyFactor = Math.min(0.8, missClickCount * 0.1); 
    const fatigue = Math.max(0.2, (1 - Math.max(0, escapeCount - 15) * 0.05) - mercyFactor);

    setEscapeCount(prev => prev + 1);
    setYesScale(prev => Math.min(prev + 0.08, 2.2)); 

    const currentTime = getElapsedTime();
    incrementAttempts(invitation.id, invitation.attempts + escapeCount, currentTime);

    const baseJump = 150 + (escapeCount * 5);
    const jumpDistance = (baseJump * (1 + panicFactor)) * fatigue;
    const baseTime = 0.4;
    const transitionTime = Math.max(0.15, (baseTime / (1 + panicFactor)) / fatigue);

    if (navigator.vibrate) navigator.vibrate(panicFactor > 1 ? 80 : 30);

    const btnRect = btnRef.current 
        ? btnRef.current.getBoundingClientRect() 
        : { left: window.innerWidth/2, top: window.innerHeight/2, width: 100, height: 40 };

    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    let dirX = btnCenterX - clientX;
    let dirY = btnCenterY - clientY;

    const length = Math.sqrt(dirX * dirX + dirY * dirY);
    if (length === 0) {
        dirX = Math.random() - 0.5;
        dirY = Math.random() - 0.5;
    } else {
        dirX = dirX / length;
        dirY = dirY / length;
    }

    const angleJitter = (Math.random() - 0.5) * 1.5; 
    const finalDirX = dirX * Math.cos(angleJitter) - dirY * Math.sin(angleJitter);
    const finalDirY = dirX * Math.sin(angleJitter) + dirY * Math.cos(angleJitter);

    let nextX = btnRect.left + (finalDirX * jumpDistance);
    let nextY = btnRect.top + (finalDirY * jumpDistance);

    const safePadding = 20;
    const btnWidth = btnRect.width || 100;
    const btnHeight = btnRect.height || 50;
    const minX = safePadding;
    const maxX = window.innerWidth - btnWidth - safePadding;
    const minY = safePadding;
    const maxY = window.innerHeight - btnHeight - safePadding;

    nextX = Math.max(minX, Math.min(nextX, maxX));
    nextY = Math.max(minY, Math.min(nextY, maxY));

    setNoBtnStyle({
      position: 'fixed',
      left: `${nextX}px`,
      top: `${nextY}px`,
      transition: `all ${transitionTime}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`, 
      zIndex: 50,
      opacity: Math.max(0.2, 1 - escapeCount * 0.1)
    });
  };

  const handleYes = async () => {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#D24D57', '#B76E79', '#FFFDD0']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#D24D57', '#B76E79', '#FFFDD0']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    const finalTime = getElapsedTime();
    acceptInvitation(invitation.id, finalTime);
    
    setTimeout(() => {
        navigate('/accepted');
    }, 1200);
  };

  if (loading || !invitation) return (
    <div className="h-screen w-screen bg-ruby-dark flex items-center justify-center">
      <Heart className="w-10 h-10 text-rose-gold animate-pulse" />
    </div>
  );

  if (!hasInteracted) {
    return (
        <div 
            onClick={handleStartExperience}
            className="h-screen w-screen bg-ruby-dark flex flex-col items-center justify-center cursor-pointer relative overflow-hidden z-50 animate-fade-in"
        >
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ruby-light/20 via-ruby-dark to-[#1a0508] pointer-events-none"></div>
             
             <div className="relative group p-10">
                <MailOpen className="w-24 h-24 text-rose-gold animate-bounce mb-6 mx-auto drop-shadow-lg" />
                <h2 className="text-3xl font-script text-rose-pale text-center mb-2">Une lettre pour vous</h2>
                <p className="text-cream/60 text-xs uppercase tracking-widest text-center animate-pulse">
                    Toucher pour ouvrir
                </p>
                <div className="absolute inset-0 border border-rose-gold/20 rounded-full scale-150 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-700"></div>
             </div>
        </div>
    );
  }

// ✅ ÉCRAN D'ATTENTE PAIEMENT
if (invitation?.isPending) {
  return (
    <div className="h-screen w-screen bg-ruby-dark flex flex-col items-center justify-center relative overflow-hidden z-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ruby-light/20 via-ruby-dark to-[#1a0508] pointer-events-none"></div>
      
      <div className="relative z-10 text-center p-8">
        <div className="mb-6">
          <Heart className="w-16 h-16 text-rose-gold animate-pulse mx-auto mb-4" />
        </div>
        <h2 className="text-3xl font-script text-rose-pale mb-4">Validation en cours...</h2>
        <p className="text-cream/60 text-sm mb-6">
          {invitation.sender} finalise sa commande.<br/>
          Vous recevrez l'invitation d'ici quelques instants.
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
  return (
    <div 
        onClick={handleBackgroundClick} 
        className="h-screen w-screen bg-ruby-dark overflow-hidden relative flex flex-col items-center justify-center select-none animate-fade-in-slow"
    >
      
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
              {escapeCount === 0 ? "Non, merci" : "Impossible..."}
          </button>

        </div>
      </div>
    </div>
  );
};

export default ValentinePage;