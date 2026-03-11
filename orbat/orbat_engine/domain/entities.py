from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Unit:
    id: str
    name: str
    type: str
    echelon: str
    status: str
    parent_id: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
