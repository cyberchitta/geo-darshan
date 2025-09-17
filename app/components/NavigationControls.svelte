<script>
  import { extractKValue } from "../js/utils.js";

  let { segmentationState } = $props();
  let currentFrame = $derived(segmentationState.currentFrame || 0);
  let totalFrames = $derived(segmentationState.totalFrames || 0);
  let isPlaying = $derived(segmentationState.isPlaying || false);
  let currentSegmentationKey = $derived(
    segmentationState.currentSegmentationKey
  );
  let currentK = $derived(
    currentSegmentationKey ? extractKValue(currentSegmentationKey) : null
  );
  let sliderMax = $derived(Math.max(0, totalFrames - 1));
  let canNavigate = $derived(totalFrames > 0);
  let frameInfo = $derived(`Frame ${currentFrame + 1} of ${totalFrames}`);
  let kDisplayText = $derived(
    currentK !== null ? `${currentK} clusters` : "-- clusters"
  );
  $effect(() => {
    if (typeof document !== "undefined") {
      const progressEl = document.querySelector(".frame-progress");
      if (progressEl && totalFrames > 0) {
        const progress = ((currentFrame + 1) / totalFrames) * 100;
        progressEl.style.setProperty("--progress", progress.toString());
      }
    }
  });

  function handleFrameChange(event) {
    if (!isPlaying && canNavigate) {
      const frameIndex = parseInt(event.target.value);
      segmentationState.goToFrame?.(frameIndex);
    }
  }

  function handleSliderKeydown(event) {
    if (isPlaying) {
      event.preventDefault();
      return;
    }

    switch (event.code) {
      case "Home":
        event.preventDefault();
        segmentationState.goToFrame?.(0);
        break;
      case "End":
        event.preventDefault();
        segmentationState.goToFrame?.(totalFrames - 1);
        break;
      case "PageUp":
        event.preventDefault();
        const prevFrame = Math.max(0, currentFrame - 5);
        segmentationState.goToFrame?.(prevFrame);
        break;
      case "PageDown":
        event.preventDefault();
        const nextFrame = Math.min(totalFrames - 1, currentFrame + 5);
        segmentationState.goToFrame?.(nextFrame);
        break;
    }
  }
</script>

<div
  class="navigation-controls"
  role="group"
  aria-labelledby="navigation-controls-title"
>
  <span id="navigation-controls-title" class="sr-only"
    >Frame navigation controls</span
  >

  <div class="k-slider-container">
    <label for="k-slider" class="k-slider-label">K-value:</label>
    <input
      type="range"
      id="k-slider"
      min="0"
      max={sliderMax}
      step="1"
      value={currentFrame}
      disabled={isPlaying || !canNavigate}
      oninput={handleFrameChange}
      onkeydown={handleSliderKeydown}
      aria-label="Navigate to specific frame"
      aria-describedby="k-slider-desc k-display"
      aria-valuetext={frameInfo}
    />
    <span id="k-slider-desc" class="sr-only">
      Use arrow keys to navigate frames, Home/End for first/last frame, Page
      Up/Down to jump 5 frames
    </span>
  </div>

  <div class="k-display" id="k-display" aria-live="polite">
    <span class="k-value" aria-label="Current cluster count">
      {kDisplayText}
    </span>
    <span class="frame-info sr-only">{frameInfo}</span>
  </div>

  {#if totalFrames > 0}
    <div
      class="frame-progress"
      role="progressbar"
      aria-valuenow={currentFrame + 1}
      aria-valuemin="1"
      aria-valuemax={totalFrames}
      aria-label="Animation progress"
    >
      <span class="sr-only">{frameInfo}</span>
    </div>
  {/if}
</div>

<style>
  .navigation-controls {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    min-width: 250px;
  }

  .k-slider-container {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .k-slider-label {
    font-size: 14px;
    font-weight: bold;
    color: #333;
    white-space: nowrap;
  }

  #k-slider {
    flex: 1;
    min-width: 120px;
    height: 6px;
    border-radius: 3px;
    background: #ddd;
    outline: none;
    transition: background 0.3s ease;
  }

  #k-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #007cba;
    cursor: pointer;
    transition: background 0.3s ease;
  }

  #k-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #007cba;
    cursor: pointer;
    border: none;
    transition: background 0.3s ease;
  }

  #k-slider:focus {
    background: #bbb;
  }

  #k-slider:focus::-webkit-slider-thumb {
    background: #005a8b;
    box-shadow: 0 0 0 2px #007cba;
  }

  #k-slider:focus::-moz-range-thumb {
    background: #005a8b;
    box-shadow: 0 0 0 2px #007cba;
  }

  #k-slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  #k-slider:disabled::-webkit-slider-thumb {
    cursor: not-allowed;
    background: #999;
  }

  #k-slider:disabled::-moz-range-thumb {
    cursor: not-allowed;
    background: #999;
  }

  .k-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 80px;
  }

  .k-value {
    font-size: 14px;
    font-weight: bold;
    color: #333;
    white-space: nowrap;
  }

  .frame-progress {
    width: 4px;
    height: 30px;
    background: #eee;
    border-radius: 2px;
    position: relative;
    overflow: hidden;
  }

  .frame-progress::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: calc(var(--progress, 0) * 1%);
    background: #007cba;
    transition: height 0.3s ease;
  }

  /* Screen reader only content */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
