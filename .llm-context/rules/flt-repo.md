---
name: filters
description: "Exclude inessential files and IDE configs"
overview: "full"
compose:
  filters: ["lc/flt-base"]
gitignores:
  full-files:
    - ".vscode/**"
    - ".python-version"
  outline-files:
    - ".vscode/**"
    - ".python-version"
---
