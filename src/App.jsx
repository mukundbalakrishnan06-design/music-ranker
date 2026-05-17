import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Star, Plus, Pencil, Trash2, Lock, Unlock, Link2, Loader2, Search, X, User, UserPlus, UserMinus } from 'lucide-react';

const SUPABASE_URL = 'https://yrecadlcgucgugvhapoi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-8O4aLdjhEYTnnnaspj8Tw_5TFaF9Xn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [view, setView] = useState('all'); 
  const [rankSubTab, setRankSubTab] = useState('albums'); 
  const [albums, setAlbums] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Profile States
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePin, setNewProfilePin] = useState('');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Album Modal & Spotify States
  const [showModal, setShowModal] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState(null);
  const [expandedAlbums, setExpandedAlbums] = useState({}); 
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);
  const [formData, setFormData] = useState({ 
    title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', spotify_url: '', songs: [] 
  });

  // Admin Protection States
  const [passwordInput, setPasswordInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    await fetchProfiles();
    await fetchAlbums();
  }

  async function fetchProfiles() {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
      if (error) throw error;
      
      const loadedProfiles = data || [];
      setProfiles(loadedProfiles);
      
      const defaultProf = loadedProfiles.find(p => p.name.toLowerCase() === 'mukund') || loadedProfiles[0];
      if (defaultProf) {
        setActiveProfile(defaultProf);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  }

  async function fetchAlbums() {
    try {
      const { data, error } = await supabase
        .from('albums')
        .select(`id, title, artist, year, genre, image_url, spotify_url, songs (id, name, track_number), song_ratings (profile_id, song_id, rating)`)
        .order('created_at', { ascending: false })
        .order('track_number', { foreignTable: 'songs', ascending: true });
      if (error) throw error;
      setAlbums(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }

  const getSongRating = (album, songId) => {
    if (!activeProfile || !album.song_ratings) return 0;
    const match = album.song_ratings.find(r => r.song_id === songId && r.profile_id === activeProfile.id);
    return match ? match.rating : 0;
  };

  const calcAvg = (album) => {
    if (!album.songs || album.songs.length === 0 || !album.song_ratings || !activeProfile) return 0;
    const userRatings = album.song_ratings.filter(r => r.profile_id === activeProfile.id && r.rating > 0);
    if (userRatings.length === 0) return 0;
    return (userRatings.reduce((acc, r) => acc + r.rating, 0) / userRatings.length).toFixed(1);
  };

  const getRatedCount = (album) => {
    if (!album.song_ratings || !activeProfile) return 0;
    return album.song_ratings.filter(r => r.profile_id === activeProfile.id && r.rating > 0).length;
  };

  async function handleCreateProfile() {
    if (!newProfileName.trim()) return alert("Profile name is required!");
    if (newProfilePin.length > 0 && newProfilePin.length !== 4) return alert("PIN must be exactly 4 digits or left blank!");
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert([{ name: newProfileName.trim(), pin: newProfilePin || null }])
        .select().single();
      
      if (error) throw error;
      alert(`Profile created for ${data.name}!`);
      setNewProfileName('');
      setNewProfilePin('');
      setShowProfileModal(false);
      
      const { data: refreshedData } = await supabase.from('profiles').select('*').order('name', { ascending: true });
      if (refreszedData) {
        setProfiles(refreshedData);
        const added = refreshedData.find(p => p.id === data.id);
        if (added) {
          setActiveProfile(added);
          setIsProfileUnlocked(true);
        }
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteProfile(e, prof) {
    e.stopPropagation(); 
    if (!isAdmin) return;
    
    if (prof.name.toLowerCase() === 'mukund') {
      return alert("You cannot delete the primary owner profile!");
    }

    if (window.confirm(`Are you sure you want to delete "${prof.name}" and all of their rankings permanently?`)) {
      try {
        const { error } = await supabase.from('profiles').delete().eq('id', prof.id);
        if (error) throw error;
        
        alert(`Profile "${prof.name}" has been removed.`);
        if (activeProfile?.id === prof.id) {
          setIsProfileUnlocked(false);
        }
        
        await fetchProfiles();
        await fetchAlbums();
      } catch (err) {
        alert(`Error deleting profile: ${err.message}`);
      }
    }
  }

  function handleProfileTabSwitch(prof) {
    setActiveProfile(prof);
    // If the profile has no PIN, it's open and unlocked automatically
    setIsProfileUnlocked(!prof.pin); 
    setPinInput('');
  }

  function verifyProfilePin() {
    if (!activeProfile) return;
    if (!activeProfile.pin || pinInput === activeProfile.pin) {
      setIsProfileUnlocked(true);
      setPinPromptOpen(false);
      setPinInput('');
    } else {
      alert("Invalid 4-digit security PIN!");
    }
  }

  async function updateRating(songId, rating) {
    if (activeProfile?.name?.toLowerCase() === 'mukund' && !isAdmin) {
      alert("Only Mukund can update ratings under this profile tab!");
      return;
    }

    if (!isAdmin && !isProfileUnlocked) {
      if (activeProfile?.pin) {
        setPinPromptOpen(true);
        return;
      } else {
        setIsProfileUnlocked(true);
      }
    }
    
    const profId = activeProfile?.id;
    if (!profId) return;

    try {
      if (rating === 0) {
        await supabase.from('song_ratings').delete().eq('profile_id', profId).eq('song_id', songId);
      } else {
        await supabase.from('song_ratings').upsert({
          profile_id: profId,
          song_id: songId,
          rating: rating
        }, { onConflict: 'profile_id,song_id' });
      }
      fetchAlbums();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleFetchSpotifyData() {
    if (!spotifyUrl.trim()) return alert("Please paste a valid Spotify link first!");
    setIsFetchingSpotify(true);
    try {
      const response = await fetch('/.netlify/functions/get-spotify-album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumUrl: spotifyUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch Spotify data');

      setFormData(prev => ({
        ...prev,
        title: data.title || '',
        artist: data.artist || '',
        year: data.year || '',
        image_url: data.imageUrl || '',
        spotify_url: spotifyUrl,
        tracks: data.tracks && data.tracks.length > 0 ? data.tracks.join('\n') : ''
      }));
      setSpotifyUrl(''); 
    } catch (err) {
      alert(`Spotify Import Error: ${err.message}`);
    } finally {
      setIsFetchingSpotify(false);
    }
  }

  function handlePasswordChange(e) {
    const val = e.target.value;
    setPasswordInput(val);
    if (val === 'vibecode') setIsAdmin(true);
  }

  function handleSignOut() {
    setIsAdmin(false);
    setPasswordInput('');
  }

  function startEditing(e, album) {
    e.stopPropagation(); 
    if (!isAdmin) return;
    setEditingAlbumId(album.id);
    setFormData({
      title: album.title, artist: album.artist, year: album.year || '', genre: album.genre || 'Pop',
      image_url: album.image_url || '', spotify_url: album.spotify_url || '', tracks: '',
      songs: album.songs ? [...album.songs].sort((a, b) => a.track_number - b.track_number) : [] 
    });
    setShowModal(true);
  }

  async function deleteAlbum(e, id) {
    e.stopPropagation(); 
    if (!isAdmin) return;
    if (window.confirm("Delete this album globally?")) {
      await supabase.from('albums').delete().eq('id', id);
      fetchAlbums();
    }
  }

  async function handleSaveAlbum() {
    // FIX: Allow either an explicitly Unlocked User Workspace OR Admin Mode to submit updates
    if (!isAdmin && !isProfileUnlocked) {
      return alert("Please unlock your workspace dashboard session to register new albums!");
    }
    if (!formData.title || !formData.artist) return alert("Title and Artist required!");
    
    try {
      if (editingAlbumId) {
        // Edit block stays restricted implicitly on frontend layout buttons, but handles updates
        await supabase.from('albums').update({
          title: formData.title, artist: formData.artist,
          year: parseInt(formData.year) || null, genre: formData.genre,
          image_url: formData.image_url, spotify_url: formData.spotify_url
        }).eq('id', editingAlbumId);
      } else {
        const { data: album, error: albumError } = await supabase
          .from('albums')
          .insert([{ title: formData.title, artist: formData.artist, year: parseInt(formData.year) || null, genre: formData.genre, image_url: formData.image_url, spotify_url: formData.spotify_url }])
          .select().single();
        if (albumError) throw albumError;
        
        if (formData.tracks.trim()) {
          const lines = formData.tracks.split('\n').filter(t => t.trim());
          const songsToInsert = lines.map((line, index) => ({
            name: line.trim(),
            album_id: album.id,
            rating: 0,
            track_number: index + 1
          }));
          await supabase.from('songs').insert(songsToInsert);
        }
      }
      closeModal();
      fetchAlbums();
    } catch (error) { 
      alert(`Save operation failed: ${error.message}`); 
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingAlbumId(null);
    setFormData({ title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', spotify_url: '', songs: [] });
  }

  const getRankColor = (index) => {
    if (index === 0) return 'text-amber-500 font-black'; 
    if (index === 1) return 'text-zinc-300 font-extrabold'; 
    if (index === 2) return 'text-amber-700 font-bold'; 
    return 'text-zinc-500 font-medium'; 
  };

  const filteredAlbums = albums.filter(album => {
    const query = searchQuery.toLowerCase();
    return album.title?.toLowerCase().includes(query) || album.artist?.toLowerCase().includes(query);
  });

  const rankedAlbums = [...albums].sort((a, b) => calcAvg(b) - calcAvg(a));
  
  const allSongs = albums.flatMap(a => 
    (a.songs || []).map(s => ({ ...s, rating: getSongRating(a, s.id), albumTitle: a.title, artist: a.artist, year: a.year }))
  ).sort((a, b) => b.rating - a.rating);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 p-4 font-sans selection:bg-zinc-800 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full flex-1">
        
        {/* Profile Switcher Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 border-b border-zinc-900/60 no-scrollbar">
          <div className="flex items-center text-zinc-600 px-1 shrink-0"><User size={14} /></div>
          {profiles.map(prof => {
            const isSelected = activeProfile?.id === prof.id;
            return (
              <div 
                key={prof.id} 
                onClick={() => handleProfileTabSwitch(prof)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition shrink-0 flex items-center gap-2 cursor-pointer ${
                  isSelected 
                    ? 'bg-zinc-900 border-zinc-700 text-white shadow-inner' 
                    : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span>{prof.name}</span>
                {isSelected && (prof.pin || prof.name.toLowerCase() === 'mukund') && (
                  isProfileUnlocked || isAdmin ? <Unlock size={10} className="text-emerald-500" /> : <Lock size={10} className="text-zinc-600" />
                )}
                {isAdmin && prof.name.toLowerCase() !== 'mukund' && (
                  <button 
                    onClick={(e) => handleDeleteProfile(e, prof)}
                    className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800/80 transition"
                    title={`Delete ${prof.name}`}
                  >
                    <UserMinus size={11} />
                  </button>
                )}
              </div>
            );
          })}
          <button 
            onClick={() => setShowProfileModal(true)}
            className="p-1.5 rounded-xl border border-dashed border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition shrink-0 ml-1"
            title="Create New Profile"
          >
            <UserPlus size={13} />
          </button>
        </div>

        {/* Header Navigation Area */}
        <div className="flex justify-between items-center mb-6 border-b border-zinc-800/60 pb-4">
          <div className="flex items-center gap-3">
            {/* FIX: Make the Plus button appear if the workspace is unlocked OR admin is enabled */}
            {(isAdmin || isProfileUnlocked) && (
              <button 
                onClick={() => setShowModal(true)} 
                className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition shadow-sm animate-fade-in"
                title="Add Album"
              >
                <Plus size={16} />
              </button>
            )}
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-zinc-900 text-zinc-500 border border-zinc-800/40">
              {isAdmin ? "Admin Mode" : isProfileUnlocked ? `${activeProfile?.name} Edit Mode` : "Viewer Mode"}
            </span>
            {activeProfile?.pin && !isProfileUnlocked && !isAdmin && (
              <button 
                onClick={() => setPinPromptOpen(true)}
                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-zinc-900 border border-amber-900/40 text-amber-500 hover:bg-amber-950/20 transition flex items-center gap-1"
              >
                <Lock size={10} /> Unlock Rating
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${view === 'all' ? 'bg-white text-black' : 'text-zinc-500'}`}>Library</button>
            <button onClick={() => setView('rankings')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${view === 'rankings' ? 'bg-white text-black' : 'text-zinc-500'}`}>Rankings</button>
          </div>
        </div>

        {/* View 1: LIBRARY VIEW */}
        {view === 'all' && (
          <div className="space-y-4">
            <div className="relative flex items-center bg-[#18181b]/40 border border-zinc-800/80 rounded-xl px-3 py-2 text-zinc-400 focus-within:border-zinc-700 transition-all">
              <Search size={16} className="shrink-0 mr-2 text-zinc-600" />
              <input 
                type="text" placeholder="Search library by album or artist..." 
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent outline-none text-sm text-zinc-200 placeholder-zinc-600"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-zinc-600 hover:text-zinc-400 transition ml-1"><X size={14} /></button>
              )}
            </div>

            {filteredAlbums.length > 0 ? (
              filteredAlbums.map(album => {
                const isExpanded = !!expandedAlbums[album.id];
                const albumAvg = calcAvg(album);

                return (
                  <div key={album.id} className="bg-[#18181b]/50 rounded-xl border border-zinc-900 shadow-xl overflow-hidden">
                    <div 
                      onClick={() => setExpandedAlbums(p => ({ ...p, [album.id]: !p[album.id] }))}
                      className="p-4 bg-[#27272a]/20 flex justify-between items-center gap-4 cursor-pointer hover:bg-[#27272a]/40 transition"
                    >
                      <div className="min-w-0 flex-1 flex gap-4 items-center">
                        {album.image_url && (
                          <img src={album.image_url} alt={album.title} className="w-12 h-12 rounded-lg object-cover bg-zinc-900 border border-zinc-800/80 shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap h-5">
                            {album.spotify_url ? (
                              <a href={album.spotify_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-base font-bold text-zinc-100 hover:text-emerald-400 hover:underline transition leading-none">
                                {album.title}
                              </a>
                            ) : (
                              <h2 className="text-base font-bold text-zinc-100 leading-none">{album.title}</h2>
                            )}
                            {album.genre && <span className="px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 text-[9px] uppercase font-bold tracking-wider inline-flex items-center justify-center h-4 self-center">{album.genre}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-zinc-500">
                            <span>{album.artist}</span>
                            {album.year && <span>• {album.year}</span>}
                            <span>• {getRatedCount(album)}/{album.songs?.length || 0} rated</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-black text-zinc-200 leading-none">{albumAvg}/10</div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button onClick={(e) => startEditing(e, album)} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white"><Pencil size={12} /></button>
                            <button onClick={(e) => deleteAlbum(e, album.id)} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="divide-y divide-zinc-900/40 px-2 pb-2 border-t border-zinc-900/60 bg-zinc-950/20">
                        {(album.songs || []).map((song, i) => {
                          const currentRating = getSongRating(album, song.id);
                          return (
                            <div key={song.id} className="flex justify-between items-center text-xs group py-2 px-2 hover:bg-zinc-900/30 transition rounded-lg">
                              <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                                <span className="text-zinc-600 font-mono text-[10px] w-4 shrink-0 text-right">{i + 1}</span>
                                <span className="text-zinc-300 truncate font-medium">{song.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex gap-0.5">
                                  {[...Array(10)].map((_, starIdx) => (
                                    <Star 
                                      key={starIdx} size={12} 
                                      onClick={() => updateRating(song.id, currentRating === starIdx + 1 ? 0 : starIdx + 1)}
                                      className={`transition-all cursor-pointer ${
                                        currentRating > starIdx 
                                          ? 'fill-yellow-500 text-yellow-500 drop-shadow-[0_0_2px_rgba(234,179,8,0.3)]' 
                                          : 'text-zinc-800 hover:text-zinc-500'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="font-bold text-zinc-500 w-4 text-right text-[11px] font-mono">{currentRating || '-'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-zinc-600 text-xs font-medium">No albums found.</div>
            )}
          </div>
        )}

        {/* View 2: RANKINGS */}
        {view === 'rankings' && (
          <div>
            <div className="flex gap-4 mb-6">
              <button onClick={() => setRankSubTab('albums')} className={`text-xs font-bold tracking-wider ${rankSubTab === 'albums' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-500'}`}>ALBUMS</button>
              <button onClick={() => setRankSubTab('songs')} className={`text-xs font-bold tracking-wider ${rankSubTab === 'songs' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-500'}`}>SONGS</button>
            </div>
            <div className="space-y-3">
              {rankSubTab === 'albums' ? rankedAlbums.map((album, i) => {
                const score = parseFloat(calcAvg(album));
                const percentage = Math.min((score / 10) * 100, 100);

                return (
                  <div key={album.id} className="relative bg-[#18181b]/40 p-4 rounded-xl border border-zinc-900 shadow-md flex items-center justify-between overflow-hidden group hover:border-zinc-800/60 transition">
                    <div className="flex items-center gap-4 min-w-0 z-10">
                      <span className={`text-base font-bold italic w-6 shrink-0 ${getRankColor(i)}`}>#{i + 1}</span>
                      {album.image_url && <img src={album.image_url} alt={album.title} className="w-10 h-10 rounded-md object-cover bg-zinc-900 border border-zinc-800 shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />}
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap h-5">
                          {album.spotify_url ? (
                            <a href={album.spotify_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-zinc-100 hover:text-emerald-400 hover:underline transition leading-none">{album.title}</a>
                          ) : (
                            <span className="text-sm font-bold text-zinc-100 leading-none">{album.title}</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 font-medium">{album.artist} {album.year ? `• ${album.year}` : ''}</div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-zinc-200 shrink-0 pl-4 z-10">{score.toFixed(1)}</div>
                    <div className="absolute bottom-0 left-12 h-[2px] bg-amber-500/40 rounded-full transition-all duration-500 group-hover:bg-amber-500/70" style={{ width: `calc(${percentage}% - 3rem)` }} />
                  </div>
                );
              }) : allSongs.map((song, i) => {
                const percentage = Math.min((song.rating / 10) * 100, 100);
                return (
                  <div key={song.id} className="relative bg-[#18181b]/40 p-4 rounded-xl border border-zinc-900 shadow-md flex items-center justify-between overflow-hidden group hover:border-zinc-800/60 transition">
                    <div className="flex items-center gap-4 min-w-0 z-10">
                      <span className={`text-sm font-bold w-6 shrink-0 ${getRankColor(i)}`}>#{i + 1}</span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap h-5">
                          <span className="text-sm font-bold text-zinc-100 leading-none">{song.name}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 font-medium">{song.albumTitle} • {song.artist} {song.year ? `• ${song.year}` : ''}</div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-zinc-200 shrink-0 pl-4 z-10">{song.rating ? `${song.rating}.0` : '0.0'}</div>
                    <div className="absolute bottom-0 left-12 h-[2px] bg-amber-500/40 rounded-full transition-all duration-500 group-hover:bg-amber-500/70" style={{ width: `calc(${percentage}% - 3rem)` }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER AREA */}
      <div className="max-w-4xl mx-auto w-full border-t border-zinc-900/80 mt-12 pt-6 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="text-zinc-600 font-medium tracking-wide">Built with ⚡ by <span className="text-zinc-400 font-bold cursor-default">Mukund</span></div>
        <div>
          {isAdmin ? (
            <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 px-3 py-1.5 rounded-xl">
              <Unlock size={12} className="text-emerald-500 animate-pulse" />
              <span className="text-zinc-400 font-medium">Logged in as Editor</span>
              <button onClick={handleSignOut} className="text-[10px] text-zinc-400 font-bold bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-lg">LOCK</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-900/20 px-3 py-1 rounded-xl group hover:bg-zinc-900/50 border border-transparent hover:border-zinc-800/40">
              <Lock size={11} className="text-zinc-600" />
              <input type="password" placeholder="Admin unlock" value={passwordInput} onChange={handlePasswordChange} className="bg-transparent outline-none w-20 text-zinc-600 focus:text-zinc-300 placeholder-zinc-700 text-center text-xs" />
            </div>
          )}
        </div>
      </div>

      {/* POPUP PROMPT: PROFILE PIN VALIDATION */}
      {pinPromptOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#18181b] w-full max-w-xs p-5 rounded-2xl border border-zinc-800 shadow-xl text-center">
            <Lock size={20} className="mx-auto text-amber-500 mb-2" />
            <h3 className="text-sm font-bold text-zinc-200 mb-1">Unlock {activeProfile?.name}'s Profile</h3>
            <p className="text-zinc-500 text-[11px] mb-4">Enter the 4-digit security PIN to update ratings.</p>
            <input 
              type="password" maxLength={4} placeholder="••••" value={pinInput} 
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              className="w-24 text-center bg-zinc-950 border border-zinc-800 p-2 rounded-xl text-lg tracking-widest text-white outline-none mb-4 focus:border-zinc-600"
            />
            <div className="flex gap-2">
              <button onClick={verifyProfilePin} className="flex-1 bg-white text-black font-black py-2 rounded-xl text-xs">UNLOCK</button>
              <button onClick={() => { setPinPromptOpen(false); setPinInput(''); }} className="px-3 text-zinc-500 hover:text-zinc-300 text-xs font-bold">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PROFILE */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setShowProfileModal(false)}>
          <div className="bg-[#18181b] w-full max-w-sm p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 text-zinc-100 flex items-center gap-2"><UserPlus size={16} /> Create Ranking Profile</h2>
            <p className="text-zinc-500 text-xs mb-4">Add a separate dashboard workspace to track individual reviews.</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-1 block">Your Name</label>
                <input placeholder="e.g. Ayeshwarya" className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none focus:border-zinc-600" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-1 block">4-Digit Access PIN (Optional)</label>
                <input placeholder="Leave blank for no security code" maxLength={4} className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none focus:border-zinc-600" value={newProfilePin} onChange={e => setNewProfilePin(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateProfile} className="flex-1 bg-white text-black font-black py-2.5 rounded-xl text-xs">CREATE DASHBOARD</button>
              <button onClick={() => setShowProfileModal(false)} className="px-3 text-zinc-500 text-xs font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* INPUT / EDIT ALBUM MODAL */}
      {showModal && (isAdmin || isProfileUnlocked) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={closeModal}>
          <div className="bg-[#18181b] w-full max-w-lg p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-zinc-100">{editingAlbumId ? 'Edit Global Album' : 'Add New Album'}</h2>
            {!editingAlbumId && (
              <div className="mb-4 flex gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800/60 focus-within:border-zinc-700 transition">
                <div className="flex items-center pl-1 text-zinc-500"><Link2 size={14} /></div>
                <input placeholder="Paste Spotify Album Link..." className="bg-transparent flex-1 text-xs outline-none text-white placeholder-zinc-600" value={spotifyUrl} onChange={e => setSpotifyUrl(e.target.value)} disabled={isFetchingSpotify} />
                <button onClick={handleFetchSpotifyData} disabled={isFetchingSpotify || !spotifyUrl.trim()} className="bg-zinc-900 border border-zinc-700 text-[10px] font-bold text-zinc-300 hover:text-white px-3 py-1 rounded-lg transition">{isFetchingSpotify ? <Loader2 size={10} className="animate-spin" /> : 'AUTOFILL'}</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="Album title" className="bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-sm text-white outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              <input placeholder="Artist" className="bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-sm text-white outline-none" value={formData.artist} onChange={e => setFormData({...formData, artist: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="Year" type="number" className="bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-sm text-white outline-none" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} />
              <select className="bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-zinc-400 text-sm outline-none" value={formData.genre} onChange={e => setFormData({...formData, genre: e.target.value})}>
                {['Pop', 'Hip Hop', 'Rock', 'R&B', 'Electronic', 'Country'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="mb-3"><input placeholder="Image Cover URL (Optional)" className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} /></div>
            <div className="mb-4"><input placeholder="Spotify Link (Optional)" className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none" value={formData.spotify_url} onChange={e => setFormData({...formData, spotify_url: e.target.value})} /></div>
            {!editingAlbumId && <textarea placeholder="Tracklist (one per line)" className="w-full bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl h-32 outline-none mb-4 resize-none text-sm text-white" value={formData.tracks} onChange={e => setFormData({...formData, tracks: e.target.value})} />}
            <div className="flex gap-3">
              <button onClick={handleSaveAlbum} className="flex-1 bg-white text-black font-black py-3 rounded-xl text-sm">SAVE ALBUM</button>
              <button onClick={closeModal} className="px-4 text-zinc-500 text-sm font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}