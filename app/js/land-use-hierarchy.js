class LandUseHierarchy {
  constructor(hierarchyData) {
    this.hierarchy = hierarchyData;
    this.flatPaths = this.flattenHierarchy();
  }

  static async loadFromFile(url = "land-use.json") {
    try {
      const response = await fetch(url);
      const hierarchyData = await response.json();
      const instance = new LandUseHierarchy(hierarchyData);
      LandUseHierarchy._instance = instance;
      console.log("✅ Land use hierarchy loaded as singleton service");
      return instance;
    } catch (error) {
      console.error("Failed to load land-use hierarchy:", error);
      throw error;
    }
  }

  static getInstance() {
    if (!LandUseHierarchy._instance) {
      throw new Error("Hierarchy not loaded. Call loadFromFile() first.");
    }
    return LandUseHierarchy._instance;
  }

  static isLoaded() {
    return !!LandUseHierarchy._instance;
  }

  flattenHierarchy(obj = this.hierarchy, currentPath = [], result = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      const newPath = [...currentPath, key];
      const hasSubcategories = Object.keys(value).some(
        (k) => !k.startsWith("_")
      );
      result.push({
        path: newPath.join("."),
        displayPath: newPath.join(" > "),
        level: newPath.length - 1,
        description: key,
        isLeaf: !hasSubcategories,
      });
      if (hasSubcategories) {
        this.flattenHierarchy(value, newPath, result);
      }
    }
    return result;
  }

  getSelectableOptions() {
    return [
      {
        path: "unlabeled",
        displayPath: "Unlabeled",
        level: 0,
        description: "Not yet classified",
        isLeaf: true,
      },
      ...this.flatPaths,
    ];
  }

  getPathByPrefix(prefix) {
    return this.flatPaths.filter((item) => item.path.startsWith(prefix));
  }

  getColorForPath(path, level = null) {
    if (!path) return null;

    const pathParts = path.split(".");
    const truncatedPath = level ? pathParts.slice(0, level).join(".") : path;
    return this.findColorInHierarchy(truncatedPath);
  }

  findColorInHierarchy(path) {
    if (!path) return null;
    const pathParts = path.split(".");
    let current = this.hierarchy;

    for (const part of pathParts) {
      if (current[part]) {
        current = current[part];
      } else {
        return null;
      }
    }

    let colorSearch = current;
    let searchPath = pathParts;
    while (searchPath.length > 0) {
      if (colorSearch._color) {
        return colorSearch._color;
      }
      searchPath.pop();
      colorSearch = this.hierarchy;
      for (const part of searchPath) {
        colorSearch = colorSearch[part];
      }
    }
    return null;
  }

  getHierarchyItemsAtLevel(level) {
    const items = [];
    this.traverseHierarchy(this.hierarchy, [], items, level);
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  traverseHierarchy(obj, currentPath, items, targetLevel) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      const newPath = [...currentPath, key];
      if (newPath.length === targetLevel) {
        const color = this.findColorInHierarchy(newPath.join("."));
        items.push({
          path: newPath.join("."),
          name: key,
          displayPath: newPath.join(" > "),
          color: color ? `#${color.replace("#", "")}` : "#888888",
        });
      } else if (newPath.length < targetLevel) {
        this.traverseHierarchy(value, newPath, items, targetLevel);
      }
    }
  }
}

class LandUseDropdown {
  constructor(clusterId, onSelectionChange = null) {
    if (!LandUseHierarchy.isLoaded()) {
      throw new Error(
        "LandUseHierarchy must be loaded before creating dropdowns"
      );
    }

    this.clusterId = clusterId;
    this.hierarchy = LandUseHierarchy.getInstance();
    this.onSelectionChange = onSelectionChange;
    this.currentSelection = "unlabeled";
    this.element = this.createDropdownElement();
  }

  createDropdownElement() {
    const container = document.createElement("div");
    container.className = "land-use-dropdown-container";
    const select = document.createElement("select");
    select.className = "land-use-dropdown";
    select.id = `cluster-${this.clusterId}-dropdown`;
    const options = this.hierarchy.getSelectableOptions();
    options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.path;
      optionElement.textContent = this.formatOptionText(option);
      optionElement.title = option.description;
      if (option.level > 0) {
        optionElement.style.paddingLeft = `${option.level * 20}px`;
      }
      if (!option.isLeaf) {
        optionElement.style.fontWeight = "bold";
      }
      select.appendChild(optionElement);
    });

    select.addEventListener("change", (e) => {
      this.currentSelection = e.target.value;
      this.updateDisplayStyle();
      if (this.onSelectionChange) {
        const selectedOption = options.find(
          (opt) => opt.path === e.target.value
        );
        this.onSelectionChange(this.clusterId, selectedOption);
      }
    });
    container.appendChild(select);
    return container;
  }

  formatOptionText(option) {
    const indent = "  ".repeat(option.level);
    const prefix = option.isLeaf ? "• " : "▶ ";
    return `${indent}${prefix}${option.displayPath.split(" > ").pop()}`;
  }

  updateDisplayStyle() {
    const select = this.element.querySelector("select");
    select.classList.remove("unlabeled", "intermediate", "leaf");
    if (this.currentSelection === "unlabeled") {
      select.classList.add("unlabeled");
    } else {
      const option = this.hierarchy.flatPaths.find(
        (opt) => opt.path === this.currentSelection
      );
      if (option) {
        select.classList.add(option.isLeaf ? "leaf" : "intermediate");
      }
    }
  }

  setSelection(path) {
    this.currentSelection = path;
    const select = this.element.querySelector("select");
    select.value = path;
    this.updateDisplayStyle();
  }

  getSelection() {
    return {
      clusterId: this.clusterId,
      path: this.currentSelection,
      option: this.hierarchy
        .getSelectableOptions()
        .find((opt) => opt.path === this.currentSelection),
    };
  }
}

export { LandUseHierarchy, LandUseDropdown };
