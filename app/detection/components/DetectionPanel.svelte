<script>
  import { DetectionService } from "../../js/detection/detection-service.js";

  let {
    selectedRegion,
    uploadedImage,
    workflowMode,
    isProcessing,
    detectionResults,
    error,
    mapManager,
  } = $props();
  let llmModel = $state("claude-3-5-sonnet");
  let apiKey = $state("");
  let prompt = $state(
    "Detect all buildings, roads, and vegetation. Return as separate objects."
  );
  let confidenceThreshold = $state(0.5);

  async function runDetection() {
    const imageToAnalyze = workflowMode === "manual" ? uploadedImage : null;

    if (!imageToAnalyze) {
      error =
        workflowMode === "manual"
          ? "Please upload an image first"
          : "Please select a region first";
      return;
    }

    if (!apiKey) {
      error = "API key required";
      return;
    }

    isProcessing = true;
    error = null;

    try {
      const service = new DetectionService(apiKey, llmModel);
      detectionResults = await service.detectObjects(
        imageToAnalyze,
        prompt,
        confidenceThreshold
      );
      console.log("✅ Detection complete:", detectionResults);
    } catch (err) {
      error = `Detection failed: ${err.message}`;
      console.error(err);
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="detection-panel">
  <h3>2. Detection Parameters</h3>

  <div class="form-group">
    <label for="model">LLM Model</label>
    <select id="model" bind:value={llmModel}>
      <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
      <option value="gpt-4-vision">GPT-4 Vision</option>
    </select>
  </div>

  <div class="form-group">
    <label for="api-key">API Key</label>
    <input
      id="api-key"
      type="password"
      bind:value={apiKey}
      placeholder="Paste your API key"
    />
  </div>

  <div class="form-group">
    <label for="prompt">Detection Prompt</label>
    <textarea
      id="prompt"
      bind:value={prompt}
      rows="4"
      placeholder="Describe what to detect..."
    />
  </div>

  <div class="form-group">
    <label for="threshold">Confidence Threshold</label>
    <input
      id="threshold"
      type="range"
      min="0"
      max="1"
      step="0.05"
      bind:value={confidenceThreshold}
    />
    <span class="threshold-value"
      >{(confidenceThreshold * 100).toFixed(0)}%</span
    >
  </div>

  <button
    on:click={runDetection}
    disabled={!selectedRegion || isProcessing}
    class="detect-button"
  >
    {isProcessing ? "Processing..." : "Run Detection"}
  </button>
</div>

<style>
  .detection-panel {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #eee;
  }

  h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
  }

  .form-group {
    margin-bottom: 12px;
  }

  label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 500;
    color: #333;
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
  }

  .threshold-value {
    font-size: 12px;
    color: #666;
    margin-left: 8px;
  }

  .detect-button {
    width: 100%;
    padding: 10px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .detect-button:hover:not(:disabled) {
    background: #2980b9;
  }

  .detect-button:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
  }
</style>
