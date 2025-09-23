from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TaskExecutionRequest(BaseModel):
    task: str


@router.post("/execute")
async def execute_task(request: Request, body: TaskExecutionRequest):
    """
    タスク実行エージェントを呼び出し、タスクを実行する
    """
    try:
        agent = request.app.state.task_execution_agent
        result = await agent.execute_task(body.task)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
