import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Star, Plus, Pencil, Trash2, Lock, Unlock, Link2, Loader2, Search, X, User, UserPlus, UserMinus, BookmarkPlus } from 'lucide-react';

const SUPABASE_URL = 'https://yrecadlcgucgugvhapoi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-8O4aLdjhEYTnnnaspj8Tw_5TFaF9Xn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  // Navigation Tabs
  const [view, setView] = useState('all'); // 'all' (Library) or 'rankings'
  const [rankSubTab, setRankSubTab] = useState('albums'); // 'albums' or 'songs'
  
  // Data States
  const [albums, setAlbums] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [profileAlbumMap, setProfileAlbumMap] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Active Workspace Profile States
  const [activeProfile, setActiveProfile] = useState(null);
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePin, setNewProfilePin] = useState('');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Modals & Forms
  const [showModal, setShowModal] = useState(false);
  const [showUserAddModal, setShowUserAddModal] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState(null);
  const [expandedAlbums, setExpandedAlbums] = useState({});
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);
  const [formData, setFormData] = useState({
    title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', spotify_url: ''
  });

  // Master Override Protection
  const [passwordInput, setPasswordInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    await fetchProfiles();
    await fetchAppData();
  }

  // --- DATABASE DATA SYNCHRONIZATION ---
  async function fetchProfiles() {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
      if (error) throw error;
      const loadedProfiles = data || [];
      setProfiles(loadedProfiles);
      
      if (loadedProfiles.length > 0) {
        // Enforce fallback directly to Home space on mount load
        const homeSpace = loadedProfiles.find(p => p.name.toLowerCase() === 'home') || loadedProfiles[0];
        setActiveProfile(homeSpace);
        setIsProfileUnlocked(true);
      }
    } catch (err) {
      console.error("Profile load issue:", err);
    }
  }

  async function fetchAppData() {
    try {
      // 1. Fetch Master Album and Track structures
      const { data: albumData, error: albumError } = await supabase
        .from('albums')
        .select(`
          id, title, artist, year, genre, image_url, spotify_url,
          songs (id, name, track_number),
          song_ratings (profile_id, song_id, rating)
        `)
        .order('created_at', { ascending: false });

      if (albumError) throw albumError;

      const preparedAlbums = (albumData || []).map(album => ({
        ...album,
        songs: album.songs ? [...album.songs].sort((a, b) => a.track_number - b.track_number) : []
      }));
      setAlbums(preparedAlbums);

      // 2. Fetch User Library Mapping arrays
      const { data: mappingData, error: mappingError } = await supabase.from('profile_albums').select('*');
      if (mappingError) throw mappingError;
      setProfileAlbumMap(mappingData || []);

    } catch (err) {
      console.error("Library sync failure:", err);
    }
  }

  const isHomeActive = activeProfile?.name?.toLowerCase() === 'home';

  // --- VISIBILITY FILTERS ---
  // If active tab is Home -> return ALL master pool items. If active tab is a custom friend -> filter items in their map
  const visibleAlbums = albums.filter(album => {
    if (isHomeActive) return true;
    return profileAlbumMap.some(map => map.profile_id === activeProfile?.id && map.album_id === album.id);
  });

  const filteredAlbums = visibleAlbums.filter(album => {
    const query = searchQuery.toLowerCase();
    return album.title?.toLowerCase().includes(query) || album.artist?.toLowerCase().includes(query);
  });

  // --- MATH INTERACTION CORES ---
  const getSongRating = (album, songId) => {
    if (isHomeActive || !activeProfile || !album?.song_ratings) return 0;
    const match = album.song_ratings.find(r => r.song_id === songId && r.profile_id === activeProfile.id);
    return match ? match.rating : 0;
  };

  const calcAvg = (album) => {
    if (isHomeActive || !album || !album.songs || album.songs.length === 0 || !album.song_ratings || !activeProfile) return "0.0";
    const userRatings = album.song_ratings.filter(r => r.profile_id === activeProfile.id && r.rating > 0);
    if (userRatings.length === 0) return "0.0";
    return (userRatings.reduce((acc, r) => acc + r.rating, 0) / userRatings.length).toFixed(1);
  };

  const getRatedCount = (album) => {
    if (isHomeActive || !album || !album.song_ratings || !activeProfile) return 0;
    return album.song_ratings.filter(r => r.profile_id === activeProfile.id && r.rating > 0).length;
  };

  // --- ACTIONS: WORKSPACE OPERATIONS ---
  async function handleCreateProfile() {
    if (!newProfileName.trim()) return alert("Name identifier is mandatory.");
    if (newProfileName.toLowerCase() === 'home') return alert("Reserved keyword exception.");
    if (newProfilePin.length > 0 && newProfilePin.length !== 4) return alert("PIN requires 4 numerical digits.");

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert([{ name: newProfileName.trim(), pin: newProfilePin || null }])
        .select().single();

      if (error) throw error;
      alert(`Workspace deployed for ${data.name}!`);
      setNewProfileName('');
      setNewProfilePin('');
      setShowProfileModal(false);
      await fetchProfiles();
      setActiveProfile(data);
      setIsProfileUnlocked(true);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteProfile(e, prof) {
    e.stopPropagation();
    if (!isAdmin) return;
    if (prof.name.toLowerCase() === 'home') return;

    if (window.confirm(`Wipe dashboard workspace "${prof.name}" and all data?`)) {
      await supabase.from('profiles').delete().eq('id', prof.id);
      if (activeProfile?.id === prof.id) {
        const home = profiles.find(p => p.name.toLowerCase() === 'home');
        setActiveProfile(home);
        setIsProfileUnlocked(true);
      }
      await fetchProfiles();
      await fetchAppData();
    }
  }

  function handleProfileTabSwitch(prof) {
    setActiveProfile(prof);
    setIsProfileUnlocked(!prof.pin || prof.name.toLowerCase() === 'home');
    setPinInput('');
    setView('all'); // Always reset to Library view to avoid rendering empty leaderboards
  }

  function verifyProfilePin() {
    if (pinInput === activeProfile?.pin) {
      setIsProfileUnlocked(true);
      setPinPromptOpen(false);
      setPinInput('');
    } else {
      alert("Invalid Access Code.");
    }
  }

  // --- ACTIONS: RATING WORKSPACE ---
  async function updateRating(songId, rating) {
    if (isHomeActive) return alert("Baseline Home repository is a read-only directory.");
    
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
      await fetchAppData();
    } catch (err) {
      console.error(err);
    }
  }

  // --- ACTIONS: MASTER MANAGEMENT STORAGE ---
  async function handleFetchSpotifyData() {
    if (!spotifyUrl.trim()) return alert("Paste link target first.");
    setIsFetchingSpotify(true);
    try {
      const response = await fetch('/.netlify/functions/get-spotify-album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumUrl: spotifyUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setFormData({
        title: data.title || '', artist: data.artist || '', year: data.year || '', genre: 'Pop',
        image_url: data.imageUrl || '', spotify_url: spotifyUrl,
        tracks: data.tracks && data.tracks.length > 0 ? data.tracks.join('\n') : ''
      });
      setSpotifyUrl(''); 
    } catch (err) {
      alert(`Sync issue: ${err.message}`);
    } compression: finally {
      setIsFetchingSpotify(false);
    }
  }

  async function handleSaveAlbum() {
    if (!isAdmin) return alert("Privilege restriction: Entry writes are limited to Core Admin authorization.");
    if (!formData.title || !formData.artist) return alert("Required identifiers missing.");
    
    try {
      if (editingAlbumId) {
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
            album_id: album.id,
            name: line.trim(),
            track_number: index + 1
          }));
          await supabase.from('songs').insert(songsToInsert);
        }
      }
      closeModal();
      await fetchAppData();
    } catch (error) { alert(error.message); }
  }

  async function deleteAlbum(e, id) {
    e.stopPropagation(); 
    if (!isAdmin) return;
    if (window.confirm("Purge album universally?")) {
      await supabase.from('albums').delete().eq('id', id);
      await fetchAppData();
    }
  }

  // --- CUSTOM ACTIONS: ADD EXISTING TO PROFILE ---
  async function pinAlbumToUserProfile(albumId) {
    if (!activeProfile || isHomeActive) return;
    try {
      const { error } = await supabase.from('profile_albums').insert([{ profile_id: activeProfile.id, album_id: albumId }]);
      if (error) throw error;
      await fetchAppData();
      setShowUserAddModal(false);
    } catch (err) {
      alert("This release is already pinned to your workspace dashboard.");
    }
  }

  async function unpinAlbumFromUserProfile(e, albumId) {
    e.stopPropagation();
    if (!activeProfile || isHomeActive) return;
    if (window.confirm("Remove this release cover card from your collection tab view?")) {
      await supabase.from('profile_albums').delete().eq('profile_id', activeProfile.id).eq('album_id', albumId);
      // Clean rating nodes attached to this profile structure safely too
      const songIds = albums.find(a => a.id === albumId)?.songs?.map(s => s.id) || [];
      if (songIds.length > 0) {
        await supabase.from('song_ratings').delete().eq('profile_id', activeProfile.id).in('song_id', songIds);
      }
      await fetchAppData();
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingAlbumId(null);
    setFormData({ title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', spotify_url: '' });
  }

  // --- RENDERING LEADERBOARD QUERY MATRICES ---
  const rankedAlbums = [...visibleAlbums].sort((a, b) => parseFloat(calcAvg(b)) - parseFloat(calcAvg(a)));

  const allSongs = visibleAlbums.flatMap(a => 
    (a.songs || []).map(s => ({ ...s, rating: getSongRating(a, s.id), albumTitle: a.title, artist: a.artist, year: a.year }))
  ).sort((a, b) => b.rating - a.rating);

  const getRankColor = (index) => {
    if (index === 0) return 'text-amber-500 font-black'; 
    if (index === 1) return 'text-zinc-300 font-extrabold'; 
    if (index === 2) return 'text-amber-700 font-bold'; 
    return 'text-zinc-500 font-medium'; 
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 p-4 font-sans flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full flex-1">
        
        {/* VIEW REGION: PROFILE SWAPPER HORIZONTAL TABS */}
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
                    ? 'bg-white border-white text-black shadow-md' 
                    : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span>{prof.name}</span>
                {isSelected && prof.pin && (
                  isProfileUnlocked || isAdmin ? <Unlock size={10} className="text-emerald-600" /> : <Lock size={10} className="text-zinc-400" />
                )}
                {isAdmin && prof.name.toLowerCase() !== 'home' && (
                  <button 
                    onClick={(e) => handleDeleteProfile(e, prof)}
                    className="p-0.5 rounded text-zinc-400 hover:text-red-500 transition"
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
            title="Deploy Workspace Account Profile"
          >
            <UserPlus size={13} />
          </button>
        </div>

        {/* VIEW REGION: DASHBOARD ROUTING AND HEADER OPERATORS */}
        <div className="flex justify-between items-center mb-6 border-b border-zinc-800/60 pb-4">
          <div className="flex items-center gap-3">
            {isHomeActive ? (
              isAdmin && (
                <button 
                  onClick={() => { setEditingAlbumId(null); setShowModal(true); }} 
                  className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition"
                  title="Catalog New Master Release Asset"
                >
                  <Plus size={16} />
                </button>
              )
            ) : (
              (isProfileUnlocked || isAdmin) && (
                <button 
                  onClick={() => setShowUserAddModal(true)} 
                  className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition flex items-center gap-1 text-xs font-bold"
                  title="Pin Available Asset From Repository"
                >
                  <BookmarkPlus size={14} /> Add Album
                </button>
              )
            )}
            
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-zinc-900 text-zinc-500 border border-zinc-800/40">
              {isAdmin ? "Admin Root Status" : isProfileUnlocked ? `${activeProfile?.name} Edit Access` : "Public Reader View"}
            </span>
            {activeProfile?.pin && !isProfileUnlocked && !isAdmin && (
              <button 
                onClick={() => setPinPromptOpen(true)}
                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-zinc-900 border border-amber-900/40 text-amber-500 hover:bg-amber-950/20 transition flex items-center gap-1"
              >
                <Lock size={10} /> Authenticate
              </button>
            )}
          </div>
          
          {/* Rankings only contextualize data if you have moved away from the Home repository view */}
          {!isHomeActive && (
            <div className="flex gap-2">
              <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${view === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Library</button>
              <button onClick={() => setView('rankings')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${view === 'rankings' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Rankings</button>
            </div>
          )}
        </div>

        {/* CONTAINER FRAME A: THE COLLECTION WORKSPACE GRID */}
        {view === 'all' && (
          <div className="space-y-4">
            <div className="relative flex items-center bg-[#18181b]/40 border border-zinc-800/80 rounded-xl px-3 py-2 text-zinc-400 focus-within:border-zinc-700 transition-all">
              <Search size={16} className="shrink-0 mr-2 text-zinc-600" />
              <input 
                type="text" placeholder="Filter current view parameters by title or artist..." 
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
                const scoreValueString = calcAvg(album);

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
                            {!isHomeActive && <span>• {getRecordedCount(album)}/{album.songs?.length || 0} rated</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        {!isHomeActive && (
                          <div className="text-right">
                            <div className="text-lg font-black text-zinc-200 leading-none">{scoreValueString}/10</div>
                          </div>
                        )}
                        
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          {isAdmin && isHomeActive && (
                            <>
                              <button onClick={(e) => { setEditingAlbumId(album.id); setFormData({title: album.title, artist: album.artist, year: album.year || '', genre: album.genre || 'Pop', image_url: album.image_url || '', spotify_url: album.spotify_url || '', tracks: ''}); setShowModal(true); }} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white"><Pencil size={12} /></button>
                              <button onClick={(e) => deleteAlbum(e, album.id)} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400"><Trash2 size={12} /></button>
                            </>
                          )}
                          {!isHomeActive && (isProfileUnlocked || isAdmin) && (
                            <button onClick={(e) => unpinAlbumFromUserProfile(e, album.id)} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 text-xs font-bold" title="Unpin from dashboard workspace">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && !isHomeActive && (
                      <div className="divide-y divide-zinc-900/40 px-2 pb-2 border-t border-zinc-900/60 bg-zinc-950/20">
                        {album.songs && album.songs.length > 0 ? album.songs.map((song, idx) => {
                          const ratingNode = getSongRating(album, song.id);
                          return (
                            <div key={song.id} className="flex justify-between items-center text-xs group py-2 px-2 hover:bg-zinc-900/30 transition rounded-lg">
                              <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                                <span className="text-zinc-600 font-mono text-[10px] w-4 shrink-0 text-right">{idx + 1}</span>
                                <span className="text-zinc-300 truncate font-medium">{song.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex gap-0.5">
                                  {[...Array(10)].map((_, starIdx) => (
                                    <Star 
                                      key={starIdx} size={12} 
                                      onClick={() => updateRating(song.id, ratingNode === starIdx + 1 ? 0 : starIdx + 1)}
                                      className={`transition-all cursor-pointer ${
                                        ratingNode > starIdx 
                                          ? 'fill-yellow-500 text-yellow-500 drop-shadow-[0_0_2px_rgba(234,179,8,0.3)]' 
                                          : 'text-zinc-800 hover:text-zinc-500'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="font-bold text-zinc-500 w-4 text-right text-[11px] font-mono">{ratingNode || '-'}</span>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="text-center py-3 text-zinc-700 text-xs font-mono">No songs recorded inside the core node framework registry.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-zinc-600 text-xs font-medium">No albums listed here yet.</div>
            )}
          </div>
        )}

        {/* CONTAINER FRAME B: THE SEPARATE LEADERBOARD MODULES */}
        {view === 'rankings' && !isHomeActive && (
          <div>
            <div className="flex gap-4 mb-6">
              <button onClick={() => setRankSubTab('albums')} className={`text-xs font-bold tracking-wider transition ${rankSubTab === 'albums' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-500 hover:text-zinc-300'}`}>ALBUMS</button>
              <button onClick={() => setRankSubTab('songs')} className={`text-xs font-bold tracking-wider transition ${rankSubTab === 'songs' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-500 hover:text-zinc-300'}`}>SONGS</button>
            </div>
            
            <div className="space-y-3">
              {rankSubTab === 'albums' ? (
                rankedAlbums.map((album, idx) => {
                  const ratingSummary = parseFloat(calcAvg(album));
                  const percentWidth = Math.min((ratingSummary / 10) * 100, 100);

                  return (
                    <div key={album.id} className="relative bg-[#18181b]/40 p-4 rounded-xl border border-zinc-900 shadow-md flex items-center justify-between overflow-hidden group hover:border-zinc-800/60 transition">
                      <div className="flex items-center gap-4 min-w-0 z-10">
                        <span className={`text-base font-bold italic w-6 shrink-0 ${getRankColor(idx)}`}>#{idx + 1}</span>
                        {album.image_url && <img src={album.image_url} alt={album.title} className="w-10 h-10 rounded-md object-cover bg-zinc-900 border border-zinc-800 shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />}
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-zinc-100 block truncate">{album.title}</span>
                          <div className="text-xs text-zinc-500 mt-0.5 font-medium">{album.artist} {album.year ? `• ${album.year}` : ''}</div>
                        </div>
                      </div>
                      <div className="text-xl font-bold text-zinc-200 shrink-0 pl-4 z-10">{ratingSummary.toFixed(1)}</div>
                      <div className="absolute bottom-0 left-12 h-[2px] bg-amber-500/40 rounded-full transition-all duration-500 group-hover:bg-amber-500/70" style={{ width: `calc(${percentWidth}% - 3rem)` }} />
                    </div>
                  );
                })
              ) : (
                allSongs.map((song, idx) => {
                  const fillPercent = Math.min((song.rating / 10) * 100, 100);
                  return (
                    <div key={song.id} className="relative bg-[#18181b]/40 p-4 rounded-xl border border-zinc-900 shadow-md flex items-center justify-between overflow-hidden group hover:border-zinc-800/60 transition">
                      <div className="flex items-center gap-4 min-w-0 z-10">
                        <span className={`text-sm font-bold w-6 shrink-0 ${getRankColor(idx)}`}>#{idx + 1}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-zinc-100 block truncate">{song.name}</span>
                          <div className="text-xs text-zinc-500 mt-0.5 font-medium">{song.albumTitle} • {song.artist}</div>
                        </div>
                      </div>
                      <div className="text-xl font-bold text-zinc-200 shrink-0 pl-4 z-10">{song.rating ? `${song.rating}.0` : '0.0'}</div>
                      <div className="absolute bottom-0 left-12 h-[2px] bg-amber-500/40 rounded-full transition-all duration-500 group-hover:bg-amber-500/70" style={{ width: `calc(${fillPercent}% - 3rem)` }} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>

      {/* FIXED FOOTER CONTROLS ROW */}
      <div className="max-w-4xl mx-auto w-full border-t border-zinc-900/80 mt-12 pt-6 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="text-zinc-600 font-medium tracking-wide">Shared Music Directory Sync via <span className="text-zinc-400 font-bold cursor-default">Mukund</span></div>
        <div>
          {isAdmin ? (
            <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 px-3 py-1.5 rounded-xl">
              <Unlock size={12} className="text-emerald-500 animate-pulse" />
              <span className="text-zinc-400 font-medium">Admin Mode Active</span>
              <button onClick={() => { setIsAdmin(false); setPasswordInput(''); }} className="text-[10px] text-zinc-400 font-bold bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-lg hover:text-white">LOCK</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-900/20 px-3 py-1 rounded-xl group hover:bg-zinc-900/50 border border-transparent hover:border-zinc-800/40">
              <Lock size={11} className="text-zinc-600" />
              <input type="password" placeholder="Admin authorization code" value={passwordInput} onChange={e => { setPasswordInput(e.target.value); if (e.target.value === 'vibecode') setIsAdmin(true); }} className="bg-transparent outline-none w-24 text-zinc-600 focus:text-zinc-300 placeholder-zinc-700 text-center text-xs transition-colors" />
            </div>
          )}
        </div>
      </div>

      {/* MODAL WINDOW: ACCOUNT CODE VERIFICATION LOCK */}
      {pinPromptOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#18181b] w-full max-w-xs p-5 rounded-2xl border border-zinc-800 shadow-xl text-center">
            <Lock size={20} className="mx-auto text-amber-500 mb-2" />
            <h3 className="text-sm font-bold text-zinc-200 mb-1">Unlock {activeProfile?.name}'s Dashboard</h3>
            <p className="text-zinc-500 text-[11px] mb-4">Provide the 4-digit security PIN workspace passcode.</p>
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

      {/* MODAL WINDOW: NEW ACCOUNT CREATION REGISTRY */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setShowProfileModal(false)}>
          <div className="bg-[#18181b] w-full max-w-sm p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 text-zinc-100 flex items-center gap-2"><UserPlus size={16} /> Deploy Workspace Profile</h2>
            <p className="text-zinc-500 text-xs mb-4">Add a separate dashboard workspace to track individual reviews.</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-1 block">Account Name</label>
                <input placeholder="e.g. Bob" className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none focus:border-zinc-600" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-1 block">4-Digit Security PIN (Optional)</label>
                <input placeholder="Leave empty for public accessibility" maxLength={4} className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none focus:border-zinc-600" value={newProfilePin} onChange={e => setNewProfilePin(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateProfile} className="flex-1 bg-white text-black font-black py-2.5 rounded-xl text-xs">CREATE DASHBOARD</button>
              <button onClick={() => setShowProfileModal(false)} className="px-3 text-zinc-500 text-xs font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* USER SELECTOR DROPDOWN: ADD ALBUM FROM MASTER REPOSITORY POOL */}
      {showUserAddModal && !isHomeActive && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setShowUserAddModal(false)}>
          <div className="bg-[#18181b] w-full max-w-md p-6 rounded-3xl border border-zinc-800 shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 text-zinc-100">Pin Album From Master Pool</h2>
            <p className="text-zinc-500 text-xs mb-4">Choose a title cataloged by Home admin to pin to your personal diary.</p>
            
            <div className="overflow-y-auto space-y-2 flex-1 pr-1 border border-zinc-900 p-2 rounded-xl bg-zinc-950/40">
              {albums.filter(a => !profileAlbumMap.some(m => m.profile_id === activeProfile?.id && m.album_id === a.id)).length > 0 ? (
                albums.filter(a => !profileAlbumMap.some(m => m.profile_id === activeProfile?.id && m.album_id === a.id)).map(masterAlbum => (
                  <div 
                    key={masterAlbum.id} 
                    onClick={() => pinAlbumToUserProfile(masterAlbum.id)}
                    className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/30 cursor-pointer flex items-center gap-3 transition"
                  >
                    {masterAlbum.image_url && <img src={masterAlbum.image_url} className="w-8 h-8 rounded object-cover border border-zinc-800" />}
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-zinc-200 block truncate">{masterAlbum.title}</span>
                      <span className="text-[10px] text-zinc-500 block truncate">{masterAlbum.artist}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-zinc-600 text-xs font-mono">All available database titles already added.</div>
              )}
            </div>
            
            <button onClick={() => setShowUserAddModal(false)} className="w-full bg-zinc-900 text-zinc-400 font-bold py-2.5 rounded-xl text-xs mt-4 border border-zinc-800 hover:text-white transition">DISMISS</button>
          </div>
        </div>
      )}

      {/* CORE INPUT REPOSITORY MODAL: MANAGED BY ADMIN LOCK */}
      {showModal && isAdmin && isHomeActive && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={closeModal}>
          <div className="bg-[#18181b] w-full max-w-lg p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-zinc-100">{editingAlbumId ? 'Edit Global Album Properties' : 'Catalog Master Archive Entry'}</h2>
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
            {!editingAlbumId && <textarea placeholder="Tracklist (one track name entry per row line break)" className="w-full bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl h-32 outline-none mb-4 resize-none text-sm text-white" value={formData.tracks} onChange={e => setFormData({...formData, tracks: e.target.value})} />}
            <div className="flex gap-3">
              <button onClick={handleSaveAlbum} className="flex-1 bg-white text-black font-black py-3 rounded-xl text-sm hover:bg-zinc-200 transition">SAVE TO REPOSITORY</button>
              <button onClick={closeModal} className="px-4 text-zinc-500 text-sm font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}