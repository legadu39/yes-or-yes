import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Shield, Clock, MousePointer2, CheckCircle2, HeartHandshake, LockKeyhole, Loader2, Ban } from 'lucide-react';

const SpyDashboard = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getSpyReport } = useApp();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  
  const timerRef = useRef(null);
  const consecutiveErrors = useRef(0);
  const [pollDelay, setPollDelay] = useState(3000); 

  // Pour la détection de changements
  const prevDataRef = useRef(null);

  const fetchData = async () => {
    try {
      const token = searchParams.get('token');
      if (!token) {
          setAccessDenied(true);
          setLoading(false);
          return;
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

      setData(prev => {
          prevDataRef.current = prev; // On garde une copie de l'état précédent pour l'intelligence
          if (JSON.stringify(prev) !== JSON.stringify(result)) {
              if (result.status === 'accepted' && prev?.status !== 'accepted') {
                  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
              }
              return result;
          }
          return prev;
      });
      
    } catch (e) {
      if (consecutiveErrors.current < 3) console.warn("Polling retry...", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const calculateSmartDelay = () => {
        // INTELLIGENCE N°3 : POLLING ADAPTATIF "CARDIAQUE"
        // Si erreur, backoff classique
        if (consecutiveErrors.current > 0) {
            return Math.min(30000, 3000 * Math.pow(2, consecutiveErrors.current));
        }
        
        // Si l'utilisateur a quitté l'onglet, on ralentit drastiquement
        if (document.hidden) return 30000;
        
        // Si c'est déjà gagné, on peut ralentir un peu
        if (data && data.status === 'accepted') return 15000;

        // CŒUR DU SYSTÈME : Détection d'activité
        // Si le nombre de tentatives a bougé depuis le dernier fetch, c'est qu'elle est en train de jouer !
        // On passe en mode "Temps Réel" (1s)
        if (data && prevDataRef.current && data.attempts > prevDataRef.current.attempts) {
            return 1000; 
        }

        const createdAt = data ? new Date(data.created_at) : new Date();
        const timeDiff = (new Date() - createdAt) / 1000 / 60; 
        
        // Sinon rythme standard
        return timeDiff < 15 ? 3000 : 10000;
    };

    const scheduleNext = () => {
        const nextDelay = calculateSmartDelay();
        setPollDelay(nextDelay); 
        
        timerRef.current = setTimeout(async () => {
            await fetchData();
            scheduleNext();
        }, nextDelay);
    };

    fetchData().then(() => scheduleNext());

    const handleVisibilityChange = () => {
         if (!document.hidden) {
             if (timerRef.current) clearTimeout(timerRef.current);
             fetchData().then(() => scheduleNext());
         }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [id, data]); // Dépendance sur data pour recalculer le délai intelligemment

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
                La clé de sécurité est invalide ou le paiement est en attente.<br/>
                Utilisez le lien fourni lors de votre commande.
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

  // --- SCORING & PROFILAGE INTELLIGENT ---
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

  // INTELLIGENCE : Matrice de Comportement Narrative
  const getPsychologicalProfile = () => {
    
    if (attempts === 0) return { title: "Le Coup de Foudre", desc: "Elle a dit OUI immédiatement. Aucune hésitation détectée. L'évidence même." };
    if (attempts > 15) return { title: "La Joueuse", desc: "Elle adore le défi et vous faire désirer. Un 'OUI' passionné caché derrière un jeu du chat et de la souris." };
    
    // Analyse fine croisée
    if (time > 30 && attempts < 5) return { title: "La Stratège", desc: "Intérêt confirmé mais prudent. Elle a pris le temps de peser le pour et le contre avant de s'engager." };
    if (time < 10 && attempts > 5) return { title: "L'Impulsive", desc: "Réaction vive et amusée ! Elle a tenté de fuir par réflexe mais l'envie était trop forte." };
    
    return { title: "L'Équilibrée", desc: "Un mélange sain de jeu et de sincérité. Une conquête validée avec succès." };
  };

  const normalizedScore = calculateSmartScore();
  const profile = getPsychologicalProfile();
  const hesitationsDisplay = time.toFixed(1);

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
                        Confidentiel <span className="w-1 h-1 bg-rose-gold/50 rounded-full"></span> ID: {data.id.substring(0, 6)}
                    </p>
                </div>
            </div>
            {/* Indicateur de Polling */}
            <div className="hidden sm:flex px-4 py-1 border border-ruby-light/50 text-ruby-light text-xs rounded-full bg-ruby-light/10 items-center gap-2 tracking-wider shadow-sm">
                <div className={`w-2 h-2 bg-ruby-light rounded-full ${pollDelay < 5000 ? 'animate-pulse' : ''}`}></div> 
                {pollDelay < 5000 ? 'LIVE' : 'SYNC'}
            </div>
        </header>

        <div className="p-8 relative">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-5 mix-blend-overlay pointer-events-none"></div>
            
            <div className="mb-12 text-center relative z-10">
                <span className="text-xs uppercase text-rose-gold/60 tracking-[0.3em] block mb-3">Sujet de l'observation</span>
                <h2 className="text-5xl font-script text-cream mb-4 drop-shadow-md">{data.valentine}</h2>
                <div className={`inline-flex items-center gap-2 font-medium tracking-wide px-4 py-2 rounded-lg border transition-colors duration-500 ${data.status === 'accepted' ? 'bg-green-900/30 border-green-500/50 text-green-400' : 'bg-ruby-light/10 border-ruby-light/20 text-ruby-light'}`}>
                    <CheckCircle2 size={18} /> 
                    {data.status === 'accepted' ? 'STATUT : OUI CONFIRMÉ' : 'STATUT : EN ATTENTE'}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                
                <div className="bg-ruby-dark/40 p-6 rounded-lg border border-rose-gold/10 hover:border-rose-gold/40 transition-all hover:bg-ruby-dark/60 group">
                    <div className="flex justify-between items-start mb-4">
                        <MousePointer2 className="text-rose-gold/50 w-5 h-5 group-hover:text-rose-gold transition-colors" />
                        <span className="text-xs font-medium text-rose-pale uppercase tracking-wider">Tentatives d'esquive</span>
                    </div>
                    <div className="text-4xl text-cream font-light mb-1">{data.attempts}</div>
                    <div className="text-xs text-cream/50 italic">Clics sur le bouton "Non"</div>
                </div>

                <div className="bg-ruby-dark/40 p-6 rounded-lg border border-rose-gold/10 hover:border-rose-gold/40 transition-all hover:bg-ruby-dark/60 group">
                    <div className="flex justify-between items-start mb-4">
                        <Clock className="text-rose-gold/50 w-5 h-5 group-hover:text-rose-gold transition-colors" />
                        <span className="text-xs font-medium text-rose-pale uppercase tracking-wider">Temps d'hésitation</span>
                    </div>
                    <div className="text-4xl text-cream font-light mb-1">{hesitationsDisplay}s</div>
                    <div className="text-xs text-cream/50 italic">Avant acceptation finale</div>
                </div>

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