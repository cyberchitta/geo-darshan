<script>
  import { getContext } from "svelte";

  const { animationController } = getContext("managers");

  // Props from parent (AppContext will pass these)
  let { currentFrame, totalFrames, isPlaying } = $props();

  // Local component state
  let speed = $state(1.0);

  // Sync local state with external controller
  $effect(() => {
    animationController.setSpeed(speed);
  });

  // Derived computations
  let canStep = $derived(totalFrames > 0);
  let canPlay = $derived(totalFrames > 1);
  let speedDisplay = $derived(`${speed.toFixed(1)}x`);

  function handleStepBack() {
    if (canStep && !isPlaying) {
      animationController.stepBack();
    }
  }

  function handlePlayPause() {
    if (canPlay) {
      animationController.togglePlayPause();
    }
  }

  function handleStepForward() {
    if (canStep && !isPlaying) {
      animationController.stepForward();
    }
  }

  function handleSpeedChange(event) {
    speed = parseFloat(event.target.value);
  }

  function handleKeydown(event) {
    switch (event.code) {
      case "Space":
        event.preventDefault();
        handlePlayPause();
        break;
      case "ArrowLeft":
        event.preventDefault();
        handleStepBack();
        break;
      case "ArrowRight":
        event.preventDefault();
        handleStepForward();
        break;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Rest of template stays the same, just update reactive references -->
<div
  class="animation-controls"
  role="group"
  aria-labelledby="animation-controls-title"
>
  <span id="animation-controls-title" class="sr-only"
    >Animation playback controls</span
  >

  <button
    class="control-btn"
    class:disabled={!canStep || isPlaying}
    disabled={!canStep || isPlaying}
    onclick={handleStepBack}
    aria-label="Step back one frame"
    title="Step Back (←)"
  >
    ⏮
  </button>

  <button
    class="control-btn play-pause-btn"
    class:disabled={!canPlay}
    disabled={!canPlay}
    onclick={handlePlayPause}
    aria-label={isPlaying ? "Pause animation" : "Play animation"}
    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
  >
    {isPlaying ? "⏸" : "▶"}
  </button>

  <button
    class="control-btn"
    class:disabled={!canStep || isPlaying}
    disabled={!canStep || isPlaying}
    onclick={handleStepForward}
    aria-label="Step forward one frame"
    title="Step Forward (→)"
  >
    ⏭
  </button>

  <div class="speed-control" role="group" aria-labelledby="speed-control-title">
    <label id="speed-control-title" for="speed-slider">Speed:</label>
    <input
      type="range"
      id="speed-slider"
      min="0.5"
      max="3"
      step="0.1"
      value={speed}
      oninput={handleSpeedChange}
      aria-label="Animation playback speed"
    />
    <span id="speed-value" aria-live="polite">{speedDisplay}</span>
  </div>
</div>

<style>
  .animation-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .control-btn {
    padding: 8px 12px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s ease;
    min-width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .control-btn:hover:not(:disabled) {
    background: #f0f0f0;
    border-color: #bbb;
  }

  .control-btn:focus {
    outline: 2px solid #007cba;
    outline-offset: 2px;
  }

  .control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .play-pause-btn {
    background: #007cba;
    color: white;
    border-color: #007cba;
  }

  .play-pause-btn:hover:not(:disabled) {
    background: #005a8b;
  }

  .speed-control {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 15px;
  }

  .speed-control label {
    font-size: 14px;
    font-weight: bold;
    color: #333;
  }

  .speed-control input[type="range"] {
    width: 80px;
  }

  .speed-control span {
    font-size: 14px;
    color: #666;
    min-width: 35px;
    text-align: center;
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
