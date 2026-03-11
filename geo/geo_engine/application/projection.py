from dataclasses import dataclass
from typing import Dict, List


@dataclass
class GeoFeature:
    type: str
    geometry: Dict[str, object]
    properties: Dict[str, object]


def build_feature_collection(features: List[GeoFeature]) -> Dict[str, object]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": feature.type,
                "geometry": feature.geometry,
                "properties": feature.properties,
            }
            for feature in features
        ],
    }
