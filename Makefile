.PHONY: build test clean audits

build:
	go build ./...

test:
	go test ./... -v

clean:
	rm -rf ./build ./dist

audits:
	@echo "Audit reports available in ./audits/"
	@ls -la audits/

verify-readme:
	@echo "Checking README..."
	@test -f README.md
	@grep -q "Ability to Exit" README.md
	@grep -q "Verifiability" README.md
	@echo "README verified."

check-exit-docs:
	@echo "Checking exit documentation..."
	@test -f docs/exiting.md
	@grep -q "Timelock Withdrawal" docs/exiting.md
	@grep -q "On-Demand Unbonding" docs/exiting.md
	@echo "Exit docs verified."

.PHONY: lint
lint:
	golangci-lint run
