from fastapi import APIRouter

from app.api.v1.routes.briefs import router as briefs_router
from app.api.v1.routes.compliance import router as compliance_router
from app.api.v1.routes.fixes import router as fixes_router
from app.api.v1.routes.shortform import router as shortform_router
from app.api.v1.routes.shortform_suggestions import router as shortform_suggestions_router


router = APIRouter(prefix="/api/v1")
router.include_router(briefs_router)
router.include_router(compliance_router)
router.include_router(fixes_router)
router.include_router(shortform_router)
router.include_router(shortform_suggestions_router)
