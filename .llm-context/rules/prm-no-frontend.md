---
name: prm-no-frontend
description: "Exclude frontend folder - focus on backend, scripts, and docs"
overview: "full"
compose:
  filters: ["flt-repo"]
gitignores:
  full-files: ["frontend/**"]
  outline-files: ["frontend/**"]
  overview-files: ["frontend/**"]
---
