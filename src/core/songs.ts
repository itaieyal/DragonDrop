export type SongStatus = "Freewrite" | "Arrangement" | "Lock";

export interface Song {
  id: string;
  title: string;
  content: string;
  status: SongStatus;
  updatedAt: number;
}

export class SongManager {
  private songs: Map<string, Song> = new Map();
  private currentSongId: string | null = null;
  private readonly STORAGE_KEY_SONGS = "dd-songs";
  private readonly STORAGE_KEY_CURRENT = "dd-current-song-id";

  constructor() {
    this.loadFromStorage();
    this.migrateLegacyPoem();
  }

  private loadFromStorage() {
    try {
      const savedSongs = localStorage.getItem(this.STORAGE_KEY_SONGS);
      if (savedSongs) {
        const parsed = JSON.parse(savedSongs) as Song[];
        this.songs.clear();
        parsed.forEach((song) => this.songs.set(song.id, song));
      }

      const savedCurrentId = localStorage.getItem(this.STORAGE_KEY_CURRENT);
      if (savedCurrentId && this.songs.has(savedCurrentId)) {
        this.currentSongId = savedCurrentId;
      } else if (this.songs.size > 0) {
        // Fallback to most recently updated if current ID is lost
        const sorted = Array.from(this.songs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        this.currentSongId = sorted[0].id;
      }
    } catch (e) {
      console.error("Failed to load songs from local storage", e);
    }
  }

  private migrateLegacyPoem() {
    // If no songs exist, check for legacy dd-poem and migrate it
    if (this.songs.size === 0) {
      const legacyPoem = localStorage.getItem("dd-poem");

      const initialSong = this.createSong();
      if (legacyPoem) {
         initialSong.content = legacyPoem;
      }
      this.updateSong(initialSong);
      this.setCurrentSongId(initialSong.id);
    }
  }

  private saveToStorage() {
    const songsArray = Array.from(this.songs.values());
    localStorage.setItem(this.STORAGE_KEY_SONGS, JSON.stringify(songsArray));
    if (this.currentSongId) {
      localStorage.setItem(this.STORAGE_KEY_CURRENT, this.currentSongId);
    }
  }

  public createSong(): Song {
    const newSong: Song = {
      id: crypto.randomUUID(),
      title: "Untitled Song",
      content: "",
      status: "Freewrite",
      updatedAt: Date.now(),
    };
    this.songs.set(newSong.id, newSong);
    this.saveToStorage();
    this.setCurrentSongId(newSong.id);
    return newSong;
  }

  public updateSong(song: Song) {
    song.updatedAt = Date.now();
    this.songs.set(song.id, song);
    this.saveToStorage();
  }

  public getSong(id: string): Song | undefined {
    return this.songs.get(id);
  }

  public getAllSongs(): Song[] {
    return Array.from(this.songs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getCurrentSong(): Song | undefined {
    if (this.currentSongId) {
      return this.songs.get(this.currentSongId);
    }
    return undefined;
  }

  public duplicateCurrentSong(): Song | undefined {
    const current = this.getCurrentSong();
    if (!current) return undefined;

    let newTitle = current.title;
    const match = newTitle.match(/(.*?) v(\d+)$/);
    if (match) {
        const baseTitle = match[1];
        const num = parseInt(match[2], 10) + 1;
        newTitle = `${baseTitle} v${num}`;
    } else {
        newTitle = `${newTitle} v1`;
    }

    const newSong: Song = {
      id: crypto.randomUUID(),
      title: newTitle,
      content: current.content,
      status: current.status,
      updatedAt: Date.now(),
    };

    this.songs.set(newSong.id, newSong);
    this.saveToStorage();
    this.setCurrentSongId(newSong.id);
    return newSong;
  }

  public setCurrentSongId(id: string) {
    if (this.songs.has(id)) {
      this.currentSongId = id;
      this.saveToStorage();
    }
  }

  public deleteSong(id: string): boolean {
    if (this.songs.has(id)) {
      this.songs.delete(id);
      if (this.currentSongId === id) {
        this.currentSongId = null;

        // Select next available song if any, else create a new one automatically
        const allSongs = this.getAllSongs();
        if (allSongs.length > 0) {
            this.currentSongId = allSongs[0].id;
        } else {
            this.createSong(); // This sets it as current
        }
      }
      this.saveToStorage();
      return true;
    }
    return false;
  }
}
