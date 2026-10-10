"""In-process pub/sub for Server-Sent Events.

Topics: 'case:<id>' (patient app), 'hospital:<key>' (ED dashboard), 'reviews' (clinicians).
Publishing is thread-safe (sync request handlers run in a thread pool).
Single backend instance: run one replica, or replace this with Postgres LISTEN/NOTIFY / Redis to scale out.
"""
import asyncio
import json
from collections import defaultdict


class Broker:
    def __init__(self):
        self.loop = None
        self.subscribers = defaultdict(set)

    def bind(self, loop):
        self.loop = loop

    def subscribe(self, topic):
        queue = asyncio.Queue(maxsize=500)
        self.subscribers[topic].add(queue)
        return queue

    def unsubscribe(self, topic, queue):
        self.subscribers[topic].discard(queue)

    def publish(self, topic, event):
        if self.loop is None:
            return
        data = json.dumps(event, ensure_ascii=False, default=str)
        for queue in list(self.subscribers.get(topic, ())):
            self.loop.call_soon_threadsafe(_offer, queue, data)


def _offer(queue, data):
    if not queue.full():
        queue.put_nowait(data)


broker = Broker()


async def sse(topic, request):
    """Async generator for StreamingResponse: events + a heartbeat every 15 s."""
    queue = broker.subscribe(topic)
    try:
        yield 'retry: 3000\n\n'
        while not await request.is_disconnected():
            try:
                data = await asyncio.wait_for(queue.get(), timeout=15)
                yield f'data: {data}\n\n'
            except asyncio.TimeoutError:
                yield ': ping\n\n'
    finally:
        broker.unsubscribe(topic, queue)
