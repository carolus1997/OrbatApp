from dataclasses import dataclass


@dataclass
class GraphNode:
    id: str
    node_type: str
    ref_id: str
