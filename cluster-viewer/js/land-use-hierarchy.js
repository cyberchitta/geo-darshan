class LandUseHierarchy {
  constructor(hierarchyData) {
    this.hierarchy = hierarchyData;
    this.flatPaths = this.flattenHierarchy();
  }

  flattenHierarchy(obj = this.hierarchy, currentPath = [], result = []) {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = [...currentPath, key];
      if (typeof value === "string") {
        result.push({
          path: newPath.join("."),
          displayPath: newPath.join(" > "),
          level: newPath.length - 1,
          description: value,
          isLeaf: true,
        });
      } else if (typeof value === "object") {
        result.push({
          path: newPath.join("."),
          displayPath: newPath.join(" > "),
          level: newPath.length - 1,
          description: `${key} (category)`,
          isLeaf: false,
        });
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
}

class LandUseDropdown {
  constructor(clusterId, hierarchyData, onSelectionChange = null) {
    this.clusterId = clusterId;
    this.hierarchy = new LandUseHierarchy(hierarchyData);
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
