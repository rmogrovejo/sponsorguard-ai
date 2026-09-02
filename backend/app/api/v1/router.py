from fastapi import APIRouter

from app.api.v1.routes.compliance import router as compliance_router


router = APIRouter(prefix="/api/v1")
router.include_router(compliance_router)
