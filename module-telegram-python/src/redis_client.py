import redis.asyncio as aioredis
from config import settings

_pool = None

def get_redis():
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _pool

async def close_redis():
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None
