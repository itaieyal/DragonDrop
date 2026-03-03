import { Song } from "../core/songs";

export interface ApiClient {
  // Song CRUD
  getSongs(): Promise<Song[]>;
  getSong(id: string): Promise<Song | undefined>;
  createSong(song: Song): Promise<void>;
  updateSong(song: Song): Promise<void>;
  deleteSong(id: string): Promise<void>;

  // Settings
  getCurrentSongId(): Promise<string | null>;
  setCurrentSongId(id: string | null): Promise<void>;

  // Suggestions
  getWordSuggestion(): Promise<string | null>;
  getLineSuggestion(): Promise<string | null>;
  getVerseSuggestion(): Promise<string | null>;
}
