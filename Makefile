.PHONY: help install install-server redis-up redis-down service service-dev client client-dev fullstack-dev

DOCKER_COMPOSE ?= docker compose

help:
	@echo "Planning Poker development workflows"
	@echo ""
	@echo "Targets:"
	@echo "  make install         Install root dependencies"
	@echo "  make install-server  Install signaling server dependencies"
	@echo "  make redis-up        Start Redis container and wait for health"
	@echo "  make redis-down      Stop Redis container"
	@echo "  make service         Start signaling service (server/start)"
	@echo "  make service-dev     Start signaling service with file watch"
	@echo "  make client          Start full client stack (11ty + Vite + Tailwind)"
	@echo "  make client-dev      Start client in Vite dev mode"
	@echo "  make fullstack-dev   Run service-dev and client in separate terminals"

install:
	npm install

install-server:
	npm --prefix server install

redis-up:
	@$(DOCKER_COMPOSE) up -d redis
	@container_id=$$($(DOCKER_COMPOSE) ps -q redis); \
	if [ -z "$$container_id" ]; then \
		echo "Redis container was not created."; \
		exit 1; \
	fi; \
	echo "Waiting for Redis to become healthy..."; \
	for i in $$(seq 1 30); do \
		status=$$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $$container_id 2>/dev/null || true); \
		if [ "$$status" = "healthy" ] || [ "$$status" = "running" ]; then \
			echo "Redis is $$status."; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "Timed out waiting for Redis health."; \
	exit 1

redis-down:
	@$(DOCKER_COMPOSE) stop redis

service: redis-up
	npm --prefix server start

service-dev: redis-up
	npm --prefix server run dev

client:
	npm run dev

client-dev:
	npm run dev:vite

fullstack-dev:
	@echo "Run these in separate terminals:"
	@echo "  make service-dev"
	@echo "  make client"
