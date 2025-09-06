class TabRenderer {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;
    this.isVisible = false;
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(...args));
    }
  }

  setVisible(visible) {
    this.isVisible = visible;
    if (this.container) {
      this.container.style.display = visible ? "block" : "none";
    }
  }

  destroy() {
    this.listeners = {};
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}

export { TabRenderer };
