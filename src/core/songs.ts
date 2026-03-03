import { localApi as api } from "../api/localApi";

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

  constructor() {
  }

  public async initialize(): Promise<void> {
    await this.loadFromStorage();
    await this.migrateLegacyPoem();
  }

  private async loadFromStorage() {
    try {
      const savedSongs = await api.getSongs();
      this.songs.clear();
      savedSongs.forEach((song) => this.songs.set(song.id, song));

      const savedCurrentId = await api.getCurrentSongId();
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

  private async migrateLegacyPoem() {
    // If no songs exist, check for legacy dd-poem and migrate it
    if (this.songs.size === 0) {
      const legacyPoem = localStorage.getItem("dd-poem");

      const initialSong = await this.createSong();
      if (legacyPoem) {
         initialSong.content = legacyPoem;
      }
      await this.updateSong(initialSong);
      await this.setCurrentSongId(initialSong.id);
    }
  }

  public async createSong(): Promise<Song> {
    const newSong: Song = {
      id: crypto.randomUUID(),
      title: "Untitled Song",
      content: "",
      status: "Freewrite",
      updatedAt: Date.now(),
    };
    await api.createSong(newSong);
    this.songs.set(newSong.id, newSong);
    await this.setCurrentSongId(newSong.id);
    return newSong;
  }

  public async updateSong(song: Song) {
    song.updatedAt = Date.now();
    await api.updateSong(song);
    this.songs.set(song.id, song);
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

  public async duplicateCurrentSong(): Promise<Song | undefined> {
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

    await api.createSong(newSong);
    this.songs.set(newSong.id, newSong);
    await this.setCurrentSongId(newSong.id);
    return newSong;
  }

  public async setCurrentSongId(id: string) {
    if (this.songs.has(id)) {
      this.currentSongId = id;
      await api.setCurrentSongId(id);
    }
  }

  public async deleteSong(id: string): Promise<boolean> {
    if (this.songs.has(id)) {
      await api.deleteSong(id);
      this.songs.delete(id);
      if (this.currentSongId === id) {
        this.currentSongId = null;

        // Select next available song if any, else create a new one automatically
        const allSongs = this.getAllSongs();
        if (allSongs.length > 0) {
            this.currentSongId = allSongs[0].id;
        } else {
            await this.createSong(); // This sets it as current
        }
      }
      return true;
    }
    return false;
  }
}
