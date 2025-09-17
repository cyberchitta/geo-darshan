import { compareSegmentationKeys } from "./utils.js";

class SegmentationManager {
  constructor() {
    this.listeners = {};
    this.isPlaying = false;
    this.currentFrame = 0;
    this.frames = [];
    this.overlays = [];
    this.speed = 1.0;
    this.animationTimer = null;
    this.baseFrameDuration = 1000;
    console.log("SegmentationManager initialized");
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(...args));
    }
  }

  setFrames(segmentationKeys, overlays) {
    const frameData = segmentationKeys.map((key, index) => ({
      key,
      overlay: overlays[index],
    }));
    this.frames = frameData.map((item) => item.key);
    this.overlays = frameData.map((item) => item.overlay);
    this.currentFrame = 0;
    console.log(`Segmentation frames set: ${this.frames.length} frames`);
    console.log(`Segmentation keys: ${this.frames.join(", ")}`);
    this.emit("framesReady", this.frames.length);
  }

  addOverlay(segmentationKey, overlay) {
    this.removeOverlay(segmentationKey);
    this.frames.push(segmentationKey);
    this.overlays.push(overlay);
    console.log(
      `Added overlay: ${segmentationKey}, total frames: ${this.frames.length}`
    );
    this.emit("framesReady", this.frames.length);
  }

  removeOverlay(segmentationKey) {
    const index = this.frames.indexOf(segmentationKey);
    if (index >= 0) {
      this.frames.splice(index, 1);
      this.overlays.splice(index, 1);
      if (this.currentFrame >= index && this.currentFrame > 0) {
        this.currentFrame--;
      }
      if (this.currentFrame >= this.frames.length && this.frames.length > 0) {
        this.currentFrame = this.frames.length - 1;
      }
      console.log(
        `Removed overlay: ${segmentationKey}, total frames: ${this.frames.length}`
      );
      this.emit("framesReady", this.frames.length);
      if (this.frames.length > 0) {
        this.updateFrame();
      }
    }
  }

  showInitialFrame() {
    if (this.frames.length > 0) {
      this.updateFrame();
      console.log("Showing initial frame");
    }
  }

  togglePlayPause() {
    if (this.frames.length === 0) {
      console.warn("No frames loaded - cannot play animation");
      return;
    }
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.startAnimation();
    } else {
      this.stopAnimation();
    }
    this.emit("playStateChanged", this.isPlaying);
    console.log(`Animation ${this.isPlaying ? "started" : "stopped"}`);
  }

  startAnimation() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
    }
    const frameDuration = this.baseFrameDuration / this.speed;
    this.animationTimer = setInterval(() => {
      this.stepForward();
      if (this.currentFrame >= this.frames.length - 1) {
        this.currentFrame = -1;
        console.log("Animation looped to beginning");
      }
    }, frameDuration);
    console.log(`Animation timer started: ${frameDuration}ms per frame`);
  }

  stopAnimation() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  stepBack() {
    if (this.frames.length === 0) return;
    if (this.isPlaying) {
      this.togglePlayPause();
    }
    if (this.currentFrame > 0) {
      this.currentFrame--;
      this.updateFrame();
      console.log(`Stepped back to frame ${this.currentFrame}`);
    } else {
      this.currentFrame = this.frames.length - 1;
      this.updateFrame();
      console.log(`Wrapped to last frame ${this.currentFrame}`);
    }
  }

  stepForward() {
    if (this.frames.length === 0) return;
    if (this.isPlaying && !this.animationTimer) {
      this.togglePlayPause();
    }
    if (this.currentFrame < this.frames.length - 1) {
      this.currentFrame++;
      this.updateFrame();
      console.log(`Stepped forward to frame ${this.currentFrame}`);
    } else {
      this.currentFrame = 0;
      this.updateFrame();
      console.log(`Wrapped to first frame ${this.currentFrame}`);
    }
  }

  goToFrame(frameIndex) {
    if (this.frames.length === 0) return;
    frameIndex = Math.max(0, Math.min(frameIndex, this.frames.length - 1));
    if (frameIndex !== this.currentFrame) {
      this.currentFrame = frameIndex;
      this.updateFrame();
      console.log(`Jumped to frame ${this.currentFrame}`);
    }
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(5.0, speed));
    if (this.isPlaying) {
      this.stopAnimation();
      this.startAnimation();
    }
    console.log(`Animation speed set to ${this.speed}x`);
  }

  updateFrame() {
    if (
      this.frames.length === 0 ||
      this.currentFrame < 0 ||
      this.currentFrame >= this.frames.length
    ) {
      console.warn("Invalid frame index:", this.currentFrame);
      return;
    }
    const segmentationKey = this.frames[this.currentFrame];
    const overlay = this.overlays[this.currentFrame];
    this.emit("frameChanged", this.currentFrame, segmentationKey);
    this.emit("frameInfo", {
      index: this.currentFrame,
      total: this.frames.length,
      segmentationKey,
      overlay,
      progress: (this.currentFrame / (this.frames.length - 1)) * 100,
    });
  }

  canStepBack() {
    return this.frames.length > 0;
  }

  canStepForward() {
    return this.frames.length > 0;
  }

  canPlay() {
    return this.frames.length > 1;
  }

  getCurrentFrameInfo() {
    if (this.frames.length === 0) {
      return {
        index: -1,
        total: 0,
        segmentationKey: null,
        progress: 0,
      };
    }
    return {
      index: this.currentFrame,
      total: this.frames.length,
      segmentationKey: this.frames[this.currentFrame],
      progress: (this.currentFrame / (this.frames.length - 1)) * 100,
    };
  }

  reset() {
    this.stopAnimation();
    this.currentFrame = 0;
    this.isPlaying = false;
    if (this.frames.length > 0) {
      this.updateFrame();
    }
    this.emit("playStateChanged", false);
    console.log("Segmentation manager reset to beginning");
  }

  destroy() {
    this.stopAnimation();
    this.frames = [];
    this.overlays = [];
    this.listeners = {};
    console.log("SegmentationManager destroyed");
  }
}

export { SegmentationManager };
