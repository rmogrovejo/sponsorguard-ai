from fastapi import APIRouter

from app.api.v1.routes.briefs import router as briefs_router
from app.api.v1.routes.compliance import router as compliance_router


router = APIRouter(prefix="/api/v1")
router.include_router(briefs_router)
router.include_router(compliance_router)
