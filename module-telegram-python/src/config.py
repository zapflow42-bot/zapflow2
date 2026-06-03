import os
from pydantic_settings import BaseSettings
from pydantic import Field

ENV_FILE = os.path.join(os.path.dirname(__file__), "../../.env")

class Settings(BaseSettings):
    telegram_api_id: int = Field(..., env="TELEGRAM_API_ID")
    telegram_api_hash: str = Field(..., env="TELEGRAM_API_HASH")
    redis_url: str = Field("redis://localhost:6379", env="REDIS_URL")
    supabase_url: str = Field(..., env="SUPABASE_URL")
    supabase_service_key: str = Field(..., env="SUPABASE_SERVICE_ROLE_KEY")
    internal_secret: str = Field("dev-secret-change-in-prod", env="INTERNAL_SECRET")
    port: int = Field(4003, env="TELEGRAM_PORT")
    log_level: str = Field("info", env="LOG_LEVEL")
    node_env: str = Field("development", env="NODE_ENV")
    model_config = {"env_file": ENV_FILE, "extra": "ignore"}

settings = Settings()
