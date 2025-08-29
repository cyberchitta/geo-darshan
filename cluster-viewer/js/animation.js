class AnimationController {
  constructor() {
    this.listeners = {};
    this.isPlaying = false;
    this.currentFrame = 0;
    this.frames = [];
    this.overlays = [];
    this.speed = 1.0;
    this.animationTimer = null;
    this.baseFrameDuration = 1000; // 1 second per frame at 1x speed

    console.log("AnimationController initialized");
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

  setFrames(kValues, overlays) {
    this.frames = kValues;
    this.overlays = overlays;
    this.currentFrame = 0;

    console.log(`Animation frames set: ${this.frames.length} frames`);
    console.log(`K-values: ${this.frames.join(", ")}`);

    // Enable controls
    this.emit("framesReady", this.frames.length);
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

      // Stop at end unless looping
      if (this.currentFrame >= this.frames.length - 1) {
        // Loop back to beginning
        this.currentFrame = -1; // Will be incremented to 0 in stepForward
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

    // Stop animation if playing
    if (this.isPlaying) {
      this.togglePlayPause();
    }

    if (this.currentFrame > 0) {
      this.currentFrame--;
      this.updateFrame();
      console.log(`Stepped back to frame ${this.currentFrame}`);
    } else {
      // Wrap to end
      this.currentFrame = this.frames.length - 1;
      this.updateFrame();
      console.log(`Wrapped to last frame ${this.currentFrame}`);
    }
  }

  stepForward() {
    if (this.frames.length === 0) return;

    // Stop animation if playing (unless called from timer)
    if (this.isPlaying && !this.animationTimer) {
      this.togglePlayPause();
    }

    if (this.currentFrame < this.frames.length - 1) {
      this.currentFrame++;
      this.updateFrame();
      console.log(`Stepped forward to frame ${this.currentFrame}`);
    } else {
      // Wrap to beginning
      this.currentFrame = 0;
      this.updateFrame();
      console.log(`Wrapped to first frame ${this.currentFrame}`);
    }
  }

  goToFrame(frameIndex) {
    if (this.frames.length === 0) return;

    // Clamp to valid range
    frameIndex = Math.max(0, Math.min(frameIndex, this.frames.length - 1));

    if (frameIndex !== this.currentFrame) {
      this.currentFrame = frameIndex;
      this.updateFrame();
      console.log(`Jumped to frame ${this.currentFrame}`);
    }
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(5.0, speed)); // Clamp between 0.1x and 5.0x

    // Restart timer if playing with new speed
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

    const kValue = this.frames[this.currentFrame];
    const overlay = this.overlays[this.currentFrame];

    // Emit frame change event
    this.emit("frameChanged", this.currentFrame, kValue, overlay);

    // Emit detailed frame info
    this.emit("frameInfo", {
      index: this.currentFrame,
      total: this.frames.length,
      kValue,
      overlay,
      progress: (this.currentFrame / (this.frames.length - 1)) * 100,
    });
  }

  // Control state queries
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
        kValue: null,
        progress: 0,
      };
    }

    return {
      index: this.currentFrame,
      total: this.frames.length,
      kValue: this.frames[this.currentFrame],
      progress: (this.currentFrame / (this.frames.length - 1)) * 100,
    };
  }

  // Animation state management
  reset() {
    this.stopAnimation();
    this.currentFrame = 0;
    this.isPlaying = false;

    if (this.frames.length > 0) {
      this.updateFrame();
    }

    this.emit("playStateChanged", false);
    console.log("Animation reset to beginning");
  }

  destroy() {
    this.stopAnimation();
    this.frames = [];
    this.overlays = [];
    this.listeners = {};
    console.log("AnimationController destroyed");
  }
}

export { AnimationController };
