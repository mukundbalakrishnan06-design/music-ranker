import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Star, Plus, Pencil, Trash2, Lock, Unlock, Link2, Loader2, Search, X, User, UserPlus, UserMinus } from 'lucide-react';

const SUPABASE_URL = 'https://yrecadlcgucgugvhapoi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-8O4aLdjhEYTnnnaspj8Tw_5TFaF9Xn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  // Navigation State Indicators
  const [view, setView] = useState('all'); 
  const [rankSubTab, setRankSubTab] = useState('albums'); 
  
  // Data State Arrays
  const [albums, setAlbums] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Profile Workspace State Settings
  const [activeProfile, setActiveProfile] = useState(null);
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePin, setNewProfilePin] = useState('');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Asset Creation & Modal Toggle Options
  const [showModal, setShowModal] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState(null);
  const [expandedAlbums, setExpandedAlbums] = useState({});
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);
  const [formData, setFormData] = useState({
    title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', spotify_url: ''
  });

  // Global Access Key Protection System
  const [passwordInput, setPasswordInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    initSyncProcess();
  }, []);

  async function initSyncProcess() {
    await reloadProfiles();
    await reloadLibrary();
  }

  // --- RECOVERY CONTROLLERS ---
  async function reloadProfiles() {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
      if (error) throw error;
      const parsedProfiles = data || [];
      setProfiles(parsedProfiles);
      
      if (parsedProfiles.length > 0) {
        const primarySpace = parsedProfiles.find(p => p.name.toLowerCase() === 'mukund') || parsedProfiles[0];
        setActiveProfile(primarySpace);
        setIsProfileUnlocked(!primarySpace.pin);
      }
    } catch (err) {
      console.error("Initialization failure during user-profile load:", err);
    }
  }

  async function reloadLibrary() {
    try {
      const { data, error } = await supabase
        .from('albums')
        .select(`
          id, title, artist, year, genre, image_url, spotify_url,
          songs (id, name, track_number),
          song_ratings (profile_id, song_id, rating)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const structuralPayload = (data || []).map(item => ({
        ...item,
        songs: item.songs ? [...item.songs].sort((a, b) => a.track_number - b.track_number) : []
      }));

      setAlbums(structuralPayload);
    } catch (err) {
      console.error("Initialization failure during catalog load:", err);
    }
  }

  // --- CALCULATION MATRIX ENGINES ---
  const fetchLocalRating = (album, trackId) => {
    if (!activeProfile || !album?.song_ratings) return 0;
    const match = album.song_ratings.find(row => row.song_id === trackId && row.profile_id === activeProfile.id);
    return match ? match.rating : 0;
  };

  const processAlbumScoreAverage = (album) => {
    if (!album || !album.songs || album.songs.length === 0 || !album.song_ratings || !activeProfile) return "0.0";
    const segmentRatings = album.song_ratings.filter(row => row.profile_id === activeProfile.id && row.rating > 0);
    if (segmentRatings.length === 0) return "0.0";
    return (segmentRatings.reduce((sum, row) => sum + row.rating, 0) / segmentRatings.length).toFixed(1);
  };

  const fetchRatedCount = (album) => {
    if (!album || !album.song_ratings || !activeProfile) return 0;
    return album.song_ratings.filter(row => row.profile_id === activeProfile.id && row.rating > 0).length;
  };

  // --- ACTIONS: PROFILES ---
  async function executeProfileDeployment() {
    if (!newProfileName.trim()) return alert("A name value must be provided.");
    if (newProfilePin.length > 0 && newProfilePin.length !== 4) return alert("PIN criteria requires 4 full numerical digits.");

    try {
      const { error } = await supabase
        .from('profiles')
        .insert([{ name: newProfileName.trim(), pin: newProfilePin || null }]);

      if (error) throw error;
      
      setNewProfileName('');
      setNewProfilePin('');
      setShowProfileModal(false);
      await reloadProfiles();
    } catch (err) {
      alert(`Operation Rejected: ${err.message}`);
    }
  }

  async function purgeWorkspaceAccount(e, targetProfile) {
    e.stopPropagation();
    if (!isAdmin) return;
    if (targetProfile.name.toLowerCase() === 'mukund') return alert("System Core Identity protected against deletions.");

    if (window.confirm(`Confirm data liquidation sequence for "${targetProfile.name}"?`)) {
      await supabase.from('profiles').delete().eq('id', targetProfile.id);
      await reloadProfiles();
      await reloadLibrary();
    }
  }

  function toggleTargetSpace(selectedProfile) {
    setActiveProfile(selectedProfile);
    setIsProfileUnlocked(!selectedProfile.pin);
    setPinInput('');
  }

  function evaluatePasscodeMatrix() {
    if (!activeProfile) return;
    if (pinInput === activeProfile.pin) {
      setIsProfileUnlocked(true);
      setPinPromptOpen(false);
      setPinInput('');
    } else {
      alert("Verification Code Mis-match.");
    }
  }

  // --- ACTIONS: REVIEW SCORING ---
  async function registerTrackRating(trackId, scoreValue) {
    if (activeProfile?.name?.toLowerCase() === 'mukund' && !isAdmin) {
      alert("Elevate privileges to Admin mode to adjust core metrics.");
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

    const currentSpaceToken = activeProfile?.id;
    if (!currentSpaceToken) return;

    try {
      if (scoreValue === 0) {
        await supabase.from('song_ratings').delete().eq('profile_id', currentSpaceToken).eq('song_id', trackId);
      } else {
        await supabase.from('song_ratings').upsert({
          profile_id: currentSpaceToken,
          song_id: trackId,
          rating: scoreValue
        }, { onConflict: 'profile_id,song_id' });
      }
      await reloadLibrary();
    } catch (err) {
      console.error(err);
    }
  }

  // --- ACTIONS: METADATA CRUD ---
  async function executeSpotifySync() {
    if (!spotifyUrl.trim()) return alert("Field demands a functional string address link.");
    setIsFetchingSpotify(true);
    try {
      const queryPayload = await fetch('/.netlify/functions/get-spotify-album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumUrl: spotifyUrl })
      });
      const data = await queryPayload.json();
      if (!queryPayload.ok) throw new Error(data.error || 'Parsing exception returned by edge server.');

      setFormData({
        title: data.title || '',
        artist: data.artist || '',
        year: data.year || '',
        genre: 'Pop',
        image_url: data.imageUrl || '',
        spotify_url: spotifyUrl,
        tracks: data.tracks && data.tracks.length > 0 ? data.tracks.join('\n') : ''
      });
      setSpotifyUrl('');
    } catch (err) {
      alert(`Sync Error: ${err.message}`);
    } finally {
      setIsFetchingSpotify(false);
    }
  }

  async function persistCatalogItem() {
    if (!formData.title || !formData.artist) return alert("Required parameters must be present.");

    try {
      if (editingAlbumId) {
        await supabase.from('albums').update({
          title: formData.title, artist: formData.artist,
          year: parseInt(formData.year) || null, genre: formData.genre,
          image_url: formData.image_url, spotify_url: formData.spotify_url
        }).eq('id', editingAlbumId);
      } else {
        const { data: generatedAlbum, error: albumPostError } = await supabase
          .from('albums')
          .insert([{ title: formData.title, artist: formData.artist, year: parseInt(formData.year) || null, genre: formData.genre, image_url: formData.image_url, spotify_url: formData.spotify_url }])
          .select().single();
        
        if (albumPostError) throw albumPostError;

        if (formData.tracks.trim()) {
          const separateLines = formData.tracks.split('\n').filter(t => t.trim());
          const relationalTracksArray = separateLines.map((nameString, indexPosition) => ({
            album_id: generatedAlbum.id,
            name: nameString.trim(),
            track_number: indexPosition + 1
          }));

          const { error: tracksPostError } = await supabase.from('songs').insert(relationalTracksArray);
          if (tracksPostError) throw tracksPostError;
        }
      }
      dismissInputModal();
      await reloadLibrary();
    } catch (err) {
      alert(`Storage Rejection Exception: ${err.message}`);
    }
  }

  function launchUpdateWorkspace(e, targetAlbum) {
    e.stopPropagation();
    if (!isAdmin) return;
    setEditingAlbumId(targetAlbum.id);
    setFormData({
      title: targetAlbum.title, artist: targetAlbum.artist, year: targetAlbum.year || '', genre: targetAlbum.genre || 'Pop',
      image_url: targetAlbum.image_url || '', spotify_url: targetAlbum.spotify_url || '', tracks: ''
    });
    setShowModal(true);
  }

  async function deleteGlobalReleaseItem(e, id) {
    e.stopPropagation();
    if (!isAdmin) return;
    if (window.confirm("Perform irreversible deletion of asset data row?")) {
      await supabase.from('albums').delete().eq('id', id);
      await reloadLibrary();
    }
  }

  function dismissInputModal() {
    setShowModal(false);
    setEditingAlbumId(null);
    setFormData({ title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', spotify_url: '' });
  }

  // --- AUTH MANAGEMENT ---
  function checkSystemPassword(e) {
    const stringInput = e.target.value;
    setPasswordInput(stringInput);
    if (stringInput === 'vibecode') setIsAdmin(true);
  }

  // --- QUERY DESTRUCTURING ---
  const dynamicQueryFilter = albums.filter(row => {
    const clearQuery = searchQuery.toLowerCase();
    return row.title?.toLowerCase().includes(clearQuery) || row.artist?.toLowerCase().includes(clearQuery);
  });

  const orderedPerformanceCollection = [...albums].sort((first, second) => parseFloat(processAlbumScoreAverage(second)) - parseFloat(processAlbumScoreAverage(first)));

  const parsedIndividualTracks = albums.flatMap(parentItem => 
    (parentItem.songs || []).map(childTrack => ({ ...childTrack, rating: fetchLocalRating(parentItem, childTrack.id), albumTitle: parentItem.title, artist: parentItem.artist, year: parentItem.year }))
  ).sort((first, second) => second.rating - first.rating);

  const determineRankBadgeColorStyle = (indexPosition) => {
    if (indexPosition === 0) return 'text-amber-500 font-black';
    if (indexPosition === 1) return 'text-zinc-300 font-extrabold';
    if (indexPosition === 2) return 'text-amber-700 font-bold';
    return 'text-zinc-500 font-medium';
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 p-4 font-sans flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full flex-1">
        
        {/* VIEW SEGMENT: PROFILE INTERFACE ROUTING BUTTONS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 border-b border-zinc-900/60 no-scrollbar">
          <div className="flex items-center text-zinc-600 px-1 shrink-0"><User size={14} /></div>
          {profiles.map(rowItem => {
            const currentSelectedBoolean = activeProfile?.id === rowItem.id;
            return (
              <div 
                key={rowItem.id} 
                onClick={() => toggleTargetSpace(rowItem)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition shrink-0 flex items-center gap-2 cursor-pointer ${
                  currentSelectedBoolean 
                    ? 'bg-zinc-900 border-zinc-700 text-white shadow-inner' 
                    : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span>{rowItem.name}</span>
                {currentSelectedBoolean && (rowItem.pin || rowItem.name.toLowerCase() === 'mukund') && (
                  isProfileUnlocked || isAdmin ? <Unlock size={10} className="text-emerald-500" /> : <Lock size={10} className="text-zinc-600" />
                )}
                {isAdmin && rowItem.name.toLowerCase() !== 'mukund' && (
                  <button 
                    onClick={(e) => purgeWorkspaceAccount(e, rowItem)}
                    className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
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
          >
            <UserPlus size={13} />
          </button>
        </div>

        {/* VIEW SEGMENT: CENTRAL CONTROL NAVIGATION BAR */}
        <div className="flex justify-between items-center mb-6 border-b border-zinc-800/60 pb-4">
          <div className="flex items-center gap-3">
            {(isAdmin || isProfileUnlocked) && (
              <button 
                onClick={() => setShowModal(true)} 
                className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition shadow-sm"
              >
                <Plus size={16} />
              </button>
            )}
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-zinc-900 text-zinc-500 border border-zinc-800/40">
              {isAdmin ? "Admin Mode" : isProfileUnlocked ? `${activeProfile?.name} Workspace Active` : "Viewer Mode"}
            </span>
            {activeProfile?.pin && !isProfileUnlocked && !isAdmin && (
              <button 
                onClick={() => setPinPromptOpen(true)}
                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-zinc-900 border border-amber-900/40 text-amber-500 hover:bg-amber-950/20 transition flex items-center gap-1"
              >
                <Lock size={10} /> Unlock Workspace
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${view === 'all' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>Library</button>
            <button onClick={() => setView('rankings')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${view === 'rankings' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>Rankings</button>
          </div>
        </div>

        {/* COMPONENT INTERFACE PANEL: COLLECTION SECTIONS */}
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

            {dynamicQueryFilter.length > 0 ? (
              dynamicQueryFilter.map(itemRow => {
                const structuralExpansionFlag = !!expandedAlbums[itemRow.id];
                const dynamicScoreResult = processAlbumScoreAverage(itemRow);

                return (
                  <div key={itemRow.id} className="bg-[#18181b]/50 rounded-xl border border-zinc-900 shadow-xl overflow-hidden">
                    <div 
                      onClick={() => setExpandedAlbums(prev => ({ ...prev, [itemRow.id]: !prev[itemRow.id] }))}
                      className="p-4 bg-[#27272a]/20 flex justify-between items-center gap-4 cursor-pointer hover:bg-[#27272a]/40 transition"
                    >
                      <div className="min-w-0 flex-1 flex gap-4 items-center">
                        {itemRow.image_url && (
                          <img src={itemRow.image_url} alt={itemRow.title} className="w-12 h-12 rounded-lg object-cover bg-zinc-900 border border-zinc-800/80 shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap h-5">
                            {itemRow.spotify_url ? (
                              <a href={itemRow.spotify_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-base font-bold text-zinc-100 hover:text-emerald-400 hover:underline transition leading-none">
                                {itemRow.title}
                              </a>
                            ) : (
                              <h2 className="text-base font-bold text-zinc-100 leading-none">{itemRow.title}</h2>
                            )}
                            {itemRow.genre && <span className="px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 text-[9px] uppercase font-bold tracking-wider inline-flex items-center justify-center h-4 self-center">{itemRow.genre}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-zinc-500">
                            <span>{itemRow.artist}</span>
                            {itemRow.year && <span>• {itemRow.year}</span>}
                            <span>• {fetchDeletedTrackRateCount(itemRow)}/{itemRow.songs?.length || 0} rated</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-black text-zinc-200 leading-none">{dynamicScoreResult}/10</div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button onClick={(e) => launchUpdateWorkspace(e, itemRow)} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white"><Pencil size={12} /></button>
                            <button onClick={(e) => deleteGlobalReleaseItem(e, itemRow.id)} className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>

                    {structuralExpansionFlag && (
                      <div className="divide-y divide-zinc-900/40 px-2 pb-2 border-t border-zinc-900/60 bg-zinc-950/20">
                        {itemRow.songs && itemRow.songs.length > 0 ? (
                          itemRow.songs.map((song, idx) => {
                            const trackRating = fetchLocalRating(itemRow, song.id);
                            return (
                              <div key={song.id} className="flex justify-between items-center text-xs group py-2 px-2 hover:bg-zinc-900/30 transition rounded-lg">
                                <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                                  <span className="text-zinc-600 font-mono text-[10px] w-4 shrink-0 text-right">{idx + 1}</span>
                                  <span className="text-zinc-300 truncate font-medium">{song.name}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="flex gap-0.5">
                                    {[...Array(10)].map((_, indexPosition) => (
                                      <Star 
                                        key={indexPosition} size={12} 
                                        onClick={() => registerTrackRating(song.id, trackRating === indexPosition + 1 ? 0 : indexPosition + 1)}
                                        className={`transition-all cursor-pointer ${
                                          trackRating > indexPosition 
                                            ? 'fill-yellow-500 text-yellow-500 drop-shadow-[0_0_2px_rgba(234,179,8,0.3)]' 
                                            : 'text-zinc-800 hover:text-zinc-500'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                  <span className="font-bold text-zinc-500 w-4 text-right text-[11px] font-mono">{trackRating || '-'}</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-4 text-zinc-700 text-xs font-mono">No track entries defined inside data structures.</div>
                        )}
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

        {/* COMPONENT INTERFACE PANEL: RANK METRIC LEADERBOARDS */}
        {view === 'rankings' && (
          <div>
            <div className="flex gap-4 mb-6">
              <button onClick={() => setRankSubTab('albums')} className={`text-xs font-bold tracking-wider transition ${rankSubTab === 'albums' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-500 hover:text-zinc-300'}`}>ALBUMS</button>
              <button onClick={() => setRankSubTab('songs')} className={`text-xs font-bold tracking-wider transition ${rankSubTab === 'songs' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-500 hover:text-zinc-300'}`}>SONGS</button>
            </div>
            
            <div className="space-y-3">
              {rankSubTab === 'albums' ? (
                orderedPerformanceCollection.map((rowItem, indexPosition) => {
                  const ratingSummaryValue = parseFloat(processAlbumScoreAverage(rowItem));
                  const calculationWidthPercent = Math.min((ratingSummaryValue / 10) * 100, 100);

                  return (
                    <div key={rowItem.id} className="relative bg-[#18181b]/40 p-4 rounded-xl border border-zinc-900 shadow-md flex items-center justify-between overflow-hidden group hover:border-zinc-800/60 transition">
                      <div className="flex items-center gap-4 min-w-0 z-10">
                        <span className={`text-base font-bold italic w-6 shrink-0 ${determineRankBadgeColorStyle(indexPosition)}`}>#{indexPosition + 1}</span>
                        {rowItem.image_url && <img src={rowItem.image_url} alt={rowItem.title} className="w-10 h-10 rounded-md object-cover bg-zinc-900 border border-zinc-800 shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />}
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-zinc-100 block truncate">{rowItem.title}</span>
                          <div className="text-xs text-zinc-500 mt-0.5 font-medium">{rowItem.artist} {rowItem.year ? `• {itemRow.year}` : ''}</div>
                        </div>
                      </div>
                      <div className="text-xl font-bold text-zinc-200 shrink-0 pl-4 z-10">{ratingSummaryValue.toFixed(1)}</div>
                      <div className="absolute bottom-0 left-12 h-[2px] bg-amber-500/40 rounded-full transition-all duration-500 group-hover:bg-amber-500/70" style={{ width: `calc(${calculationWidthPercent}% - 3rem)` }} />
                    </div>
                  );
                })
              ) : (
                parsedIndividualTracks.map((songRow, indexPosition) => {
                  const linePercentageValue = Math.min((songRow.rating / 10) * 100, 100);
                  return (
                    <div key={songRow.id} className="relative bg-[#18181b]/40 p-4 rounded-xl border border-zinc-900 shadow-md flex items-center justify-between overflow-hidden group hover:border-zinc-800/60 transition">
                      <div className="flex items-center gap-4 min-w-0 z-10">
                        <span className={`text-sm font-bold w-6 shrink-0 ${determineRankBadgeColorStyle(indexPosition)}`}>#{indexPosition + 1}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-zinc-100 block truncate">{songRow.name}</span>
                          <div className="text-xs text-zinc-500 mt-0.5 font-medium">{songRow.albumTitle} • {songRow.artist}</div>
                        </div>
                      </div>
                      <div className="text-xl font-bold text-zinc-200 shrink-0 pl-4 z-10">{songRow.rating ? `${songRow.rating}.0` : '0.0'}</div>
                      <div className="absolute bottom-0 left-12 h-[2px] bg-amber-500/40 rounded-full transition-all duration-500 group-hover:bg-amber-500/70" style={{ width: `calc(${linePercentageValue}% - 3rem)` }} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* SYSTEM WORKSPACE FOOTER SEGMENT */}
      <div className="max-w-4xl mx-auto w-full border-t border-zinc-900/80 mt-12 pt-6 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="text-zinc-600 font-medium tracking-wide">Built with ⚡ by <span className="text-zinc-400 font-bold cursor-default">Mukund</span></div>
        <div>
          {isAdmin ? (
            <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 px-3 py-1.5 rounded-xl">
              <Unlock size={12} className="text-emerald-500 animate-pulse" />
              <span className="text-zinc-400 font-medium">Logged in as Editor</span>
              <button onClick={() => { setIsAdmin(false); setPasswordInput(''); }} className="text-[10px] text-zinc-400 font-bold bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-lg hover:text-white">LOCK</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-900/20 px-3 py-1 rounded-xl group hover:bg-zinc-900/50 border border-transparent hover:border-zinc-800/40">
              <Lock size={11} className="text-zinc-600" />
              <input type="password" placeholder="Admin unlock" value={passwordInput} onChange={checkSystemPassword} className="bg-transparent outline-none w-24 text-zinc-600 focus:text-zinc-300 placeholder-zinc-700 text-center text-xs transition-colors" />
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY DIALOG MATRIX: SECURITY VERIFICATION ACCESS */}
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
              <button onClick={evaluatePasscodeMatrix} className="flex-1 bg-white text-black font-black py-2 rounded-xl text-xs">UNLOCK</button>
              <button onClick={() => { setPinPromptOpen(false); setPinInput(''); }} className="px-3 text-zinc-500 hover:text-zinc-300 text-xs font-bold">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DIALOG MATRIX: PROFILE TARGET SPACES */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setShowProfileModal(false)}>
          <div className="bg-[#18181b] w-full max-w-sm p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 text-zinc-100 flex items-center gap-2"><UserPlus size={16} /> Create Ranking Profile</h2>
            <p className="text-zinc-500 text-xs mb-4">Add a separate dashboard workspace to track individual reviews.</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-1 block">Your Name</label>
                <input placeholder="e.g. Bob" className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none focus:border-zinc-600" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-1 block">4-Digit Access PIN (Optional)</label>
                <input placeholder="Leave blank for no security code" maxLength={4} className="w-full bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl text-xs text-white outline-none focus:border-zinc-600" value={newProfilePin} onChange={e => setNewProfilePin(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={executeProfileDeployment} className="flex-1 bg-white text-black font-black py-2.5 rounded-xl text-xs">CREATE DASHBOARD</button>
              <button onClick={() => setShowProfileModal(false)} className="px-3 text-zinc-500 text-xs font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DIALOG MATRIX: ASSET EDITING INTERFACE PANEL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={dismissInputModal}>
          <div className="bg-[#18181b] w-full max-w-lg p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-zinc-100">{editingAlbumId ? 'Edit Global Album' : 'Add New Album'}</h2>
            {!editingAlbumId && (
              <div className="mb-4 flex gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800/60 focus-within:border-zinc-700 transition">
                <div className="flex items-center pl-1 text-zinc-500"><Link2 size={14} /></div>
                <input placeholder="Paste Spotify Album Link..." className="bg-transparent flex-1 text-xs outline-none text-white placeholder-zinc-600" value={spotifyUrl} onChange={e => setSpotifyUrl(e.target.value)} disabled={isFetchingSpotify} />
                <button onClick={executeSpotifySync} disabled={isFetchingSpotify || !spotifyUrl.trim()} className="bg-zinc-900 border border-zinc-700 text-[10px] font-bold text-zinc-300 hover:text-white px-3 py-1 rounded-lg transition">{isFetchingSpotify ? <Loader2 size={10} className="animate-spin" /> : 'AUTOFILL'}</button>
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
              <button onClick={persistCatalogItem} className="flex-1 bg-white text-black font-black py-3 rounded-xl text-sm transition-all hover:bg-zinc-200">SAVE ALBUM</button>
              <button onClick={dismissInputModal} className="px-4 text-zinc-500 text-sm font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Extraneous utility function declaration to prevent render execution halts 
function fetchDeletedTrackRateCount(albumInstance) {
  if (!albumInstance || !albumInstance.song_ratings) return 0;
  return albumInstance.song_ratings.filter(r => r.rating > 0).length;
}