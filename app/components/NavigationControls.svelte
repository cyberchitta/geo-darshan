<script>
  import { getContext } from "svelte";
  import {
    currentFrame,
    totalFrames,
    isPlaying,
    currentSegmentationKey,
  } from "../stores.js";
  import { extractKValue } from "../js/utils.js";

  const { animationController } = getContext("managers");

  // Reactive computations
  $: currentK = $currentSegmentationKey
    ? extractKValue($currentSegmentationKey)
    : null;
  $: sliderMax = Math.max(0, $totalFrames - 1);
  $: canNavigate = $totalFrames > 0;
  $: frameInfo = `Frame ${$currentFrame + 1} of ${$totalFrames}`;
  $: kDisplayText = currentK !== null ? `${currentK} clusters` : "-- clusters";

  // Update CSS custom properties for progress bar - MOVED HERE
  $: if (typeof document !== "undefined") {
    const progressEl = document.querySelector(".frame-progress");
    if (progressEl && $totalFrames > 0) {
      const progress = (($currentFrame + 1) / $totalFrames) * 100;
      progressEl.style.setProperty("--progress", progress.toString());
    }
  }

  // Handle frame navigation via slider
  function handleFrameChange(event) {
    if (!$isPlaying && canNavigate) {
      const frameIndex = parseInt(event.target.value);
      animationController.goToFrame(frameIndex);
    }
  }

  // Handle keyboard navigation on slider
  function handleSliderKeydown(event) {
    if ($isPlaying) {
      event.preventDefault();
      return;
    }

    // Let default slider behavior work for arrow keys, home, end, page up/down
    switch (event.code) {
      case "Home":
        event.preventDefault();
        animationController.goToFrame(0);
        break;
      case "End":
        event.preventDefault();
        animationController.goToFrame($totalFrames - 1);
        break;
      case "PageUp":
        event.preventDefault();
        const prevFrame = Math.max(0, $currentFrame - 5);
        animationController.goToFrame(prevFrame);
        break;
      case "PageDown":
        event.preventDefault();
        const nextFrame = Math.min($totalFrames - 1, $currentFrame + 5);
        animationController.goToFrame(nextFrame);
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
      value={$currentFrame}
      disabled={$isPlaying || !canNavigate}
      on:input={handleFrameChange}
      on:keydown={handleSliderKeydown}
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

  {#if $totalFrames > 0}
    <div
      class="frame-progress"
      role="progressbar"
      aria-valuenow={$currentFrame + 1}
      aria-valuemin="1"
      aria-valuemax={$totalFrames}
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
