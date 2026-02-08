import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, LockKeyhole, Loader2, Ban, Eye, PartyPopper, Lock, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

const SpyDashboard = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getSpyReport } = useApp();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); 
  
  const consecutiveErrors = useRef(0);
  const prevDataRef = useRef(null);

  // INTELLIGENCE FREEMIUM : Détection du plan de l'utilisateur
  const isLocked = data && data.plan === 'basic';

  const fetchInitialData = async () => {
    try {
      const token = searchParams.get('token');
      if (!token) {
          setAccessDenied(true);
          setLoading(false);
          return null;
      }

      const result = await getSpyReport(id, token);
      
      if (!result) {
          consecutiveErrors.current++;
          if (consecutiveErrors.current > 5 && !data) {
             setAccessDenied(true);
          }
          throw new Error("No data returned");
      }

      consecutiveErrors.current = 0;
      updateDataWithEffect(result);
      setLoading(false);
      return result;
      
    } catch (e) {
      console.warn("Fetch error:", e.message);
      setLoading(false);
      return null;
    }
  };

  const updateDataWithEffect = (newData) => {
      setData(prev => {
          if (prev && JSON.stringify(prev) !== JSON.stringify(newData)) {
              if (newData.status === 'accepted' && prev.status !== 'accepted') {
                  triggerVictory();
              }
              else if (newData.attempts > prev.attempts) {
                  if (navigator.vibrate) navigator.vibrate(50);
              }
              else if (newData.viewed_at && !prev.viewed_at) {
                  if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
              }
          } 
          else if (!prev && newData.status === 'accepted') {
             setTimeout(triggerVictory, 500);
          }

          prevDataRef.current = prev;
          return newData;
      });
  };

  const triggerVictory = () => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
    
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#D24D57', '#B76E79', '#FFFDD0'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#D24D57', '#B76E79', '#FFFDD0'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  };

  useEffect(() => {
    // Détection retour après upgrade
    const upgradeSuccess = searchParams.get('upgrade');
    if (upgradeSuccess === 'success') {
        // Message de félicitations transitoire
        const timer = setTimeout(() => {
            // On retire le paramètre de l'URL pour ne pas re-afficher le message
            const newUrl = window.location.pathname + '?token=' + searchParams.get('token');
            window.history.replaceState({}, '', newUrl);
        }, 5000);
        return () => clearTimeout(timer);
    }

    fetchInitialData();

    const channel = supabase
      .channel(`invitation-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invitations',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log("⚡ Realtime Update:", payload.new);
          const adapted = { ...payload.new, status: payload.new.game_status };
          updateDataWithEffect(adapted);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('polling');
        }
      });

    const interval = setInterval(async () => {
        await fetchInitialData();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-ruby-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-gold animate-spin" />
    </div>
  );

  if (accessDenied) return (
    <div className="min-h-screen bg-ruby-dark flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-ruby-dark/50 border border-rose-gold/30 p-8 rounded-xl backdrop-blur-md max-w-md w-full shadow-2xl">
            <Ban className="w-16 h-16 text-rose-gold mx-auto mb-4" />
            <h2 className="text-2xl text-rose-pale font-serif mb-2">Accès Interdit</h2>
            <p className="text-cream/70 mb-6 font-light">
                Paiement en attente ou lien invalide.<br/>
                Veuillez finaliser votre commande.
            </p>
            <button 
                onClick={() => navigate('/')}
                className="btn-ruby py-3 px-6 rounded-lg text-sm uppercase tracking-widest w-full"
            >
                Retourner à la base
            </button>
        </div>
    </div>
  );

  if (!data) return null;

  const attempts = data.attempts || 0;
  const time = parseFloat(data.hesitation_time) || 0;
  
  const calculateSmartScore = () => {
    let rawScore = 100;
    if (attempts > 0 && attempts <= 3) rawScore -= (attempts * 15); 
    if (attempts > 3 && attempts <= 10) rawScore -= (3 * 15) + ((attempts - 3) * 5); 
    if (attempts > 10) rawScore = 85; 
    if (attempts < 5) rawScore -= (time * 0.5);
    if (attempts > 15) return 100; 

    return Math.min(100, Math.max(0, Math.floor(rawScore)));
  };

  const getPsychologicalProfile = () => {
    if (data.status === 'accepted') {
        if (attempts === 0) return { title: "Le Coup de Foudre", desc: "Elle a dit OUI immédiatement. Aucune hésitation détectée. L'évidence même." };
        if (attempts > 15) return { title: "La Joueuse", desc: "Elle adore le défi et vous faire désirer. Un 'OUI' passionné caché derrière un jeu du chat et de la souris." };
        if (time > 30 && attempts < 5) return { title: "La Stratège", desc: "Intérêt confirmé mais prudent. Elle a pris le temps de peser le pour et le contre avant de s'engager." };
        if (time < 10 && attempts > 5) return { title: "L'Impulsive", desc: "Réaction vive et amusée ! Elle a tenté de fuir par réflexe mais l'envie était trop forte." };
        return { title: "L'Équilibrée", desc: "Un mélange sain de jeu et de sincérité. Une conquête validée avec succès." };
    } 
    
    if (data.viewed_at && data.status === 'pending') {
        const viewedTime = new Date(data.viewed_at);
        const now = new Date();
        const diffMinutes = (now - viewedTime) / 1000 / 60;
        
        if (diffMinutes > 5) return { title: "Le Fantôme ?", desc: "Elle a ouvert la lettre il y a plus de 5 minutes sans répondre. Suspense insoutenable..." };
        return { title: "Lecture en cours...", desc: "Elle est devant l'écran en ce moment même. Chut !" };
    }
    
    return { title: "En attente", desc: "Le message n'a pas encore été ouvert." };
  };

  const normalizedScore = calculateSmartScore();
  const profile = getPsychologicalProfile();
  const hesitationsDisplay = time.toFixed(1);

  // LIEN UPGRADE STRIPE
  const handleUpgrade = () => {
    const token = searchParams.get('token');
    const upgradeUrl = `https://buy.stripe.com/8x28wOcc6gFRfpAdk76Vq02?client_reference_id=${id}&redirect_url=${encodeURIComponent(window.location.origin + `/spy/${id}?token=${token}&upgrade=success`)}`;
    window.location.href = upgradeUrl;
  };

  // Message de félicitations après upgrade
  const showUpgradeSuccess = searchParams.get('upgrade') === 'success';

  return (
    <div className="min-h-screen p-6 font-serif text-cream selection:bg-ruby-light selection:text-cream flex justify-center items-center relative z-10">
      <div className="max-w-3xl w-full border border-rose-gold/30 bg-ruby-dark/60 backdrop-blur-xl rounded-xl overflow-hidden shadow-[0_0_50px_rgba(106,15,32,0.5)] relative animate-fade-in">
        
        <header className="bg-ruby-dark/80 p-6 border-b border-rose-gold/20 flex justify-between items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
            <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-ruby-DEFAULT/30 rounded-full border border-rose-gold/30 shadow-[0_0_15px_rgba(183,110,121,0.2)]">
                    <LockKeyhole className="text-rose-gold w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-rose-pale text-2xl font-script">Carnet Secret</h1>
                    <p className="text-xs text-rose-gold/70 uppercase tracking-widest flex items-center gap-2">
                        {isLocked ? 'Version Essentiel' : 'Confidentiel'} <span className="w-1 h-1 bg-rose-gold/50 rounded-full"></span> ID: {data.id.substring(0, 6)}
                    </p>
                </div>
            </div>
            <div className={`hidden sm:flex px-4 py-1 border text-xs rounded-full items-center gap-2 tracking-wider shadow-sm transition-colors ${
                connectionStatus === 'live' 
                ? 'border-ruby-light/50 text-ruby-light bg-ruby-light/10' 
                : 'border-orange-500/50 text-orange-400 bg-orange-500/10'
            }`}>
                <div className={`w-2 h-2 rounded-full ${connectionStatus === 'live' ? 'bg-ruby-light animate-pulse' : 'bg-orange-400'}`}></div> 
                {connectionStatus === 'live' ? 'LIVE FEED' : 'SYNC...'}
            </div>
        </header>

        <div className="p-8 relative">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-5 mix-blend-overlay pointer-events-none"></div>
            
            {/* Message de félicitations après upgrade */}
            {showUpgradeSuccess && (
                <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg text-center animate-fade-in">
                    <Sparkles className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <p className="text-green-400 font-medium">🎉 Votre carnet secret est désormais débloqué !</p>
                </div>
            )}

            <div className="mb-12 text-center relative z-10">
                {data.status === 'accepted' ? (
                   <div className="animate-float">
                      <span className="text-xs uppercase text-green-400 tracking-[0.3em] block mb-3 font-bold flex items-center justify-center gap-2">
                         <PartyPopper size={16} /> Mission Accomplie <PartyPopper size={16} />
                      </span>
                      <h2 className="text-5xl md:text-7xl font-script text-rose-pale mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        Elle a dit <span className="text-ruby-light relative inline-block">OUI !</span>
                      </h2>
                      <div className="inline-flex items-center gap-2 font-medium tracking-wide px-6 py-3 rounded-full border border-green-500/50 bg-green-900/30 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                          <CheckCircle2 size={20} />
                          INVITATION ACCEPTÉE
                      </div>
                   </div>
                ) : (
                   <>
                      <span className="text-xs uppercase text-rose-gold/60 tracking-[0.3em] block mb-3">Sujet de l'observation</span>
                      <h2 className="text-5xl font-script text-cream mb-4 drop-shadow-md">{data.valentine}</h2>
                      <div className={`inline-flex items-center gap-2 font-medium tracking-wide px-4 py-2 rounded-lg border transition-colors duration-500 ${data.viewed_at ? 'bg-orange-900/20 border-orange-500/30 text-orange-400' : 'bg-ruby-light/10 border-ruby-light/20 text-ruby-light'}`}>
                          <Eye size={18} />
                          {data.viewed_at ? 'STATUT : VU (HÉSITATION...)' : 'STATUT : NON LU'}
                      </div>
                   </>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                
                {/* CARTES STATISTIQUES AVEC FLOU CONDITIONNEL */}
                <div className={`bg-ruby-dark/40 p-6 rounded-lg border border-rose-gold/10 hover:border-rose-gold/40 transition-all hover:bg-ruby-dark/60 group relative ${isLocked ? 'blur-md' : ''}`}>
                    <div className="flex justify-between items-start mb-4">
                        <MousePointer2 className="text-rose-gold/50 w-5 h-5 group-hover:text-rose-gold transition-colors" />
                        <span className="text-xs font-medium text-rose-pale uppercase tracking-wider">Tentatives d'esquive</span>
                    </div>
                    <div className="text-4xl text-cream font-light mb-1">{data.attempts}</div>
                    <div className="text-xs text-cream/50 italic">Clics sur le bouton "Non"</div>
                </div>

                <div className={`bg-ruby-dark/40 p-6 rounded-lg border border-rose-gold/10 hover:border-rose-gold/40 transition-all hover:bg-ruby-dark/60 group relative ${isLocked ? 'blur-md' : ''}`}>
                    <div className="flex justify-between items-start mb-4">
                        <Clock className="text-rose-gold/50 w-5 h-5 group-hover:text-rose-gold transition-colors" />
                        <span className="text-xs font-medium text-rose-pale uppercase tracking-wider">Temps d'hésitation</span>
                    </div>
                    <div className="text-4xl text-cream font-light mb-1">{hesitationsDisplay}s</div>
                    <div className="text-xs text-cream/50 italic">Avant acceptation finale</div>
                </div>

                {/* PROFIL PSYCHOLOGIQUE : Remplacement conditionnel */}
                {isLocked ? (
                    // VERSION VERROUILLÉE : Bandeau Upsell
                    <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-purple-900/40 to-ruby-dark/60 p-8 rounded-lg border-2 border-purple-500/30 mt-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-20">
                            <Lock size={80} className="text-purple-400" />
                        </div>
                        
                        <div className="text-center relative z-10">
                            <h3 className="text-purple-300 text-xl font-script mb-3 flex items-center justify-center gap-2">
                                <Sparkles size={20} /> Analyse Psychologique Complète
                            </h3>
                            <p className="text-cream/70 text-sm mb-6 italic">
                                Découvrez son profil émotionnel détaillé, ses véritables intentions et le score de passion exact.
                            </p>
                            
                            <button
                                onClick={handleUpgrade}
                                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-rose-gold text-cream font-bold text-lg rounded-full shadow-[0_0_30px_rgba(147,51,234,0.4)] hover:shadow-[0_0_50px_rgba(147,51,234,0.6)] transition-all border border-purple-400/50"
                            >
                                <Lock size={18} />
                                Débloquer pour 1€
                            </button>
                            
                            <p className="text-purple-300/50 text-xs mt-4">Paiement sécurisé • Accès immédiat</p>
                        </div>
                    </div>
                ) : (
                    // VERSION COMPLÈTE : Analyse débloquée
                    <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-ruby-dark/60 to-[#2C050D] p-8 rounded-lg border border-rose-gold/20 mt-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Shield size={100} className="text-rose-gold" />
                        </div>
                        
                        <h3 className="text-rose-gold text-sm font-medium uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
                            <HeartHandshake size={16} /> Synthèse Romantique
                        </h3>
                        
                        <div className="space-y-6 relative z-10">
                            <div>
                                <div className="flex justify-between text-xs mb-2 text-cream/70 tracking-wider">
                                    <span>Indice de Passion (IA Scoring)</span>
                                    <span>{normalizedScore}/100</span>
                                </div>
                                <div className="w-full bg-ruby-dark/80 h-2 rounded-full overflow-hidden border border-rose-gold/10">
                                    <div className="h-full bg-gradient-to-r from-rose-gold to-ruby-light shadow-[0_0_10px_rgba(210,77,87,0.5)] transition-all duration-1000" style={{width: `${normalizedScore}%`}}></div>
                                </div>
                            </div>
                            
                            <div className="border-l-2 border-ruby-light pl-4 py-2 bg-ruby-light/5 rounded-r-lg">
                                <h4 className="text-rose-pale font-serif text-lg mb-1">{profile.title}</h4>
                                <p className="text-sm text-cream/80 font-light italic leading-relaxed">
                                    {profile.desc}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
        
         <footer className="p-4 border-t border-rose-gold/10 text-center relative z-10 bg-ruby-dark/80">
            <button 
                onClick={() => navigate('/')}
                className="text-rose-gold/60 hover:text-rose-gold text-xs uppercase tracking-[0.2em] transition-colors"
            >
                Refermer le carnet
            </button>
        </footer>
      </div>
    </div>
  );
};

export default SpyDashboard;