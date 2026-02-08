import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Music, VolumeX, Heart, MailOpen, RefreshCw } from 'lucide-react';
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

  const [escapeCount, setEscapeCount] = useState(0);
  const [fatigueLevel, setFatigueLevel] = useState(0);

  const audioRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const btnRef = useRef(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // NOUVEAUTÉ : Cache pour optimisation polling (Opportunité #8)
  const cacheTimestamp = useRef(null);
  const cachedData = useRef(null);

  const isLikelyBot = () => {
    const agent = navigator.userAgent.toLowerCase();
    return agent.includes('bot') || agent.includes('crawl') || agent.includes('facebook') || agent.includes('whatsapp') || agent.includes('google');
  };

  useEffect(() => {
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

    let pollingInterval;

    const fetchInvite = async () => {
      setLoading(true);

      // NOUVEAUTÉ : Cache intelligent avec TTL de 2s (Opportunité #8)
      const now = Date.now();
      if (cachedData.current && cacheTimestamp.current && (now - cacheTimestamp.current < 2000)) {
        console.log("🔥 Utilisation du cache");
        setInvitation(cachedData.current);
        setLoading(false);
        return;
      }

      const data = await getPublicInvitation(id);

      if (!data) {
        navigate('/');
      } else {
        // Mise à jour du cache
        cachedData.current = data;
        cacheTimestamp.current = now;

        if (data.payment_status !== 'paid') {
          setInvitation({ ...data, isPending: true });

          // NOUVEAUTÉ : Préchargement prédictif pendant l'attente (Opportunité #8)
          console.log("🚀 Préchargement des assets de jeu...");
          
          if (audioRef.current) {
            audioRef.current.load();
          }

          const bgImage = new Image();
          bgImage.src = '/assets/heart-bg.jpg';

          pollingInterval = setInterval(async () => {
            const check = await getPublicInvitation(id);
            if (check && check.payment_status === 'paid') {
              cachedData.current = check;
              cacheTimestamp.current = Date.now();
              setInvitation(check);
              clearInterval(pollingInterval);
              if (!isLikelyBot()) markAsViewed(id);
            }
          }, 3000);

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
      if (pollingInterval) clearInterval(pollingInterval);
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

  const moveButton = (e) => {
    if (!invitation) return;
    if (isLikelyBot()) return;

    const isTouch = e.type.includes('touch');

    let clientX, clientY;
    if (isTouch) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    lastMousePos.current = { x: clientX, y: clientY };

    const fatigueIncrement = isTouch ? 10 : 4;
    const newFatigue = Math.min(fatigueLevel + fatigueIncrement, 100);
    setFatigueLevel(newFatigue);

    setEscapeCount(prev => prev + 1);
    setYesScale(prev => Math.min(prev + 0.05, 2.0));

    const currentTime = getElapsedTime();
    incrementAttempts(invitation.id, invitation.attempts + escapeCount + 1, currentTime);

    const vivacity = Math.max(0.1, 1 - (newFatigue / 80));
    const baseJump = isTouch ? 90 : 200;
    const jumpDistance = baseJump * vivacity;
    const transitionTime = Math.max(0.2, 0.8 - (vivacity * 0.6));

    if (navigator.vibrate && vivacity > 0.5) navigator.vibrate(20);

    const btnRect = btnRef.current ? btnRef.current.getBoundingClientRect() : { left: window.innerWidth/2, top: window.innerHeight/2, width: 100, height: 40 };
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    let dirX = btnCenterX - clientX;
    let dirY = btnCenterY - clientY;

    const length = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= length;
    dirY /= length;

    const angleJitter = (Math.random() - 0.5) * 2.0;
    const finalDirX = dirX * Math.cos(angleJitter) - dirY * Math.sin(angleJitter);
    const finalDirY = dirX * Math.sin(angleJitter) + dirY * Math.cos(angleJitter);

    let nextX = btnRect.left + (finalDirX * jumpDistance);
    let nextY = btnRect.top + (finalDirY * jumpDistance);

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
      opacity: Math.max(0.4, 1 - (escapeCount * 0.02))
    });
  };

  // NOUVEAUTÉ : Retry Policy Intelligente (Opportunité #3)
  const handleYes = async () => {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    // Sauvegarde locale immédiate
    localStorage.setItem('pending_acceptance', JSON.stringify({
      id: invitation.id,
      time: Date.now()
    }));

    localStorage.setItem('last_accepted_invitation', JSON.stringify(invitation));

    // --- RETRY POLICY INTELLIGENTE (NOUVEAUTÉ) ---
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [0, 1000, 3000]; // 0ms, 1s, 3s

    let attempt = 0;
    let success = false;

    const attemptSync = async () => {
      try {
        console.log(`🔄 Tentative ${attempt + 1}/${MAX_RETRIES}`);
        const finalTime = getElapsedTime();
        const result = await acceptInvitation(invitation.id, finalTime);

        if (result === true) {
          success = true;
          console.log("✅ Synchronisation réussie !");
          localStorage.removeItem('pending_acceptance');
          return true;
        }
        return false;
      } catch (err) {
        console.warn(`⚠️ Échec tentative ${attempt + 1}`, err);
        return false;
      }
    };

    // Boucle de retry avec backoff
    while (attempt < MAX_RETRIES && !success) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }

      const syncResult = await attemptSync();
      if (syncResult) break;

      attempt++;
    }

    // Feedback selon résultat
    if (!success) {
      console.log("📡 Réponse en attente de synchronisation");
    }

    // Effets visuels
    const duration = 2500;
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
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();

    setTimeout(() => {
      navigate('/accepted', { state: { invitation, syncStatus: success } });
    }, 1200);
  };

  if (loading || !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center">
        <div className="animate-pulse">
          <Heart className="w-16 h-16 text-[#E0B0B6] mx-auto mb-4" />
          <p className="text-center">Chargement...</p>
        </div>
      </div>
    );
  }

  if (invitation.isPending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
            <MailOpen className="w-16 h-16 text-[#E0B0B6] mx-auto mb-4 animate-bounce" />
            <h2 className="text-2xl font-serif mb-3">Toucher pour ouvrir</h2>
            {invitation.sender && (
              <p className="text-gray-300 mb-6">De la part de {invitation.sender}</p>
            )}
            <div className="border-t border-white/10 pt-6 mt-6">
              <RefreshCw className="w-8 h-8 text-[#E0B0B6] mx-auto mb-3 animate-spin" />
              <p className="text-sm text-gray-400">L'invitation est en cours de scellage.</p>
              <p className="text-xs text-gray-500 mt-2">Veuillez patienter...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasInteracted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white flex items-center justify-center px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
            <MailOpen className="w-20 h-20 text-[#E0B0B6] mx-auto mb-6 animate-pulse" />
            <h2 className="text-3xl font-serif mb-3">Pour toi, {invitation.valentine}</h2>
            {invitation.sender && (
              <p className="text-xl text-gray-300 mb-8">De la part de {invitation.sender}</p>
            )}
            <button
              onClick={handleStartExperience}
              className="w-full bg-[#D24D57] hover:bg-[#B93E49] px-8 py-4 rounded-xl font-semibold text-lg transition shadow-lg flex items-center justify-center gap-3">
              <Heart className="w-6 h-6" />
              Ouvrir l'invitation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#7D1435] to-[#5C0F28] text-white relative overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-5 pointer-events-none"></div>

      <button
        onClick={toggleMusic}
        className="fixed top-4 right-4 z-50 bg-white/10 backdrop-blur-sm hover:bg-white/20 p-3 rounded-full transition">
        {isPlaying ? <Music className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
      </button>

      <div className="max-w-2xl mx-auto text-center relative z-10">
        <h1 className="text-4xl md:text-5xl font-serif mb-8 animate-fadeIn">
          Une question de cœur pour {invitation.valentine}...
        </h1>

        <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-2xl p-8 md:p-12 shadow-2xl mb-8">
          <p className="text-2xl md:text-3xl mb-12">
            Veux-tu être ma Valentine ? 💝
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={handleYes}
              style={{ transform: `scale(${yesScale})` }}
              className="bg-[#D24D57] hover:bg-[#B93E49] px-12 py-4 rounded-xl font-semibold text-xl transition-all shadow-lg hover:shadow-2xl">
              Oui ! 💕
            </button>

            <button
              ref={btnRef}
              onMouseEnter={moveButton}
              onTouchStart={moveButton}
              style={noBtnStyle}
              className="bg-gray-600 hover:bg-gray-700 px-12 py-4 rounded-xl font-semibold text-xl transition-all shadow-lg cursor-pointer">
              Non
            </button>
          </div>

          {escapeCount > 0 && (
            <div className="mt-8 text-sm text-gray-400 animate-fadeIn">
              <p>Tentatives de fuite : {escapeCount}</p>
              {fatigueLevel > 50 && (
                <p className="text-yellow-400 mt-2">
                  Le bouton commence à fatiguer... 😅
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-400">
          Astuce : Le bouton "Non" a une vie propre 😉
        </p>
      </div>
    </div>
  );
};

export default ValentinePage;
