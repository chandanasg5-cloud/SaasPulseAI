from fastapi import FastAPI

app = FastAPI(title="SaaSPulse AI ML Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
