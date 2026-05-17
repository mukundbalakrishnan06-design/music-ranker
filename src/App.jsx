import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Star, Plus, Pencil, Trash2, Lock, Unlock, Link2, Loader2 } from 'lucide-react';

const SUPABASE_URL = 'https://yrecadlcgucgugvhapoi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-8O4aLdjhEYTnnnaspj8Tw_5TFaF9Xn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [view, setView] = useState('all'); 
  const [rankSubTab, setRankSubTab] = useState('albums'); 
  const [albums, setAlbums] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState(null);
  const [expandedAlbums, setExpandedAlbums] = useState({}); 
  
  // Spotify Integration States
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);

  const [formData, setFormData] = useState({ 
    title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', songs: [] 
  });

  // Admin Protection States
  const [passwordInput, setPasswordInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { fetchAlbums(); }, []);

  async function fetchAlbums() {
    try {
      const { data, error } = await supabase
        .from('albums')
        .select(`id, title, artist, year, genre, image_url, songs (id, name, rating, track_number)`)
        .order('created_at', { ascending: false })
        .order('track_number', { foreignTable: 'songs', ascending: true });
      if (error) throw error;
      setAlbums(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
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
    if (val === 'vibecode') {
      setIsAdmin(true);
    }
  }

  function handleSignOut() {
    setIsAdmin(false);
    setPasswordInput('');
  }

  function toggleExpand(albumId) {
    setExpandedAlbums(prev => ({ ...prev, [albumId]: !prev[albumId] }));
  }

  function handleNavigateToAlbum(albumId) {
    setExpandedAlbums(prev => ({ ...prev, [albumId]: true }));
    setView('all');
  }

  function startEditing(e, album) {
    e.stopPropagation(); 
    if (!isAdmin) return;
    setEditingAlbumId(album.id);
    setFormData({
      title: album.title,
      artist: album.artist,
      year: album.year || '',
      genre: album.genre || 'Pop',
      image_url: album.image_url || '',
      tracks: '',
      songs: album.songs ? [...album.songs].sort((a, b) => a.track_number - b.track_number) : [] 
    });
    setShowModal(true);
  }

  async function deleteAlbum(e, id) {
    e.stopPropagation(); 
    if (!isAdmin) return;
    if (window.confirm("Delete this album?")) {
      await supabase.from('albums').delete().eq('id', id);
      fetchAlbums();
    }
  }

  async function handleSaveAlbum() {
    if (!isAdmin) return;
    if (!formData.title || !formData.artist) return alert("Title and Artist required!");
    try {
      if (editingAlbumId) {
        await supabase.from('albums').update({
          title: formData.title, artist: formData.artist,
          year: parseInt(formData.year) || null, genre: formData.genre,
          image_url: formData.image_url
        }).eq('id', editingAlbumId);

        const { data: currentDbSongs } = await supabase.from('songs').select('id').eq('album_id', editingAlbumId);
        const currentIds = currentDbSongs.map(s => s.id);
        const remainingIds = formData.songs.map(s => s.id).filter(id => id);
        const idsToDelete = currentIds.filter(id => !remainingIds.includes(id));
        
        if (idsToDelete.length > 0) await supabase.from('songs').delete().in('id', idsToDelete);
        
        for (let i = 0; i < formData.songs.length; i++) {
          const song = formData.songs[i];
          if (song.id) {
            await supabase.from('songs').update({ name: song.name, track_number: i + 1 }).eq('id', song.id);
          }
        }
      } else {
        const { data: album, error: albumError } = await supabase
          .from('albums')
          .insert([{ title: formData.title, artist: formData.artist, year: parseInt(formData.year) || null, genre: formData.genre, image_url: formData.image_url }])
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

          const { error: insertError } = await supabase.from('songs').insert(songsToInsert);
          if (insertError) throw insertError;
        }
      }
      closeModal();
      fetchAlbums();
    } catch (error) { alert(error.message); }
  }

  function closeModal() {
    setShowModal(false);
    setEditingAlbumId(null);
    setSpotifyUrl('');
    setFormData({ title: '', artist: '', year: '', genre: 'Pop', tracks: '', image_url: '', songs: [] });
  }

  async function updateRating(songId, rating) {
    if (!isAdmin) return; 
    await supabase.from('songs').update({ rating }).eq('id', songId);
    fetchAlbums();
  }

  const calcAvg = (songs) => {
    if (!songs || songs.length === 0) return 0;
    return (songs.reduce((acc, s) => acc + s.rating, 0) / songs.length).toFixed(1);
  };

  const getRankColor = (index) => {
    if (index === 0) return 'text-yellow-600 font-black'; 
    if (index === 1) return 'text-zinc-400 font-extrabold'; 
    if (index === 2) return 'text-amber-700 font-bold'; 
    return 'text-zinc-600 font-medium'; 
  };

  const rankedAlbums = [...albums].sort((a, b) => calcAvg(b.songs) - calcAvg(a.songs));
  
  const allSongs = albums.flatMap(a => 
    (a.songs || []).map(s => ({ ...s, albumTitle: a.title, artist: a.artist, year: a.year }))
  ).sort((a, b) => b.rating - a.rating);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#e4e4e4] p-4 font-sans selection:bg-zinc-800 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full flex-1">
        
        {/* Header Area */}
        <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button 
                onClick={() => setShowModal(true)} 
                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                title="Add Album"
              >
                <Plus size={16} />
              </button>
            )}
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800/60">
              {isAdmin ? "Admin Mode" : "Viewer Mode"}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${view === 'all' ? 'bg-white text-black' : 'text-zinc-500'}`}>Library</button>
            <button onClick={() => setView('rankings')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${view === 'rankings' ? 'bg-white text-black' : 'text-zinc-500'}`}>Rankings</button>
          </div>
        </div>

        {/* View 1: LIBRARY VIEW */}
        {view === 'all' && (
          <div className="space-y-4">
            {albums.map(album => {
              const ratedCount = album.songs?.filter(s => s.rating > 0).length || 0;
              const totalCount = album.songs?.length || 0;
              const isExpanded = !!expandedAlbums[album.id];

              return (
                <div key={album.id} className="bg-[#141414] rounded-xl border border-zinc-900 shadow-xl overflow-hidden">
                  
                  <div 
                    onClick={() => toggleExpand(album.id)}
                    className="p-4 bg-[#1a1a1a]/40 flex justify-between items-center gap-4 cursor-pointer hover:bg-[#1a1a1a]/60 transition"
                  >
                    <div className="min-w-0 flex-1 flex gap-4 items-center">
                      {album.image_url && (
                        <img 
                          src={album.image_url} 
                          alt={album.title} 
                          className="w-12 h-12 rounded-lg object-cover bg-zinc-900 border border-zinc-800 shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-zinc-100 leading-none">{album.title}</h2>
                          {album.genre && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 text-[9px] uppercase font-bold tracking-wider inline-flex items-center justify-center h-4 self-center">
                              {album.genre}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-zinc-500">
                          <span>{album.artist}</span>
                          {album.year && <span>• {album.year}</span>}
                          <span>• {ratedCount}/{totalCount} rated</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-black text-zinc-200 leading-none">{calcAvg(album.songs)}/10</div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={(e) => startEditing(e, album)} className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white transition">
                            <Pencil size={12} />
                          </button>
                          <button onClick={(e) => deleteAlbum(e, album.id)} className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 transition">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="divide-y divide-zinc-900/30 px-2 pb-2 border-t border-zinc-900/40 bg-zinc-950/10">
                      {(album.songs || []).map((song, i) => (
                        <div key={song.id} className="flex justify-between items-center text-xs group py-2 px-2 hover:bg-zinc-900/20 transition rounded-lg">
                          <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                            <span className="text-zinc-600 font-mono text-[10px] w-4 shrink-0 text-right">{i + 1}</span>
                            <span className="text-zinc-300 truncate font-medium">{song.name}</span>
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex gap-0.5">
                              {[...Array(10)].map((_, starIdx) => (
                                <Star 
                                  key={starIdx} 
                                  size={12} 
                                  onClick={() => updateRating(song.id, starIdx + 1)}
                                  className={`transition-all ${!isAdmin ? 'cursor-default' : 'cursor-pointer'} ${
                                    song.rating > starIdx 
                                      ? 'fill-yellow-500 text-yellow-500 drop-shadow-[0_0_2px_rgba(234,179,8,0.3)]' 
                                      : song.rating === 0 && !isAdmin 
                                        ? 'text-zinc-900/40' 
                                        : 'text-zinc-800 hover:text-zinc-500'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="font-bold text-zinc-500 w-4 text-right text-[11px] font-mono">{song.rating || '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* View 2: RANKINGS */}
        {view === 'rankings' && (
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-4 mb-6">
              <button onClick={() => setRankSubTab('albums')} className={`text-xs font-bold tracking-wider ${rankSubTab === 'albums' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-600'}`}>ALBUMS</button>
              <button onClick={() => setRankSubTab('songs')} className={`text-xs font-bold tracking-wider ${rankSubTab === 'songs' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-600'}`}>SONGS</button>
            </div>
            <div className="space-y-3">
              {rankSubTab === 'albums' ? rankedAlbums.map((album, i) => {
                const score = parseFloat(calcAvg(album.songs));
                const percentage = Math.min((score / 10) * 100, 100);

                return (
                  <div key={album.id} className="relative bg-[#1a1a1a]/60 p-4 rounded-xl border border-zinc-800/80 shadow-md flex items-center justify-between overflow-hidden">
                    <div className="flex items-center gap-4 min-w-0 z-10">
                      <span className={`text-base font-bold italic w-6 shrink-0 ${getRankColor(i)}`}>
                        #{i + 1}
                      </span>
                      {album.image_url && (
                        <img 
                          src={album.image_url} 
                          alt={album.title} 
                          className="w-10 h-10 rounded-md object-cover bg-zinc-900 shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span 
                            onClick={() => handleNavigateToAlbum(album.id)}
                            className="text-sm font-bold text-zinc-100 cursor-pointer hover:text-white hover:underline transition-all"
                          >
                            {album.title}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 font-medium">
                          {album.artist} {album.year ? `• ${album.year}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-zinc-100 shrink-0 pl-4 z-10">{score.toFixed(1)}</div>
                    
                    <div 
                      className="absolute bottom-0 left-12 h-[3px] bg-amber-600/70 rounded-full transition-all duration-500"
                      style={{ width: `calc(${percentage}% - 3rem)` }}
                    />
                  </div>
                );
              }) : allSongs.map((song, i) => {
                const percentage = Math.min((song.rating / 10) * 100, 100);

                return (
                  <div key={song.id} className="relative bg-[#1a1a1a]/60 p-4 rounded-xl border border-zinc-800/80 shadow-md flex items-center justify-between overflow-hidden">
                    <div className="flex items-center gap-4 min-w-0 z-10">
                      <span className={`text-sm font-bold w-6 shrink-0 ${getRankColor(i)}`}>
                        #{i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-bold text-zinc-100">{song.name}</span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 font-medium">
                          {song.albumTitle} • {song.artist} {song.year ? `• ${song.year}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-zinc-100 shrink-0 pl-4 z-10">
                      {song.rating ? `${song.rating}.0` : '0.0'}
                    </div>

                    <div 
                      className="absolute bottom-0 left-12 h-[3px] bg-amber-600/70 rounded-full transition-all duration-500"
                      style={{ width: `calc(${percentage}% - 3rem)` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* FOOTER & CREDIT COMPONENT */}
      <div className="max-w-4xl mx-auto w-full border-t border-zinc-900 mt-12 pt-6 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        
        {/* Left Side: Your Creator Credit */}
        <div className="text-zinc-600 font-medium tracking-wide text-center sm:text-left">
          Built with ⚡ by <span className="text-zinc-400 font-bold hover:text-amber-500 transition cursor-default">Mukund</span>
        </div>

        {/* Right Side: Admin Security Lock */}
        <div>
          {isAdmin ? (
            <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 px-3 py-1.5 rounded-xl">
              <Unlock size={12} className="text-emerald-500 animate-pulse" />
              <span className="text-zinc-400 font-medium">Logged in as Editor</span>
              <button 
                onClick={handleSignOut} 
                className="text-[10px] text-zinc-500 font-bold tracking-wider hover:text-white ml-2 bg-zinc-800 px-2 py-0.5 rounded transition"
              >
                LOCK
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-900/20 px-3 py-1 rounded-xl group hover:bg-zinc-900/50 transition border border-transparent hover:border-zinc-800/40">
              <Lock size={11} className="text-zinc-600 group-hover:text-zinc-400 transition" />
              <input 
                type="password" 
                placeholder="Admin unlock" 
                value={passwordInput}
                onChange={handlePasswordChange}
                className="bg-transparent outline-none w-20 text-zinc-600 focus:text-zinc-300 placeholder-zinc-700 focus:placeholder-zinc-500 font-medium transition text-center text-xs"
              />
            </div>
          )}
        </div>

      </div>

      {/* INPUT / EDIT MODAL WITH SPOTIFY HOOKS */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={closeModal}>
          <div className="bg-[#181818] w-full max-w-lg p-6 rounded-3xl border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">{editingAlbumId ? 'Edit Album' : 'Add Album'}</h2>
            
            {!editingAlbumId && (
              <div className="mb-4 flex gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800/60 focus-within:border-zinc-700 transition">
                <div className="flex items-center pl-1 text-zinc-500"><Link2 size={14} /></div>
                <input 
                  placeholder="Paste Spotify Album Link..." 
                  className="bg-transparent flex-1 text-xs outline-none text-white placeholder-zinc-600" 
                  value={spotifyUrl} 
                  onChange={e => setSpotifyUrl(e.target.value)} 
                  disabled={isFetchingSpotify}
                />
                <button 
                  onClick={handleFetchSpotifyData}
                  disabled={isFetchingSpotify || !spotifyUrl.trim()}
                  className="bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-zinc-300 px-3 py-1 rounded-lg hover:text-white disabled:opacity-40 transition flex items-center gap-1 shrink-0"
                >
                  {isFetchingSpotify ? <Loader2 size={10} className="animate-spin" /> : 'AUTOFILL'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="Album title" className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl outline-none focus:border-zinc-500 text-sm text-white" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              <input placeholder="Artist" className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl outline-none focus:border-zinc-500 text-sm text-white" value={formData.artist} onChange={e => setFormData({...formData, artist: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="Year" type="number" className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl outline-none focus:border-zinc-500 text-sm text-white" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} />
              <select className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl outline-none focus:border-zinc-500 text-zinc-400 text-sm" value={formData.genre} onChange={e => setFormData({...formData, genre: e.target.value})}>
                {['Pop', 'Hip Hop', 'Rock', 'R&B', 'Electronic', 'Country'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <input placeholder="Image Cover URL (Optional)" className="w-full bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl outline-none focus:border-zinc-500 text-xs text-zinc-400" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} />
            </div>

            {editingAlbumId ? (
              <div className="mb-6 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 block">Manage Songs</label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {formData.songs.map((song, index) => (
                    <div key={song.id || index} className="flex gap-2">
                      <input className="flex-1 bg-zinc-950 border border-zinc-800 p-2 rounded-lg text-xs outline-none focus:border-zinc-600 text-white" value={song.name} onChange={(e) => {
                        const newSongs = [...formData.songs];
                        newSongs[index].name = e.target.value;
                        setFormData({...formData, songs: newSongs});
                      }} />
                      <button onClick={() => setFormData({...formData, songs: formData.songs.filter((_, i) => i !== index)})} className="bg-red-900/10 text-red-500 w-8 rounded-lg hover:bg-red-500 hover:text-white transition-all text-xs text-center flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <textarea placeholder="Tracklist (one per line)" className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl h-32 outline-none focus:border-zinc-500 mb-4 resize-none text-sm text-white" value={formData.tracks} onChange={e => setFormData({...formData, tracks: e.target.value})} />
            )}
            <div className="flex gap-3">
              <button onClick={handleSaveAlbum} className="flex-1 bg-white text-black font-black py-3 rounded-xl hover:scale-[1.01] transition text-sm">
                {editingAlbumId ? 'SAVE CHANGES' : 'ADD TO LIST'}
              </button>
              <button onClick={closeModal} className="px-4 text-zinc-500 text-sm font-bold hover:text-zinc-300">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}