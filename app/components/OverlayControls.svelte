<script>
  let { mapState } = $props();
  let opacity = $state(0.8);
  $effect(() => {
    if (mapState?.setOpacity) {
      mapState.setOpacity(opacity);
    }
  });
  let opacityPercent = $derived(Math.round(opacity * 100));
  let opacityDisplay = $derived(`${opacityPercent}%`);
  $effect(() => {
    if (typeof document !== "undefined") {
      const controlsEl = document.querySelector(".overlay-controls");
      if (controlsEl) {
        controlsEl.style.setProperty("--opacity", opacity.toString());
      }
    }
  });

  function handleOpacityChange(event) {
    opacity = parseFloat(event.target.value);
  }

  function handleOpacityKeydown(event) {
    let newOpacity = opacity;
    switch (event.code) {
      case "Home":
        event.preventDefault();
        newOpacity = 0;
        break;
      case "End":
        event.preventDefault();
        newOpacity = 1;
        break;
      case "PageUp":
        event.preventDefault();
        newOpacity = Math.min(1, opacity + 0.1);
        break;
      case "PageDown":
        event.preventDefault();
        newOpacity = Math.max(0, opacity - 0.1);
        break;
      case "Digit0":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          newOpacity = 0;
        }
        break;
      case "Digit1":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          newOpacity = 1;
        }
        break;
      case "Digit5":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          newOpacity = 0.5;
        }
        break;
      default:
        return;
    }
    if (newOpacity !== opacity) {
      opacity = newOpacity;
    }
  }

  const presets = [
    { value: 0, label: "Hidden" },
    { value: 0.25, label: "25%" },
    { value: 0.5, label: "50%" },
    { value: 0.75, label: "75%" },
    { value: 1, label: "100%" },
  ];

  function setPresetOpacity(value) {
    opacity = value;
  }
</script>

<div
  class="overlay-controls"
  role="group"
  aria-labelledby="overlay-controls-title"
>
  <span id="overlay-controls-title" class="sr-only">Layer display controls</span
  >
  <div class="opacity-control">
    <label for="opacity-slider" class="opacity-label">Layer Opacity:</label>
    <div class="opacity-slider-row">
      <input
        type="range"
        id="opacity-slider"
        min="0"
        max="1"
        step="0.01"
        value={opacity}
        oninput={handleOpacityChange}
        onkeydown={handleOpacityKeydown}
        aria-label="Map layer opacity"
        aria-describedby="opacity-value opacity-help"
        aria-valuetext={opacityDisplay}
      />
      <span id="opacity-value" class="opacity-value" aria-live="polite">
        {opacityDisplay}
      </span>
    </div>
    <div
      class="opacity-presets"
      role="group"
      aria-labelledby="opacity-presets-title"
    >
      <span id="opacity-presets-title" class="sr-only"
        >Quick opacity presets</span
      >
      {#each presets as preset}
        <button
          class="preset-btn"
          class:active={Math.abs(opacity - preset.value) < 0.01}
          onclick={() => setPresetOpacity(preset.value)}
          aria-label="Set opacity to {preset.label}"
          title="Set opacity to {preset.label}"
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>
  <span id="opacity-help" class="sr-only">
    Controls opacity for all map overlays including clusters and labeled regions
  </span>
</div>

<style>
  .overlay-controls {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    min-width: 280px;
    position: relative;
    --opacity: 0.8;
  }

  .opacity-control {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  .opacity-label {
    font-size: 14px;
    font-weight: bold;
    color: #333;
    white-space: nowrap;
  }

  #opacity-slider {
    flex: 1;
    min-width: 100px;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      rgba(0, 124, 186, 0) 0%,
      rgba(0, 124, 186, 1) 100%
    );
    outline: none;
    transition: opacity 0.3s ease;
  }

  #opacity-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #007cba;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  #opacity-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #007cba;
    cursor: pointer;
    border: none;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  #opacity-slider:focus {
    box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.3);
  }

  #opacity-slider:focus::-webkit-slider-thumb {
    background: #005a8b;
    transform: scale(1.1);
    box-shadow:
      0 0 0 2px #007cba,
      0 2px 6px rgba(0, 0, 0, 0.3);
  }

  #opacity-slider:focus::-moz-range-thumb {
    background: #005a8b;
    transform: scale(1.1);
    box-shadow:
      0 0 0 2px #007cba,
      0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .opacity-value {
    font-size: 14px;
    font-weight: bold;
    color: #333;
    min-width: 35px;
    text-align: center;
  }

  .opacity-slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .opacity-presets {
    display: flex;
    gap: 4px;
    justify-content: space-between;
  }

  .preset-btn {
    flex: 1;
    padding: 2px 4px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    transition: all 0.2s ease;
    min-height: 20px;
    min-width: 35px;
  }

  .preset-btn:hover {
    background: #f0f0f0;
    border-color: #bbb;
  }

  .preset-btn:focus {
    outline: 2px solid #007cba;
    outline-offset: 1px;
  }

  .preset-btn.active {
    background: #007cba;
    color: white;
    border-color: #007cba;
  }

  .preset-btn.active:hover {
    background: #005a8b;
  }

  /* Visual feedback for opacity changes */
  .opacity-control::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 124, 186, var(--opacity, 0.8)) 100%
    );
    pointer-events: none;
    opacity: 0.1;
    border-radius: 4px;
    transition: opacity 0.3s ease;
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
