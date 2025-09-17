<script>
  import ClusterLegend from "./ClusterLegend.svelte";
  import LandUseLegend from "./LandUseLegend.svelte";
  import DataSection from "./DataSection.svelte";

  let {
    dataState,
    clusterLabels,
    currentSegmentationKey,
    currentSegmentationData,
    selectedCluster,
    onLabelChange,
  } = $props();
  let activeTab = $state("data");
  $effect(() => {
    if (dataState.manifest && activeTab === "data") {
      activeTab = "segmentations";
    }
  });
  function switchTab(tabId) {
    activeTab = tabId;
    console.log("Switched to tab:", tabId);
  }
</script>

<div class="legend-panel">
  <div class="panel-tabs">
    <button
      class="panel-tab"
      class:active={activeTab === "segmentations"}
      onclick={() => switchTab("segmentations")}
    >
      Segmentations
    </button>
    <button
      class="panel-tab"
      class:active={activeTab === "landuse"}
      onclick={() => switchTab("landuse")}
    >
      Land Use
    </button>
    <button
      class="panel-tab"
      class:active={activeTab === "data"}
      onclick={() => switchTab("data")}
    >
      Data
    </button>
  </div>
  <div class="panel-content">
    {#if activeTab === "segmentations"}
      <div class="tab-panel active">
        <ClusterLegend
          {clusterLabels}
          {currentSegmentationKey}
          {currentSegmentationData}
          {selectedCluster}
          manifest={dataState.manifest}
          {onLabelChange}
        />
      </div>
    {:else if activeTab === "landuse"}
      <div class="tab-panel active">
        <LandUseLegend
          {clusterLabels}
          {currentSegmentationKey}
          {onLabelChange}
        />
      </div>
    {:else if activeTab === "data"}
      <div class="tab-panel active">
        <DataSection {dataState} />
      </div>
    {/if}
  </div>
</div>

<style>
  .legend-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .panel-tabs {
    display: flex;
    border-bottom: 1px solid #ddd;
  }

  .panel-tab {
    padding: 10px 15px;
    border: none;
    background: #f5f5f5;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .panel-tab:hover {
    background: #e9ecef;
  }

  .panel-tab.active {
    background: white;
    border-bottom-color: #007cba;
    color: #007cba;
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
  }

  .tab-panel {
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
</style>
