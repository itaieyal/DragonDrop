import { Song } from "../core/songs";
import { ApiClient } from "./types";

const STORAGE_KEY_SONGS = "dd-songs";
const STORAGE_KEY_CURRENT = "dd-current-song-id";

// Internal helper
function getStoredSongs(): Map<string, Song> {
  const songs = new Map<string, Song>();
  try {
    const savedSongs = localStorage.getItem(STORAGE_KEY_SONGS);
    if (savedSongs) {
      const parsed = JSON.parse(savedSongs) as Song[];
      parsed.forEach((song) => songs.set(song.id, song));
    }
  } catch (e) {
    console.error("Failed to load songs from local storage", e);
  }
  return songs;
}

function saveStoredSongs(songs: Map<string, Song>) {
  const songsArray = Array.from(songs.values());
  localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(songsArray));
}

export const localApi: ApiClient = {
  async getSongs(): Promise<Song[]> {
    const songs = getStoredSongs();
    return Array.from(songs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getSong(id: string): Promise<Song | undefined> {
    const songs = getStoredSongs();
    return songs.get(id);
  },

  async createSong(song: Song): Promise<void> {
    const songs = getStoredSongs();
    songs.set(song.id, song);
    saveStoredSongs(songs);
  },

  async updateSong(song: Song): Promise<void> {
    const songs = getStoredSongs();
    songs.set(song.id, song);
    saveStoredSongs(songs);
  },

  async deleteSong(id: string): Promise<void> {
    const songs = getStoredSongs();
    if (songs.has(id)) {
      songs.delete(id);
      saveStoredSongs(songs);
    }
  },

  async getCurrentSongId(): Promise<string | null> {
    return localStorage.getItem(STORAGE_KEY_CURRENT);
  },

  async setCurrentSongId(id: string | null): Promise<void> {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY_CURRENT);
    } else {
      localStorage.setItem(STORAGE_KEY_CURRENT, id);
    }
  },

  // Mock suggestion implementations.
  // In a real server context, this would perform a database query or natural language processing.
  async getWordSuggestion(): Promise<string | null> {
    const songs = await this.getSongs();
    const freewriteSongs = songs.filter(s => s.status === "Freewrite");
    const words: string[] = [];
    freewriteSongs.forEach(song => {
      const w = song.content.split(/[\\s\\.,!?;:"'()[\\]{}<>]+/).map(w => w.trim()).filter(w => w.length > 0);
      words.push(...w);
    });
    if (words.length === 0) return null;
    return words[Math.floor(Math.random() * words.length)];
  },

  async getLineSuggestion(): Promise<string | null> {
    const songs = await this.getSongs();
    const freewriteSongs = songs.filter(s => s.status === "Freewrite");
    const lines: string[] = [];
    freewriteSongs.forEach(song => {
      const l = song.content.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
      lines.push(...l);
    });
    if (lines.length === 0) return null;
    return lines[Math.floor(Math.random() * lines.length)];
  },

  async getVerseSuggestion(): Promise<string | null> {
    const songs = await this.getSongs();
    const freewriteSongs = songs.filter(s => s.status === "Freewrite");
    const verses: string[] = [];
    freewriteSongs.forEach(song => {
      const v = song.content.split(/\\n\\s*\\n/).map(v => v.trim()).filter(v => v.length > 0);
      verses.push(...v);
    });
    if (verses.length === 0) return null;
    return verses[Math.floor(Math.random() * verses.length)];
  }
};
