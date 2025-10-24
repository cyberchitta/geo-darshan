<script>
  import { onMount } from "svelte";
  import DetectionController from "./detection/DetectionController.svelte";

  let detectionController = $state();

  let appState = $derived({
    detection: detectionController?.getState?.(),
  });

  onMount(() => {
    console.log("✅ Detection app initialized");
  });
</script>

<div id="detection-app">
  <DetectionController bind:this={detectionController} />
</div>

<style>
  #detection-app {
    width: 100%;
    height: 100vh;
  }
</style>
