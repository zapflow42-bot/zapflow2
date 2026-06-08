import os
from pydantic_settings import BaseSettings
from pydantic import Field

ENV_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env"))

class Settings(BaseSettings):
    telegram_api_id:      int = Field(..., alias="TELEGRAM_API_ID")
    telegram_api_hash:    str = Field(..., alias="TELEGRAM_API_HASH")
    redis_url:            str = Field("redis://localhost:6379", alias="REDIS_URL")
    supabase_url:         str = Field(..., alias="SUPABASE_URL")
    supabase_service_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    internal_secret:      str = Field("dev-secret-change-in-prod", alias="INTERNAL_SECRET")
    port:                 int = Field(4003, alias="TELEGRAM_PORT")
    log_level:            str = Field("info", alias="LOG_LEVEL")
    node_env:             str = Field("development", alias="NODE_ENV")

    model_config = {
        "env_file":          ENV_FILE,
        "env_file_encoding": "utf-8",
        "populate_by_name":  True,
        "extra":             "ignore",
    }

settings = Settings()
