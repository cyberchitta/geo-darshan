<script>
  import { activeTab } from "../stores.js";
  import ClusterLegend from "./ClusterLegend.svelte";
  import LandUseLegend from "./LandUseLegend.svelte";
  import DataSection from "./DataSection.svelte";

  function switchTab(tabId) {
    activeTab.set(tabId);
    console.log("Switched to tab:", tabId);
  }

  $: console.log("Active tab is:", $activeTab);
</script>

<div class="legend-panel">
  <div class="panel-tabs">
    <button
      class="panel-tab"
      class:active={$activeTab === "clusters"}
      on:click={() => switchTab("clusters")}
    >
      Clusters
    </button>
    <button
      class="panel-tab"
      class:active={$activeTab === "landuse"}
      on:click={() => switchTab("landuse")}
    >
      Land Use
    </button>
    <button
      class="panel-tab"
      class:active={$activeTab === "data"}
      on:click={() => switchTab("data")}
    >
      Data
    </button>
  </div>

  <div class="panel-content">
    <!-- Static components instead of dynamic -->
    {#if $activeTab === "clusters"}
      <div class="tab-panel active">
        <ClusterLegend />
      </div>
    {:else if $activeTab === "landuse"}
      <div class="tab-panel active">
        <LandUseLegend />
      </div>
    {:else if $activeTab === "data"}
      <div class="tab-panel active">
        <DataSection />
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
  }

  .panel-tab.active {
    background: white;
    border-bottom-color: #007cba;
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
