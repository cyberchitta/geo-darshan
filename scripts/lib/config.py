from pathlib import Path
from typing import Dict, Tuple, Any
import yaml


def load_config(project_root: Path) -> Dict[str, Any]:
    global_config_path = project_root / "config.yaml"
    with open(global_config_path) as f:
        global_config = yaml.safe_load(f)
    aoi_name = global_config["aoi"]["current"]
    aoi_path = project_root / global_config["aoi-paths"][aoi_name]
    aoi_config_path = aoi_path / "config.yaml"
    with open(aoi_config_path) as f:
        aoi_config = yaml.safe_load(f)
    return {
        "aoi_name": aoi_name,
        "aoi_path": aoi_path,
        "aoi_config": aoi_config,
        "global_config": global_config,
    }


def get_source_config(aoi_config: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    sources = aoi_config.get("sources", {})
    source = sources.get(source_name)
    if not source:
        raise KeyError(f"Source '{source_name}' not found in AOI config")
    return source


def get_current_segmentation(aoi_config: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    segmentation = aoi_config.get("segmentation", {})
    seg_name = segmentation.get("current")
    if not seg_name:
        raise KeyError("No current segmentation specified in AOI config")
    configs = segmentation.get("configs", {})
    seg_config = configs.get(seg_name)
    if not seg_config:
        raise KeyError(f"Segmentation '{seg_name}' not found in AOI config")
    return seg_name, seg_config


def resolve_aoi_path(aoi_path: Path, relative_path: str) -> Path:
    return aoi_path / relative_path
