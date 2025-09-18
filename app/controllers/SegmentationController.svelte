<script>
  import { onMount } from "svelte";

  let {} = $props();
  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let isPlaying = $state(false);
  let segmentationKeys = $state([]);
  let currentSegmentationKey = $state(null);
  let speed = $state(1.0);
  let baseFrameDuration = $state(1000);
  let animationTimer = $state(null);
  let frameInfo = $derived({
    index: currentFrame,
    total: totalFrames,
    segmentationKey: currentSegmentationKey,
    progress: totalFrames > 0 ? (currentFrame / (totalFrames - 1)) * 100 : 0,
  });

  const stateObject = {
    get currentFrame() {
      return currentFrame;
    },
    get totalFrames() {
      return totalFrames;
    },
    get isPlaying() {
      return isPlaying;
    },
    get currentSegmentationKey() {
      return currentSegmentationKey;
    },
    get frameInfo() {
      return frameInfo;
    },
    togglePlayPause: () => {
      if (totalFrames > 1) {
        isPlaying = !isPlaying;
        if (isPlaying) {
          startAnimation();
        } else {
          stopAnimation();
        }
      }
    },
    stepForward: () => {
      if (totalFrames > 0) {
        currentFrame = currentFrame < totalFrames - 1 ? currentFrame + 1 : 0;
        updateCurrentFrame();
      }
    },
    stepBack: () => {
      if (totalFrames > 0) {
        currentFrame = currentFrame > 0 ? currentFrame - 1 : totalFrames - 1;
        updateCurrentFrame();
      }
    },
    goToFrame: (frameIndex) => {
      if (frameIndex >= 0 && frameIndex < totalFrames) {
        currentFrame = frameIndex;
        updateCurrentFrame();
      }
    },
    setSpeed: (newSpeed) => {
      speed = Math.max(0.1, Math.min(5.0, newSpeed));
    },
    setFrames: (segKeys, overlays) => {
      segmentationKeys = segKeys;
      totalFrames = segmentationKeys.length;
      currentFrame = 0;
      updateCurrentFrame();
    },
    showInitialFrame: () => {
      if (totalFrames > 0) {
        currentFrame = 0;
        updateCurrentFrame();
      }
    },
    reset: () => {
      stopAnimation();
      currentFrame = 0;
      isPlaying = false;
      if (totalFrames > 0) {
        updateCurrentFrame();
      }
    },
  };

  function updateCurrentFrame() {
    if (segmentationKeys.length > 0 && currentFrame < segmentationKeys.length) {
      currentSegmentationKey = segmentationKeys[currentFrame];
    }
  }

  function startAnimation() {
    if (animationTimer) {
      clearInterval(animationTimer);
    }
    const frameDuration = baseFrameDuration / speed;
    animationTimer = setInterval(() => {
      stateObject.stepForward();
    }, frameDuration);
  }

  function stopAnimation() {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    return () => {
      stopAnimation();
    };
  });
</script>
