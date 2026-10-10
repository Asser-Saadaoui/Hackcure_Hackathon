# Build context: repository root (needs data/).
FROM python:3.12-slim
WORKDIR /app
COPY hospital-sim/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hospital-sim/ ./
COPY data/ /data/
ENV SAHHANITO_HOSPITALS=/data/hospitals.grand-tunis.json
RUN useradd --uid 10001 --no-create-home app
USER app
EXPOSE 8200
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8200"]
