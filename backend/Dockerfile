# Build context: repository root (needs data/).
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY data/ /data/
ENV HOSPITALS_FILE=/data/hospitals.grand-tunis.json
RUN useradd --uid 10001 --no-create-home app
USER app
EXPOSE 8100
# One worker: live events are in-process (see app/events.py).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--proxy-headers", "--forwarded-allow-ips", "*"]
