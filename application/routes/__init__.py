from fastapi import FastAPI

from .assessment.items.router import router as assessment_items_router
from .assessment.map.router import router as assessment_map_router
from .reports.activity.router import router as reports_activity_router
from .resources.router import router as resources_router
from .resources.memos.router import router as resource_memos_router
from .resources.imports.router import router as resource_imports_router
from .resources.advanced.router import router as resources_advanced_router
from .interactive_support_plan.router import router as interactive_support_plan_router


def register_routes(app: FastAPI) -> None:
    app.include_router(reports_activity_router)
    app.include_router(assessment_items_router)
    app.include_router(assessment_map_router)
    app.include_router(resources_router)
    app.include_router(resource_memos_router)
    app.include_router(resource_imports_router)
    app.include_router(resources_advanced_router)
    app.include_router(interactive_support_plan_router)

