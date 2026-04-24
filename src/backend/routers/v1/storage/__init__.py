"""Storage routers.

Owner: Chione (W1). Mounts under ``/v1/storage/*`` per
file_storage.contract Section 4.

Two sub-routers:

- ``upload`` : presigned POST init + upload-complete (enqueues scan).
- ``download`` : signed URL for private files + CDN redirect for public.
"""

from .download import router as download_router
from .upload import router as upload_router

__all__ = ["upload_router", "download_router"]
