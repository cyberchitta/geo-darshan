<script>
  import { onMount } from "svelte";
  import { SegmentationLayer } from "../js/segmentation-layer.js";

  let {} = $props();
  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let isPlaying = $state(false);
  let currentSegmentationKey = $state(null);
  let manager = $state(null);
  let frameInfo = $derived(
    manager
      ? manager.getCurrentFrameInfo()
      : {
          index: -1,
          total: 0,
          segmentationKey: null,
          progress: 0,
        }
  );

  export function getManager() {
    return manager;
  }

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
    togglePlayPause: () => manager?.togglePlayPause(),
    stepForward: () => manager?.stepForward(),
    stepBack: () => manager?.stepBack(),
    goToFrame: (frameIndex) => manager?.goToFrame(frameIndex),
    setSpeed: (speed) => manager?.setSpeed(speed),
    setFrames: (segmentationKeys, overlays) =>
      manager?.setFrames(segmentationKeys, overlays),
    addOverlay: (segmentationKey, overlay) =>
      manager?.addOverlay(segmentationKey, overlay),
    removeOverlay: (segmentationKey) => manager?.removeOverlay(segmentationKey),
    showInitialFrame: () => manager?.showInitialFrame(),
    reset: () => manager?.reset(),
  };

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    manager = new SegmentationLayer();
    setupEventListeners();
    return () => {
      if (manager) {
        manager.destroy();
      }
    };
  });

  function setupEventListeners() {
    manager.on("frameChanged", (frameIndex, segmentationKey) => {
      currentFrame = frameIndex;
      currentSegmentationKey = segmentationKey;
    });
    manager.on("framesReady", (frameCount) => {
      totalFrames = frameCount;
    });
    manager.on("playStateChanged", (playing) => {
      isPlaying = playing;
    });
  }
</script>
