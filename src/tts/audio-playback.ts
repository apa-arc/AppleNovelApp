import {
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";

export interface OfflineAudioTrack {
  uri: string;
  bookTitle: string;
  chapterTitle: string;
  segmentIndex: number;
}

export interface OfflineAudioPlaybackState {
  playing: boolean;
  currentTime: number;
  duration: number;
  currentIndex: number;
  trackCount: number;
  chapterTitle: string;
  finished: boolean;
}

type PlaybackListener = (state: OfflineAudioPlaybackState) => void;
type AudioPlayerInstance = ReturnType<typeof createAudioPlayer>;

let sharedController: OfflineAudioPlaybackController | null = null;

/**
 * A single native player with a rolling queue of locally generated WAV files.
 * Audio continues in the background and publishes book/chapter metadata to
 * the iOS lock screen; the in-reader floating controls call the same methods.
 */
export class OfflineAudioPlaybackController {
  private player: AudioPlayerInstance;
  private tracks: OfflineAudioTrack[] = [];
  private currentIndex = -1;
  private playing = false;
  private currentTime = 0;
  private duration = 0;
  private listeners = new Set<PlaybackListener>();
  private destroyed = false;
  private waitingForTrack = false;
  private pausedByUser = false;
  private advancing = false;
  private completionHandledIndex = -1;
  private terminalWhilePaused = false;
  private queueComplete = false;
  private finished = false;

  constructor() {
    this.player = createAudioPlayer(null, {
      updateInterval: 250,
      keepAudioSessionActive: true,
    });
    this.player.addListener("playbackStatusUpdate", (status) => {
      this.currentTime = status.currentTime;
      this.duration = status.duration;
      this.playing = status.playing;
      this.emit();

      if (
        status.didJustFinish &&
        this.currentIndex >= 0 &&
        this.completionHandledIndex !== this.currentIndex
      ) {
        // A terminal callback can race with a user pause. Defer advancement
        // until resume rather than unexpectedly starting the next segment.
        this.completionHandledIndex = this.currentIndex;
        if (this.pausedByUser) {
          this.terminalWhilePaused = true;
          this.emit();
        } else if (!this.advancing) {
          void this.advance();
        }
      }
    });
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error("听书播放器已关闭。");
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  private updateLockScreenMetadata(): void {
    const track = this.tracks[this.currentIndex];
    if (!track) return;
    this.player.updateLockScreenMetadata({
      title: track.chapterTitle,
      artist: track.bookTitle,
      albumTitle: "AppleNovel 离线听书",
    });
  }

  private async playIndex(index: number): Promise<void> {
    this.assertAlive();
    const track = this.tracks[index];
    if (!track) return;
    this.currentIndex = index;
    this.completionHandledIndex = -1;
    this.terminalWhilePaused = false;
    this.waitingForTrack = false;
    this.pausedByUser = false;
    this.finished = false;
    this.currentTime = 0;
    this.duration = 0;
    this.player.replace(track.uri);
    this.updateLockScreenMetadata();
    this.player.play();
    this.playing = true;
    this.emit();
  }

  private async advance(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    try {
      const nextIndex = this.currentIndex + 1;
      if (nextIndex < this.tracks.length) {
        await this.playIndex(nextIndex);
      } else {
        this.playing = false;
        this.waitingForTrack = !this.queueComplete;
        this.finished = this.queueComplete;
        this.emit();
      }
    } finally {
      this.advancing = false;
    }
  }

  getState(): OfflineAudioPlaybackState {
    return {
      playing: this.playing,
      currentTime: this.currentTime,
      duration: this.duration,
      currentIndex: this.currentIndex,
      trackCount: this.tracks.length,
      chapterTitle: this.tracks[this.currentIndex]?.chapterTitle ?? "",
      finished: this.finished,
    };
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  async start(tracks: OfflineAudioTrack[], startIndex = 0): Promise<void> {
    this.assertAlive();
    if (tracks.length === 0) throw new Error("当前章节还没有生成可播放的语音。");
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    this.tracks = [...tracks];
    this.currentIndex = -1;
    this.completionHandledIndex = -1;
    this.terminalWhilePaused = false;
    this.waitingForTrack = false;
    this.queueComplete = false;
    this.finished = false;
    this.player.setActiveForLockScreen(
      true,
      {
        title: tracks[startIndex]?.chapterTitle ?? tracks[0].chapterTitle,
        artist: tracks[startIndex]?.bookTitle ?? tracks[0].bookTitle,
        albumTitle: "AppleNovel 离线听书",
      },
      {
        showSeekBackward: true,
        showSeekForward: true,
      },
    );
    await this.playIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  }

  append(tracks: OfflineAudioTrack[]): void {
    this.assertAlive();
    if (tracks.length === 0) return;
    this.tracks.push(...tracks);
    this.queueComplete = false;
    this.finished = false;
    if (this.currentIndex < 0) {
      void this.playIndex(0);
    } else if (this.waitingForTrack && !this.pausedByUser) {
      this.waitingForTrack = false;
      void this.advance();
    }
    this.emit();
  }

  /** Mark that no more tracks will be appended; completion waits for the last track to finish. */
  finishQueue(): void {
    this.assertAlive();
    if (this.tracks.length === 0) return;
    this.queueComplete = true;
    if (this.waitingForTrack && !this.pausedByUser) {
      this.waitingForTrack = false;
      this.playing = false;
      this.finished = true;
    }
    this.emit();
  }

  async pause(): Promise<void> {
    this.assertAlive();
    // Set the intent before calling native pause: the player may emit a
    // terminal status synchronously while the pause request is being handled.
    this.pausedByUser = true;
    this.player.pause();
    this.playing = false;
    this.emit();
  }

  async resume(): Promise<void> {
    this.assertAlive();
    this.pausedByUser = false;
    if (this.terminalWhilePaused) {
      this.terminalWhilePaused = false;
      await this.advance();
      return;
    }
    if (this.currentIndex < 0 && this.tracks.length > 0) {
      await this.playIndex(0);
      return;
    }
    if (this.waitingForTrack) {
      if (this.currentIndex + 1 < this.tracks.length) {
        this.waitingForTrack = false;
        await this.advance();
      } else if (this.queueComplete) {
        this.waitingForTrack = false;
        this.playing = false;
        this.finished = true;
        this.emit();
      } else {
        this.emit();
      }
      return;
    }
    this.player.play();
    this.playing = true;
    this.emit();
  }

  async next(): Promise<void> {
    this.assertAlive();
    if (this.currentIndex + 1 < this.tracks.length) {
      await this.playIndex(this.currentIndex + 1);
    }
  }

  async previous(): Promise<void> {
    this.assertAlive();
    if (this.currentIndex > 0) {
      await this.playIndex(this.currentIndex - 1);
    } else {
      await this.player.seekTo(0);
    }
  }

  async seekTo(seconds: number): Promise<void> {
    this.assertAlive();
    await this.player.seekTo(Math.max(0, seconds));
  }

  setSpeed(speed: number): void {
    this.assertAlive();
    this.player.setPlaybackRate(Math.min(2, Math.max(0.5, speed)), "medium");
  }

  clearQueue(): void {
    this.assertAlive();
    // Treat clearing as an explicit stop before calling native pause. Some
    // players synchronously emit didJustFinish from pause(), which must never
    // advance the old queue while it is being discarded.
    this.pausedByUser = true;
    this.player.pause();
    this.tracks = [];
    this.currentIndex = -1;
    this.completionHandledIndex = -1;
    this.terminalWhilePaused = false;
    this.currentTime = 0;
    this.duration = 0;
    this.playing = false;
    this.waitingForTrack = false;
    this.pausedByUser = false;
    this.queueComplete = false;
    this.finished = false;
    this.player.clearLockScreenControls();
    this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.player.clearLockScreenControls();
    this.player.remove();
    this.tracks = [];
    this.listeners.clear();
  }
}

export function getOfflineAudioPlaybackController(): OfflineAudioPlaybackController {
  if (!sharedController) sharedController = new OfflineAudioPlaybackController();
  return sharedController;
}

export function releaseOfflineAudioPlaybackController(): void {
  sharedController?.destroy();
  sharedController = null;
}
