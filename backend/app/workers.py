"""Background loops: simulator availability, referral timeouts, simulated ambulances."""
import asyncio
import logging

from app import config, hospitals, services
from app.db import SessionLocal

log = logging.getLogger('sahhanito.workers')


def _with_db(fn):
    db = SessionLocal()
    try:
        fn(db)
    except Exception:  # a failing loop must never stop the others
        log.exception('worker %s failed', fn.__name__)
        db.rollback()
    finally:
        db.close()


async def _every(seconds, fn):
    while True:
        await asyncio.to_thread(fn)
        await asyncio.sleep(seconds)


def start():
    return [
        asyncio.create_task(_every(config.SIM_POLL_S, hospitals.refresh_sim)),
        asyncio.create_task(_every(5, lambda: _with_db(services.expire_referrals))),
        asyncio.create_task(_every(2, lambda: _with_db(services.tick_ambulances))),
    ]
