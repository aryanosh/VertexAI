"""VertexAI AI Agent Service — FastAPI Application

Hosts 4 AI agents for the VertexAI human-supervised vulnerability management pipeline.
Runs on port 8000. Called by Team 1's Spring Boot backend.
"""

from fastapi import FastAPI
from agent1_parser import router as agent1_router
from agent2_noise import router as agent2_router
from agent3_threat import router as agent3_router
from agent4_scoring import router as agent4_router
import uvicorn

app = FastAPI(
    title="VertexAI AI Agent Service",
    description="4 AI Agents: Parser, Noise Reduction, Threat Intel, Risk Scoring & Ticket Prep",
    version="1.0.0",
)

app.include_router(agent1_router)
app.include_router(agent2_router)
app.include_router(agent3_router)
app.include_router(agent4_router)


@app.get("/health")
async def health():
    """Health check endpoint for Docker and service readiness."""
    return {"status": "UP", "service": "python-agents"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
