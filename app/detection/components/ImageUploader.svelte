<script>
  let { onImageUpload } = $props();
  let isDragging = $state(false);
  let preview = $state(null);
  let fileName = $state("");

  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      preview = e.target.result;
      onImageUpload(file);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
  }
</script>

<div class="image-uploader">
  <h3>Upload Satellite Image</h3>

  {#if !preview}
    <div
      class="upload-zone"
      class:dragging={isDragging}
      ondrop={handleDrop}
      ondragover={(e) => {
        e.preventDefault();
        isDragging = true;
      }}
      ondragleave={() => (isDragging = false)}
    >
      <div class="upload-icon">⬆</div>
      <p>Drag image here or click to select</p>
      <input
        type="file"
        accept="image/*"
        onchange={handleFileInput}
        style="display: none;"
        bind:this={fileInput}
      />
      <button onclick={() => fileInput?.click()} class="select-btn">
        Select File
      </button>
    </div>
  {:else}
    <div class="preview-container">
      <img src={preview} alt="Uploaded satellite image" />
      <div class="preview-info">
        <div class="file-name">{fileName}</div>
        <button
          onclick={() => {
            preview = null;
            fileName = "";
          }}
          class="clear-btn"
        >
          Remove
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .image-uploader {
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
  }

  .upload-zone {
    border: 2px dashed #ccc;
    border-radius: 4px;
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #fafafa;
  }

  .upload-zone:hover {
    border-color: #3498db;
    background: #f0f8ff;
  }

  .upload-zone.dragging {
    border-color: #3498db;
    background: #e3f2fd;
  }

  .upload-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .upload-zone p {
    margin: 8px 0;
    font-size: 12px;
    color: #666;
  }

  .select-btn {
    padding: 6px 12px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .select-btn:hover {
    background: #2980b9;
  }

  .preview-container {
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
    background: white;
  }

  .preview-container img {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    display: block;
  }

  .preview-info {
    padding: 8px;
    border-top: 1px solid #eee;
  }

  .file-name {
    font-size: 11px;
    color: #666;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clear-btn {
    width: 100%;
    padding: 4px;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  .clear-btn:hover {
    background: #c0392b;
  }
</style>
