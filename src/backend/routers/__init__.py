"""FastAPI router package.

Per-pillar agents mount their routers onto ``app`` inside
``src/backend/main.py`` via ``app.include_router(...)``. URL versioning
is always ``/v1/`` per rest_api_base.contract Section 3.1.
"""
